import { app, shell, BrowserWindow, Notification } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerSessionHandlers } from './ipc/sessions.ipc'
import { registerDialogHandlers } from './ipc/dialog.ipc'
import { registerScannerHandlers } from './ipc/scanner.ipc'
import { registerThumbnailHandlers } from './ipc/thumbnails.ipc'
import { registerMetadataHandlers } from './ipc/metadata.ipc'
import { registerCopyHandlers } from './ipc/copy.ipc'
import { registerErrorHandlers } from './ipc/errors.ipc'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function sendNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.media-sorter')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register all IPC handlers
  registerSessionHandlers()
  registerDialogHandlers()
  registerScannerHandlers()
  registerThumbnailHandlers()
  registerMetadataHandlers()
  registerCopyHandlers()
  registerErrorHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
