import { ipcMain, app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync, readFileSync } from 'fs'
import { readFile } from 'fs/promises'
import sharp from 'sharp'
import { execFile } from 'child_process'
import { getMainWindow } from '../index'
import { findBin } from '../find-bin'

const THUMB_SIZE = 160
const THUMB_DIR = join(app.getPath('userData'), 'thumbnails')

if (!existsSync(THUMB_DIR)) {
  mkdirSync(THUMB_DIR, { recursive: true })
}

const IMAGE_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'gif', 'bmp'
])
const HEIC_EXTS = new Set(['heic', 'heif'])
const VIDEO_EXTS = new Set(['mp4', 'mov', 'm4v', 'avi', 'mkv', 'wmv', '3gp'])
const RAW_EXTS = new Set(['cr2', 'cr3', 'nef', 'arw', 'dng', 'raf'])

let currentBatchId = 0

// ─── Cache helpers ────────────────────────────────────────────────────────────

function thumbPath(fileId: string): string {
  return join(THUMB_DIR, `${fileId}.jpg`)
}

async function readCached(fileId: string): Promise<string | null> {
  const p = thumbPath(fileId)
  if (!existsSync(p)) return null
  const data = await readFile(p)
  return `data:image/jpeg;base64,${data.toString('base64')}`
}

// ─── Generators ───────────────────────────────────────────────────────────────

async function generateImageThumbnail(filePath: string, fileId: string): Promise<string | null> {
  const cached = await readCached(fileId)
  if (cached) return cached
  const tp = thumbPath(fileId)
  try {
    // failOn:'error' tolerates partial/tile warnings so corrupted-but-readable JPEGs still produce a thumb
    await sharp(filePath, { failOn: 'error' })
      .rotate() // apply EXIF orientation before resizing
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 75 })
      .toFile(tp)
    const data = await readFile(tp)
    return `data:image/jpeg;base64,${data.toString('base64')}`
  } catch {
    // Some JPEGs are actually HEIC/HEIF internally — fall back to sips
    try {
      const tmp = tp + '.conv.jpg'
      await new Promise<void>((resolve, reject) => {
        execFile('sips', ['-s', 'format', 'jpeg', filePath, '--out', tmp],
          (err) => (err ? reject(err) : resolve()))
      })
      await sharp(tmp, { failOn: 'error' })
        .rotate()
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 75 })
        .toFile(tp)
      require('fs').unlinkSync(tmp)
      const data = await readFile(tp)
      return `data:image/jpeg;base64,${data.toString('base64')}`
    } catch {
      return null
    }
  }
}

async function generateRawThumbnail(filePath: string, fileId: string): Promise<string | null> {
  const cached = await readCached(fileId)
  if (cached) return cached
  try {
    const tp = thumbPath(fileId)
    // Extract embedded JPEG preview via exiftool -b -PreviewImage
    await new Promise<void>((resolve, reject) => {
      const out = require('fs').createWriteStream(tp)
      const proc = execFile('exiftool', ['-b', '-PreviewImage', filePath])
      proc.stdout?.pipe(out)
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exiftool exit ${code}`))))
    })
    if (!existsSync(tp) || readFileSync(tp).length === 0) return null
    // Resize the extracted preview to our standard thumb size
    await sharp(tp)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 75 })
      .toFile(tp + '_tmp.jpg')
    const data = await readFile(tp + '_tmp.jpg')
    require('fs').renameSync(tp + '_tmp.jpg', tp)
    return `data:image/jpeg;base64,${data.toString('base64')}`
  } catch {
    return null
  }
}

async function generateHeicThumbnail(filePath: string, fileId: string): Promise<string | null> {
  const cached = await readCached(fileId)
  if (cached) return cached
  const tp = thumbPath(fileId)
  const tmp = tp + '.conv.jpg'
  try {
    // Use macOS sips to convert HEIC→JPEG, then resize with Sharp
    await new Promise<void>((resolve, reject) => {
      execFile('sips', ['-s', 'format', 'jpeg', filePath, '--out', tmp],
        (err) => (err ? reject(err) : resolve()))
    })
    await sharp(tmp)
      .rotate() // apply EXIF orientation before resizing
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 75 })
      .toFile(tp)
    require('fs').unlinkSync(tmp)
    const data = await readFile(tp)
    return `data:image/jpeg;base64,${data.toString('base64')}`
  } catch {
    try { require('fs').unlinkSync(tmp) } catch { /* ignore */ }
    return null
  }
}

async function generateVideoThumbnail(filePath: string, fileId: string): Promise<string | null> {
  const cached = await readCached(fileId)
  if (cached) return cached
  try {
    const tp = thumbPath(fileId)
    await new Promise<void>((resolve, reject) => {
      execFile(
        findBin('ffmpeg'),
        [
          '-ss', '00:00:01',
          '-i', filePath,
          '-vframes', '1',
          '-vf', `scale=${THUMB_SIZE}:${THUMB_SIZE}:force_original_aspect_ratio=increase,crop=${THUMB_SIZE}:${THUMB_SIZE}`,
          '-y', tp
        ],
        (err) => (err ? reject(err) : resolve())
      )
    })
    const data = await readFile(tp)
    return `data:image/jpeg;base64,${data.toString('base64')}`
  } catch {
    return null
  }
}

async function generate(filePath: string, fileId: string): Promise<string | null> {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  if (HEIC_EXTS.has(ext)) return generateHeicThumbnail(filePath, fileId)
  if (IMAGE_EXTS.has(ext)) return generateImageThumbnail(filePath, fileId)
  if (RAW_EXTS.has(ext)) return generateRawThumbnail(filePath, fileId)
  if (VIDEO_EXTS.has(ext)) return generateVideoThumbnail(filePath, fileId)
  return null
}

// ─── Concurrency pool ────────────────────────────────────────────────────────

async function runPool(
  tasks: (() => Promise<void>)[],
  concurrency: number,
  isCancelled: () => boolean
): Promise<void> {
  const queue = [...tasks]
  const worker = async (): Promise<void> => {
    while (queue.length > 0 && !isCancelled()) {
      const task = queue.shift()
      if (task) await task()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

export function registerThumbnailHandlers(): void {
  // Single generate (used for on-demand)
  ipcMain.handle(
    'thumbnails:generate',
    async (_, filePath: string, fileId: string): Promise<string | null> => {
      return generate(filePath, fileId)
    }
  )

  // Batch generate — processes all files with concurrency 4, emits thumbnails:ready per file
  ipcMain.handle(
    'thumbnails:generateBatch',
    async (_, files: { filePath: string; fileId: string }[]): Promise<void> => {
      const batchId = ++currentBatchId
      const win = getMainWindow()

      // Images first (fast), videos last (slow due to ffmpeg)
      const sorted = [...files].sort((a, b) => {
        const extA = a.filePath.split('.').pop()?.toLowerCase() ?? ''
        const extB = b.filePath.split('.').pop()?.toLowerCase() ?? ''
        const isVideoA = VIDEO_EXTS.has(extA) ? 1 : 0
        const isVideoB = VIDEO_EXTS.has(extB) ? 1 : 0
        return isVideoA - isVideoB
      })

      const isCancelled = (): boolean => currentBatchId !== batchId

      const sortedTasks = sorted.map(({ filePath, fileId }) => async () => {
        if (isCancelled()) return
        const dataUrl = await generate(filePath, fileId)
        if (dataUrl && !isCancelled()) {
          win?.webContents.send('thumbnails:ready', fileId, dataUrl)
        }
      })

      await runPool(sortedTasks, 4, isCancelled)
    }
  )

  ipcMain.handle('thumbnails:cancelBatch', (): void => {
    currentBatchId++ // invalidates any running batch
  })
}
