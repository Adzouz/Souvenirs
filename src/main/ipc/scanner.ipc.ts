import { ipcMain } from 'electron'
import { readdir, stat } from 'fs/promises'
import { createReadStream } from 'fs'
import { join, extname, basename } from 'path'
import { createHash } from 'crypto'
import { exiftool } from 'exiftool-vendored'
import { getMainWindow } from '../index'
import { sessionStore } from '../session-store'
import type { MediaFile, ScanProgress, DateStatus } from '../../shared/types'

// Supported MIME types by extension
const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  heic: 'image/heic',
  heif: 'image/heif',
  png: 'image/png',
  webp: 'image/webp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  gif: 'image/gif',
  bmp: 'image/bmp',
  cr2: 'image/x-canon-cr2',
  cr3: 'image/x-canon-cr3',
  nef: 'image/x-nikon-nef',
  arw: 'image/x-sony-arw',
  dng: 'image/x-adobe-dng',
  raf: 'image/x-fuji-raf',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  wmv: 'video/x-ms-wmv',
  '3gp': 'video/3gpp'
}

let cancelled = false

async function walkDirectory(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('._')) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = await walkDirectory(fullPath)
      files.push(...nested)
    } else if (entry.isFile()) {
      const ext = extname(entry.name).slice(1).toLowerCase()
      if (MIME_MAP[ext]) files.push(fullPath)
    }
  }
  return files
}

function hashPath(filePath: string): string {
  return createHash('sha1').update(filePath).digest('hex').slice(0, 16)
}

const FULL_HASH_THRESHOLD = 100 * 1024 * 1024 // 100 MB — hash entire file below this
const PARTIAL_HASH_BYTES = 65536 // 64 KB sampled from the middle for large files

function contentHash(filePath: string, fileSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1')
    // For typical photo/video sizes, hash the whole file — reliable and fast enough.
    // For very large files, sample 64 KB from the middle to skip header metadata.
    const streamOpts =
      fileSize > FULL_HASH_THRESHOLD
        ? { start: Math.floor(fileSize / 2), end: Math.floor(fileSize / 2) + PARTIAL_HASH_BYTES - 1 }
        : undefined
    const stream = createReadStream(filePath, streamOpts)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

// Hash that skips the first 128 KB to avoid EXIF/metadata headers.
// Used for processed detection: exiftool date-fixing rewrites the header,
// changing both the file size and full hash, but the pixel/frame data is stable.
const PROCESSED_SKIP = 131072  // 128 KB skip
const PROCESSED_SAMPLE = 131072 // 128 KB sample

function contentHashSkipHeader(filePath: string, fileSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1')
    const start = Math.min(PROCESSED_SKIP, Math.floor(fileSize / 2))
    const end = Math.min(start + PROCESSED_SAMPLE - 1, fileSize - 1)
    const stream = createReadStream(filePath, { start, end })
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

function toISO(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  try {
    // exiftool-vendored returns ExifDateTime objects or strings
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return null
    return d.toISOString()
  } catch {
    return null
  }
}

async function getFsCreationDate(filePath: string): Promise<string | null> {
  try {
    const stats = await stat(filePath)
    // birthtime is the creation date on macOS
    const birth = stats.birthtime
    if (!birth || birth.getTime() === 0) return null
    return birth.toISOString()
  } catch {
    return null
  }
}

export function registerScannerHandlers(): void {
  ipcMain.handle(
    'scanner:scan',
    async (_event, _sessionId: string, sourceFolders: string[]): Promise<MediaFile[]> => {
      cancelled = false
      const win = getMainWindow()

      // Look up session early to know the output folder
      const session = sessionStore.get('sessions').find((s) => s.id === _sessionId)
      const outputFolder = session?.outputFolder ?? null

      // ── First pass: collect all file paths ──────────────────────────────────
      const sourcePaths: string[] = []
      for (const folder of sourceFolders) {
        const paths = await walkDirectory(folder)
        sourcePaths.push(...paths)
      }

      let rawDestPaths: string[] = []
      if (outputFolder) {
        try { rawDestPaths = await walkDirectory(outputFolder) } catch { /* not yet created */ }
      }

      // Exclude destination paths already present in source (e.g. output folder inside a source folder)
      const sourcePathSet = new Set(sourcePaths)
      const destPaths = rawDestPaths.filter((p) => !sourcePathSet.has(p))
      const destPathSet = new Set(destPaths)

      const allPaths = [...sourcePaths, ...destPaths]
      const total = allPaths.length
      let scanned = 0
      let found = 0
      let skipped = 0

      // ── Second pass: EXIF + stat ─────────────────────────────────────────────
      const sourceFiles: MediaFile[] = []
      const destFiles: MediaFile[] = []

      for (const filePath of allPaths) {
        if (cancelled) break

        scanned++
        win?.webContents.send('scanner:progress', { total, scanned, found, skipped, current: basename(filePath), phase: 'scanning' } satisfies ScanProgress)

        try {
          const stats = await stat(filePath)
          const ext = extname(filePath).slice(1).toLowerCase()
          const mimeType = MIME_MAP[ext] ?? 'application/octet-stream'
          const name = basename(filePath)

          // Read EXIF metadata — try multiple date fields in priority order
          const tags = await exiftool.read(filePath)
          const exifDateRaw =
            tags.CreateDate?.toString() ||
            tags.DateTimeOriginal?.toString() ||
            tags.FileCreateDate?.toString() ||
            null

          const exifDate = toISO(exifDateRaw ?? undefined)
          const fsDate = await getFsCreationDate(filePath)
          const fsMtimeDate = toISO(tags.FileModifyDate?.toString())

          let dateStatus: DateStatus = 'missing'
          const fsDates = [fsDate, fsMtimeDate].filter(Boolean) as string[]
          if (exifDate && fsDates.length > 0) {
            // ok if EXIF matches any filesystem date (creation or modification) — date only, ignoring time
            const exifDay = exifDate.slice(0, 10)
            const matchesAny = fsDates.some((d) => d.slice(0, 10) === exifDay)
            dateStatus = matchesAny ? 'ok' : 'mismatch'
          } else if (exifDate || fsDates.length > 0) {
            dateStatus = 'mismatch' // one side is missing
          }

          const resolvedDate = exifDate ?? fsDate
          const resolvedYear = resolvedDate ? new Date(resolvedDate).getFullYear() : null
          const isDestFile = destPathSet.has(filePath)

          const file: MediaFile = {
            id: hashPath(filePath),
            path: filePath,
            name,
            ext,
            size: stats.size,
            mimeType,
            exifDate,
            fsDate,
            fsMtimeDate,
            resolvedDate,
            resolvedYear,
            dateStatus,

            status: 'pending',
            processed: isDestFile, // destination files are inherently processed
            duplicateGroupId: null,
            duplicateType: null,
            overrideDate: null,
            dateFixed: false,
            destPath: null,
            errorMessage: null
          }

          if (isDestFile) {
            destFiles.push(file)
          } else {
            sourceFiles.push(file)
          }
          found++
        } catch (err) {
          skipped++
          console.error(`Error scanning ${filePath}:`, err)
        }
      }

      // ── Name duplicates (source files only) ──────────────────────────────────
      const nameYearMap = new Map<string, MediaFile[]>()
      for (const f of sourceFiles) {
        const key = `${f.name}::${f.resolvedYear ?? 'nodate'}`
        const existing = nameYearMap.get(key) ?? []
        nameYearMap.set(key, [...existing, f])
      }
      for (const [, group] of nameYearMap) {
        if (group.length > 1) {
          const groupId = hashPath(group.map((f) => f.path).join('|'))
          group.forEach((f) => {
            f.duplicateGroupId = groupId
            f.duplicateType = 'name'
          })
        }
      }

      // ── Content duplicates (source files only) ────────────────────────────────
      let hashed = 0
      const hashResults = await Promise.all(
        sourceFiles.map(async (f) => {
          try {
            const hash = await contentHash(f.path, f.size)
            hashed++
            win?.webContents.send('scanner:progress', {
              total: sourceFiles.length, scanned: hashed, found: hashed, skipped: 0,
              current: f.name, phase: 'hashing'
            } satisfies ScanProgress)
            return { f, hash }
          } catch {
            hashed++
            return null
          }
        })
      )
      const contentMap = new Map<string, MediaFile[]>()
      for (const result of hashResults) {
        if (!result) continue
        const existing = contentMap.get(result.hash) ?? []
        existing.push(result.f)
        contentMap.set(result.hash, existing)
      }
      for (const [, group] of contentMap) {
        if (group.length < 2) continue
        // Skip if every file is already in the same name-duplicate group
        const nameGroupIds = new Set(group.map((f) => f.duplicateGroupId).filter(Boolean))
        if (nameGroupIds.size === 1 && group.every((f) => f.duplicateGroupId)) continue

        // If some files already have a group (name conflict), pull ungrouped files into
        // that existing group rather than creating an orphaned singleton group.
        const existingGroupId = group.find((f) => f.duplicateGroupId)?.duplicateGroupId
        const groupId = existingGroupId ?? hashPath(group.map((f) => f.path).join('|'))
        group.forEach((f) => {
          if (!f.duplicateGroupId) {
            f.duplicateGroupId = groupId
            f.duplicateType = 'content'
          }
        })
      }

      // ── Processed detection: match source ↔ destination by skip-header hash ──
      // Skipping the first 128 KB means EXIF rewrites (date-fix) don't break matching.
      // Source files with a matching dest file are marked processed; their dest counterpart
      // is dropped to avoid duplicate entries. Only destination-only files remain in results.
      if (destFiles.length > 0) {
        const allMatchFiles = [...destFiles, ...sourceFiles]
        let matched = 0
        const sendMatchProgress = (name: string): void => {
          matched++
          win?.webContents.send('scanner:progress', {
            total: allMatchFiles.length, scanned: matched, found: matched, skipped: 0,
            current: name, phase: 'matching'
          } satisfies ScanProgress)
        }

        // Map hash → all dest files with that hash (same content copied multiple times)
        const destSkipHashes = new Map<string, MediaFile[]>()
        await Promise.all(
          destFiles.map(async (f) => {
            try {
              const h = await contentHashSkipHeader(f.path, f.size)
              const bucket = destSkipHashes.get(h) ?? []
              bucket.push(f)
              destSkipHashes.set(h, bucket)
            } catch { /* ignore */ }
            sendMatchProgress(f.name)
          })
        )

        const matchedDestIds = new Set<string>()
        await Promise.all(
          sourceFiles.map(async (f) => {
            try {
              const h = await contentHashSkipHeader(f.path, f.size)
              const bucket = destSkipHashes.get(h)
              if (bucket && bucket.length > 0) {
                const destFile = bucket[0]
                f.processed = true
                f.destPath = destFile.path
                // Mark ALL dest copies as matched so none appear as duplicates
                bucket.forEach((d) => matchedDestIds.add(d.id))
                // Destination has ok date but source didn't → date was fixed during copy
                if (f.dateStatus !== 'ok' && destFile.dateStatus === 'ok') {
                  f.dateFixed = true
                  // Show the corrected date from the destination, not the source's bad date
                  f.exifDate = destFile.exifDate
                  f.resolvedDate = destFile.resolvedDate
                  f.resolvedYear = destFile.resolvedYear
                  f.dateStatus = 'ok'
                }
              }
            } catch { /* ignore */ }
            sendMatchProgress(f.name)
          })
        )

        // Fallback: match unmatched source files by filename.
        // exiftool date-fixing can shift file content enough to break skip-header hashes,
        // so filename is used as a secondary signal for already-processed files.
        const destByName = new Map<string, MediaFile>()
        for (const f of destFiles) {
          if (!destByName.has(f.name)) destByName.set(f.name, f)
        }
        for (const f of sourceFiles) {
          if (f.processed) continue
          const destFile = destByName.get(f.name)
          if (destFile && !matchedDestIds.has(destFile.id)) {
            f.processed = true
            f.destPath = destFile.path
            matchedDestIds.add(destFile.id)
            if (f.dateStatus !== 'ok' && destFile.dateStatus === 'ok') {
              f.dateFixed = true
              f.exifDate = destFile.exifDate
              f.resolvedDate = destFile.resolvedDate
              f.resolvedYear = destFile.resolvedYear
              f.dateStatus = 'ok'
            }
          }
        }

        // Only keep destination files that have no matching source file
        const destinationOnlyFiles = destFiles.filter((f) => !matchedDestIds.has(f.id))
        return [...sourceFiles, ...destinationOnlyFiles]
      }

      return sourceFiles
    }
  )

  // Incremental scan: only scans newFolder, skips paths already known to the session.
  // Returns only the new MediaFile entries to be merged into the existing list.
  ipcMain.handle(
    'scanner:scanNew',
    async (_event, _sessionId: string, newFolder: string, existingPaths: string[]): Promise<MediaFile[]> => {
      cancelled = false
      const win = getMainWindow()

      const session = sessionStore.get('sessions').find((s) => s.id === _sessionId)
      const outputFolder = session?.outputFolder ?? null

      const existingPathSet = new Set(existingPaths)
      const allPaths = (await walkDirectory(newFolder)).filter((p) => !existingPathSet.has(p))

      const total = allPaths.length
      let scanned = 0
      let found = 0
      let skipped = 0
      const newFiles: MediaFile[] = []

      for (const filePath of allPaths) {
        if (cancelled) break
        scanned++
        win?.webContents.send('scanner:progress', {
          total, scanned, found, skipped, current: basename(filePath), phase: 'scanning'
        } satisfies ScanProgress)

        try {
          const stats = await stat(filePath)
          const ext = extname(filePath).slice(1).toLowerCase()
          const mimeType = MIME_MAP[ext] ?? 'application/octet-stream'
          const name = basename(filePath)

          const tags = await exiftool.read(filePath)
          const exifDateRaw =
            tags.CreateDate?.toString() ||
            tags.DateTimeOriginal?.toString() ||
            tags.FileCreateDate?.toString() ||
            null

          const exifDate = toISO(exifDateRaw ?? undefined)
          const fsDate = await getFsCreationDate(filePath)
          const fsMtimeDate = toISO(tags.FileModifyDate?.toString())

          let dateStatus: DateStatus = 'missing'
          const fsDates = [fsDate, fsMtimeDate].filter(Boolean) as string[]
          if (exifDate && fsDates.length > 0) {
            const exifDay = exifDate.slice(0, 10)
            dateStatus = fsDates.some((d) => d.slice(0, 10) === exifDay) ? 'ok' : 'mismatch'
          } else if (exifDate || fsDates.length > 0) {
            dateStatus = 'mismatch'
          }

          const resolvedDate = exifDate ?? fsDate
          const resolvedYear = resolvedDate ? new Date(resolvedDate).getFullYear() : null

          newFiles.push({
            id: hashPath(filePath),
            path: filePath,
            name,
            ext,
            size: stats.size,
            mimeType,
            exifDate,
            fsDate,
            fsMtimeDate,
            resolvedDate,
            resolvedYear,
            dateStatus,

            status: 'pending',
            processed: false,
            duplicateGroupId: null,
            duplicateType: null,
            overrideDate: null,
            dateFixed: false,
            destPath: null,
            errorMessage: null
          })
          found++
        } catch (err) {
          skipped++
          console.error(`Error scanning ${filePath}:`, err)
        }
      }

      // Check new files against destination (skip-header hash)
      if (outputFolder && newFiles.length > 0) {
        try {
          const destPaths = await walkDirectory(outputFolder)
          let matched = 0
          win?.webContents.send('scanner:progress', {
            total: destPaths.length + newFiles.length, scanned: matched,
            found: matched, skipped: 0, current: '', phase: 'matching'
          } satisfies ScanProgress)

          const destSkipHashes = new Map<string, string>()
          await Promise.all(destPaths.map(async (p) => {
            try {
              const s = await stat(p)
              const h = await contentHashSkipHeader(p, s.size)
              destSkipHashes.set(h, p)
            } catch { /* ignore */ }
            matched++
            win?.webContents.send('scanner:progress', {
              total: destPaths.length + newFiles.length, scanned: matched,
              found: matched, skipped: 0, current: basename(p), phase: 'matching'
            } satisfies ScanProgress)
          }))

          await Promise.all(newFiles.map(async (f) => {
            try {
              const h = await contentHashSkipHeader(f.path, f.size)
              if (destSkipHashes.has(h)) f.processed = true
            } catch { /* ignore */ }
          }))
        } catch { /* output folder doesn't exist */ }
      }

      return newFiles
    }
  )

  ipcMain.handle('scanner:cancel', (): void => {
    cancelled = true
  })
}
