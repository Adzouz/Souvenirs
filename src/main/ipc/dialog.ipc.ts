import { ipcMain, dialog, shell } from 'electron'
import { readFile, unlink } from 'fs/promises'
import { extname } from 'path'
import { pathToFileURL } from 'url'
import { execFile } from 'child_process'
import { getMainWindow } from '../index'
import { createMediaPreviewUrl } from '../media-preview-protocol'
import { resolvePathForVideoPreview } from '../video-preview-transcode'

export function registerDialogHandlers(): void {
  ipcMain.handle('dialog:openFolder', async (): Promise<string | null> => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:openFolderInFinder', async (_, path: string): Promise<void> => {
    await shell.openPath(path)
  })

  ipcMain.handle('dialog:openFile', async (_, path: string): Promise<void> => {
    await shell.openPath(path)
  })

  ipcMain.handle('dialog:trashFile', async (_, path: string): Promise<void> => {
    await shell.trashItem(path)
  })

  /** Correct file:// URL for <img>/<video> src (encoding, Windows drives, etc.) */
  ipcMain.handle('dialog:pathToFileUrl', (_, path: string): string => {
    return pathToFileURL(path).href
  })

  /**
   * media:// URL for <video>. HEVC / ProRes / etc. are transcoded to cached H.264 MP4 when ffmpeg
   * + ffprobe are available (see video-preview-transcode).
   */
  ipcMain.handle('dialog:mediaPreviewUrl', async (_, path: string): Promise<string> => {
    const previewPath = await resolvePathForVideoPreview(path)
    return createMediaPreviewUrl(previewPath)
  })

  ipcMain.handle('dialog:readImageAsDataUrl', async (_, path: string): Promise<string | null> => {
    try {
      const ext = extname(path).slice(1).toLowerCase()
      const isHeic = ext === 'heic' || ext === 'heif'

      if (isHeic) {
        // Chromium can't decode HEIC — use macOS sips to convert to JPEG
        const tmp = path + '.lightbox_tmp.jpg'
        try {
          await new Promise<void>((resolve, reject) => {
            execFile('sips', ['-s', 'format', 'jpeg', path, '--out', tmp],
              (err) => (err ? reject(err) : resolve()))
          })
          const buf = await readFile(tmp)
          return `data:image/jpeg;base64,${buf.toString('base64')}`
        } finally {
          try { await unlink(tmp) } catch { /* ignore */ }
        }
      }

      const data = await readFile(path)
      const mime =
        ext === 'png' ? 'image/png'
        : ext === 'webp' ? 'image/webp'
        : ext === 'gif' ? 'image/gif'
        : 'image/jpeg'
      return `data:${mime};base64,${data.toString('base64')}`
    } catch {
      return null
    }
  })
}
