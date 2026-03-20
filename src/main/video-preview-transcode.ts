import { app } from 'electron'
import { createHash } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { stat } from 'fs/promises'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { findBin } from './find-bin'

const execFileAsync = promisify(execFile)

let ffmpegAvailable: boolean | null = null

function getCacheDir(): string {
  const dir = join(app.getPath('userData'), 'video-preview-cache')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function cacheFilePath(sourcePath: string, mtimeMs: number, size: number): string {
  const h = createHash('sha256')
    .update(sourcePath)
    .update('\0')
    .update(String(mtimeMs))
    .update('\0')
    .update(String(size))
    .digest('hex')
    .slice(0, 40)
  return join(getCacheDir(), `${h}.mp4`)
}

/** Codecs Chromium usually plays in a plain HTML video element. */
function isBrowserFriendlyCodec(codec: string): boolean {
  const c = codec.trim().toLowerCase()
  return (
    c === 'h264' ||
    c === 'avc' ||
    c === 'avc1' ||
    c === 'mpeg4' ||
    c === 'mp4v' ||
    c === 'vp8' ||
    c === 'vp9' ||
    c === 'av1' ||
    c === 'av01'
  )
}

async function ffprobeVideoCodec(filePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(findBin('ffprobe'), [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath
    ])
    const name = stdout.trim()
    return name.length > 0 ? name : null
  } catch {
    return null
  }
}

async function ffmpegInstalled(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable
  try {
    await execFileAsync(findBin('ffmpeg'), ['-version'])
    ffmpegAvailable = true
    return true
  } catch {
    ffmpegAvailable = false
    return false
  }
}

async function transcodeToH264Mp4(sourcePath: string, destPath: string): Promise<void> {
  try {
    const result = await execFileAsync(findBin('ffmpeg'), [
      '-hide_banner', '-loglevel', 'error',
      '-y',
      '-i', sourcePath,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      destPath
    ])
    if (result.stderr) console.error('[transcode] ffmpeg stderr:', result.stderr)
  } catch (err) {
    console.error('[transcode] ffmpeg failed:', err)
    throw err
  }
}

const inflight = new Map<string, Promise<string>>()

/**
 * Returns a filesystem path to feed into the media:// preview (original or cached H.264 MP4).
 */
export async function resolvePathForVideoPreview(absPath: string): Promise<string> {
  let st: Awaited<ReturnType<typeof stat>>
  try {
    st = await stat(absPath)
  } catch {
    return absPath
  }

  const identity = `${absPath}\0${st.mtimeMs}\0${st.size}`
  const pending = inflight.get(identity)
  if (pending) return pending

  const work = (async (): Promise<string> => {
    if (!(await ffmpegInstalled())) return absPath

    const codec = await ffprobeVideoCodec(absPath)
    if (codec === null) return absPath
    if (isBrowserFriendlyCodec(codec)) return absPath

    const out = cacheFilePath(absPath, st.mtimeMs, st.size)
    if (existsSync(out)) {
      try {
        const ost = await stat(out)
        if (ost.size > 0) return out
      } catch {
        /* regenerate */
      }
    }

    try {
      await transcodeToH264Mp4(absPath, out)
      const ost = await stat(out)
      if (ost.size > 0) return out
    } catch {
      /* fall through */
    }
    return absPath
  })()

  const p = work.finally(() => {
    inflight.delete(identity)
  })
  inflight.set(identity, p)
  return p
}
