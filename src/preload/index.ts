import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  Session,
  MediaFile,
  ScanProgress,
  CopyProgress,
  CopyResult,
  CopyAction,
  DependencyStatus,
  ErrorEntry
} from '../shared/types'

const api = {
  // Sessions
  sessions: {
    list: (): Promise<Session[]> => ipcRenderer.invoke('sessions:list'),
    get: (id: string): Promise<Session | null> => ipcRenderer.invoke('sessions:get', id),
    create: (
      name: string,
      sourceFolders: string[],
      outputFolder: string,
      transferMode: 'copy' | 'move'
    ): Promise<Session> =>
      ipcRenderer.invoke('sessions:create', name, sourceFolders, outputFolder, transferMode),
    update: (session: Session): Promise<void> => ipcRenderer.invoke('sessions:update', session),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('sessions:delete', id)
  },

  // File system dialogs
  dialog: {
    openFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),
    pathExists: (path: string): Promise<boolean> => ipcRenderer.invoke('dialog:pathExists', path),
    openFolderInFinder: (path: string): Promise<void> =>
      ipcRenderer.invoke('dialog:openFolderInFinder', path),
    openFile: (path: string): Promise<void> => ipcRenderer.invoke('dialog:openFile', path),
    trashFile: (path: string): Promise<void> => ipcRenderer.invoke('dialog:trashFile', path),
    renameFile: (oldPath: string, newName: string): Promise<string> =>
      ipcRenderer.invoke('dialog:renameFile', oldPath, newName),
    resolveDestPaths: (outputFolder: string, fileNames: string[]): Promise<Record<string, string>> =>
      ipcRenderer.invoke('dialog:resolveDestPaths', outputFolder, fileNames),
    readImageAsDataUrl: (path: string): Promise<string | null> =>
      ipcRenderer.invoke('dialog:readImageAsDataUrl', path),
    pathToFileUrl: (path: string): Promise<string> => ipcRenderer.invoke('dialog:pathToFileUrl', path),
    mediaPreviewUrl: (path: string): Promise<string> =>
      ipcRenderer.invoke('dialog:mediaPreviewUrl', path)
  },

  // Scanner
  scanner: {
    scan: (sessionId: string, sourceFolders: string[]): Promise<MediaFile[]> =>
      ipcRenderer.invoke('scanner:scan', sessionId, sourceFolders),
    scanNew: (sessionId: string, newFolder: string, existingPaths: string[]): Promise<MediaFile[]> =>
      ipcRenderer.invoke('scanner:scanNew', sessionId, newFolder, existingPaths),
    cancel: (): Promise<void> => ipcRenderer.invoke('scanner:cancel'),
    onProgress: (cb: (progress: ScanProgress) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, progress: ScanProgress): void => cb(progress)
      ipcRenderer.on('scanner:progress', handler)
      return () => ipcRenderer.removeListener('scanner:progress', handler)
    }
  },

  // Thumbnails
  thumbnails: {
    generate: (filePath: string, fileId: string): Promise<string | null> =>
      ipcRenderer.invoke('thumbnails:generate', filePath, fileId),
    generateBatch: (files: { filePath: string; fileId: string }[]): Promise<void> =>
      ipcRenderer.invoke('thumbnails:generateBatch', files),
    cancelBatch: (): Promise<void> =>
      ipcRenderer.invoke('thumbnails:cancelBatch'),
    onReady: (cb: (fileId: string, dataUrl: string) => void): (() => void) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        fileId: string,
        dataUrl: string
      ): void => cb(fileId, dataUrl)
      ipcRenderer.on('thumbnails:ready', handler)
      return () => ipcRenderer.removeListener('thumbnails:ready', handler)
    }
  },

  // Metadata / date fixing
  metadata: {
    checkDependencies: (): Promise<DependencyStatus> =>
      ipcRenderer.invoke('metadata:checkDependencies'),
    fixDate: (filePath: string, newDate: string): Promise<void> =>
      ipcRenderer.invoke('metadata:fixDate', filePath, newDate)
  },

  // Copy engine
  copy: {
    preview: (fileIds: string[], sessionId: string): Promise<CopyAction[]> =>
      ipcRenderer.invoke('copy:preview', fileIds, sessionId),
    execute: (actions: CopyAction[], sessionId: string): Promise<CopyResult> =>
      ipcRenderer.invoke('copy:execute', actions, sessionId),
    cancel: (): Promise<void> => ipcRenderer.invoke('copy:cancel'),
    onProgress: (cb: (progress: CopyProgress) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, progress: CopyProgress): void =>
        cb(progress)
      ipcRenderer.on('copy:progress', handler)
      return () => ipcRenderer.removeListener('copy:progress', handler)
    }
  },

  // Error log
  errors: {
    retry: (entries: ErrorEntry[], sessionId: string): Promise<void> =>
      ipcRenderer.invoke('errors:retry', entries, sessionId)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
