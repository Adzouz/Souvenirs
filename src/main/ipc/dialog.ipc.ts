import { ipcMain, dialog, shell } from 'electron'
import { readFile } from 'fs/promises'
import { extname } from 'path'
import { getMainWindow } from '../index'

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

  ipcMain.handle('dialog:readImageAsDataUrl', async (_, path: string): Promise<string | null> => {
    try {
      const data = await readFile(path)
      const ext = extname(path).slice(1).toLowerCase()
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'png' ? 'image/png'
        : ext === 'webp' ? 'image/webp'
        : ext === 'gif' ? 'image/gif'
        : ext === 'heic' || ext === 'heif' ? 'image/heic'
        : 'image/jpeg'
      return `data:${mime};base64,${data.toString('base64')}`
    } catch {
      return null
    }
  })
}
