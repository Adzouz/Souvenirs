import { ElectronAPI } from '@electron-toolkit/preload'
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

interface Api {
  sessions: {
    list: () => Promise<Session[]>
    get: (id: string) => Promise<Session | null>
    create: (name: string, sourceFolders: string[], outputFolder: string, transferMode: 'copy' | 'move') => Promise<Session>
    update: (session: Session) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  dialog: {
    openFolder: () => Promise<string | null>
    pathExists: (path: string) => Promise<boolean>
    openFolderInFinder: (path: string) => Promise<void>
    openFile: (path: string) => Promise<void>
    trashFile: (path: string) => Promise<void>
    readImageAsDataUrl: (path: string) => Promise<string | null>
    pathToFileUrl: (path: string) => Promise<string>
    mediaPreviewUrl: (path: string) => Promise<string>
  }
  scanner: {
    scan: (sessionId: string, sourceFolders: string[]) => Promise<MediaFile[]>
    cancel: () => Promise<void>
    onProgress: (cb: (progress: ScanProgress) => void) => () => void
  }
  thumbnails: {
    generate: (filePath: string, fileId: string) => Promise<string | null>
    generateBatch: (files: { filePath: string; fileId: string }[]) => Promise<void>
    cancelBatch: () => Promise<void>
    onReady: (cb: (fileId: string, dataUrl: string) => void) => () => void
  }
  metadata: {
    checkDependencies: () => Promise<DependencyStatus>
    fixDate: (filePath: string, newDate: string) => Promise<void>
  }
  copy: {
    preview: (fileIds: string[], sessionId: string) => Promise<CopyAction[]>
    execute: (actions: CopyAction[], sessionId: string) => Promise<CopyResult>
    cancel: () => Promise<void>
    onProgress: (cb: (progress: CopyProgress) => void) => () => void
  }
  errors: {
    retry: (entries: ErrorEntry[], sessionId: string) => Promise<void>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
