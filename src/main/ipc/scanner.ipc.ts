import { ipcMain } from 'electron'
import { readdir, stat, access } from 'fs/promises'
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
      const files: MediaFile[] = []

      // First pass: collect all file paths
      const allPaths: string[] = []
      for (const folder of sourceFolders) {
        const paths = await walkDirectory(folder)
        allPaths.push(...paths)
      }

      const total = allPaths.length
      let scanned = 0
      let found = 0

      for (const filePath of allPaths) {
        if (cancelled) break

        scanned++
        const progress: ScanProgress = {
          total,
          scanned,
          found,
          current: basename(filePath)
        }
        win?.webContents.send('scanner:progress', progress)

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

          let dateStatus: DateStatus = 'missing'
          if (exifDate && fsDate) {
            // Compare to the second (ignore milliseconds)
            const exifSec = exifDate.slice(0, 19)
            const fsSec = fsDate.slice(0, 19)
            dateStatus = exifSec === fsSec ? 'ok' : 'mismatch'
          } else if (exifDate || fsDate) {
            dateStatus = 'mismatch' // one side is missing
          }

          const resolvedDate = exifDate ?? fsDate
          const resolvedYear = resolvedDate
            ? new Date(resolvedDate).getFullYear()
            : null

          const file: MediaFile = {
            id: hashPath(filePath),
            path: filePath,
            name,
            ext,
            size: stats.size,
            mimeType,
            exifDate,
            fsDate,
            resolvedDate,
            resolvedYear,
            dateStatus,
            thumbnail: null,
            status: 'pending',
            processed: false,
            duplicateGroupId: null,
            duplicateType: null,
            errorMessage: null
          }

          files.push(file)
          found++
        } catch (err) {
          console.error(`Error scanning ${filePath}:`, err)
        }
      }

      // ── Name duplicates: same filename + same resolved year ──────────────────
      const nameYearMap = new Map<string, MediaFile[]>()
      for (const f of files) {
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

      // ── Content duplicates: same full hash (or mid-sample for large files) ────
      // Hash in parallel, then group sequentially to avoid Map race conditions.
      const hashResults = await Promise.all(
        files.map(async (f) => {
          try {
            const hash = await contentHash(f.path, f.size)
            return { f, hash }
          } catch {
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

        const groupId = hashPath(group.map((f) => f.path).join('|'))
        group.forEach((f) => {
          if (!f.duplicateGroupId) {
            f.duplicateGroupId = groupId
            f.duplicateType = 'content'
          }
        })
      }

      // Mark already-processed files: check if they exist in the output folder
      const session = sessionStore.get('sessions').find((s) => s.id === _sessionId)
      if (session?.outputFolder) {
        await Promise.all(
          files.map(async (f) => {
            const yearDir = f.resolvedYear ? String(f.resolvedYear) : 'NoDate'
            const destPath = join(session.outputFolder!, yearDir, f.name)
            try {
              await access(destPath)
              f.processed = true
            } catch {
              // file doesn't exist in destination — remains false
            }
          })
        )
      }

      return files
    }
  )

  ipcMain.handle('scanner:cancel', (): void => {
    cancelled = true
  })
}
