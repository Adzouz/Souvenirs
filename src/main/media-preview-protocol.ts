import { protocol } from 'electron'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { extname } from 'path'
import { Readable } from 'stream'
import { randomBytes } from 'crypto'

const pathByToken = new Map<string, string>()
const MAX_TOKENS = 256

function contentTypeForPath(filePath: string): string {
  const e = extname(filePath).slice(1).toLowerCase()
  switch (e) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'mp4':
    case 'm4v':
      return 'video/mp4'
    case 'mov':
      return 'video/quicktime'
    case 'webm':
      return 'video/webm'
    case 'mkv':
      return 'video/x-matroska'
    case 'avi':
      return 'video/x-msvideo'
    case '3gp':
      return 'video/3gpp'
    default:
      return 'application/octet-stream'
  }
}

/**
 * Stream local files for <video>/<img>. net.fetch(file://) is unreliable in Electron main;
 * Range support is required for many MP4/MOV demuxers.
 */
async function streamingFileResponse(filePath: string, request: Request): Promise<Response> {
  let st: Awaited<ReturnType<typeof stat>>
  try {
    st = await stat(filePath)
  } catch {
    return new Response(null, { status: 404 })
  }

  const size = st.size
  const mime = contentTypeForPath(filePath)
  const baseHeaders: Record<string, string> = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store'
  }

  if (size === 0) {
    return new Response(null, {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': '0' }
    })
  }

  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': String(size) }
    })
  }

  const rangeHeader = request.headers.get('range')

  if (rangeHeader) {
    const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
    if (!m) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` }
      })
    }
    let start = m[1] === '' ? 0 : parseInt(m[1], 10)
    let end = m[2] === '' ? size - 1 : parseInt(m[2], 10)
    if (Number.isNaN(start)) start = 0
    if (Number.isNaN(end)) end = size - 1
    if (start >= size) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` }
      })
    }
    if (end >= size) end = size - 1
    if (end < start) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` }
      })
    }
    const chunkSize = end - start + 1
    const nodeStream = createReadStream(filePath, { start, end })
    const webStream = Readable.toWeb(nodeStream) as globalThis.ReadableStream<Uint8Array>
    return new Response(webStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(chunkSize)
      }
    })
  }

  const nodeStream = createReadStream(filePath)
  const webStream = Readable.toWeb(nodeStream) as globalThis.ReadableStream<Uint8Array>
  return new Response(webStream, {
    status: 200,
    headers: {
      ...baseHeaders,
      'Content-Length': String(size)
    }
  })
}

/** Short-lived URL the renderer can use for <video> (and optionally images). */
export function createMediaPreviewUrl(absPath: string): string {
  if (pathByToken.size >= MAX_TOKENS) {
    const oldest = pathByToken.keys().next().value
    if (oldest !== undefined) pathByToken.delete(oldest)
  }
  const token = randomBytes(12).toString('hex')
  pathByToken.set(token, absPath)
  return `media://preview/${token}`
}

export function registerMediaPreviewProtocol(): void {
  protocol.handle('media', (request) => {
    let parsed: URL
    try {
      parsed = new URL(request.url)
    } catch {
      return Promise.resolve(new Response(null, { status: 400 }))
    }
    if (parsed.host !== 'preview') {
      return Promise.resolve(new Response(null, { status: 404 }))
    }
    const token = parsed.pathname.replace(/^\//, '')
    if (!token) return Promise.resolve(new Response(null, { status: 404 }))
    const filePath = pathByToken.get(token)
    if (!filePath) return Promise.resolve(new Response(null, { status: 404 }))

    return streamingFileResponse(filePath, request)
  })
}
