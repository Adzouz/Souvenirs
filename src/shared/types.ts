export type DateStatus = 'ok' | 'mismatch' | 'missing'
export type FileStatus = 'pending' | 'queued' | 'copied' | 'moved' | 'skipped' | 'error'
export type ViewMode = 'list' | 'grid'
export type TransferMode = 'copy' | 'move'

export interface MediaFile {
  id: string // sha1-like hash of the full path
  path: string // absolute source path
  name: string // filename with extension
  ext: string // lowercase extension without dot
  size: number // bytes
  mimeType: string // image/jpeg, video/mp4, etc.
  exifDate: string | null // ISO 8601 from CreateDate / DateTimeOriginal / FileCreateDate
  fsDate: string | null // ISO 8601 from filesystem creation date
  resolvedDate: string | null // best available (exif wins over fs)
  resolvedYear: number | null
  dateStatus: DateStatus
  thumbnail: string | null // base64 data URL
  status: FileStatus
  processed: boolean // already exists in destination YYYY/ folder
  duplicateGroupId: string | null // set when multiple files share the same name+year or content
  duplicateType: 'name' | 'content' | null // how the duplicate was detected
  errorMessage: string | null
}

export interface DuplicateGroup {
  id: string
  year: number | null
  targetName: string // the filename that would conflict
  files: MediaFile[]
}

export interface CopyAction {
  fileId: string
  sourcePath: string
  destPath: string
  willRename: boolean
  proposedName: string
  fixDate: boolean
  fixedDate: string | null
  isDuplicate: boolean
}

export interface Session {
  id: string
  name: string
  createdAt: string
  lastAccessedAt: string
  sourceFolders: string[]
  outputFolder: string | null
  transferMode: TransferMode
  files: MediaFile[]
  errorLog: ErrorEntry[]
}

export interface ErrorEntry {
  id: string
  timestamp: string
  fileId: string | null
  filePath: string | null
  operation: 'scan' | 'copy' | 'date-fix' | 'thumbnail'
  message: string
  retried: boolean
}

export interface ScanProgress {
  total: number
  scanned: number
  found: number
  current: string
}

export interface CopyProgress {
  total: number
  copied: number
  failed: number
  current: string
}

/** Final counts from copy/move execution (do not rely on the last progress event). */
export interface CopyResult {
  copied: number
  failed: number
}

export interface DependencyStatus {
  exiftool: boolean
  setFile: boolean
  ffmpeg: boolean
  exiftoolVersion?: string
}

export interface YearGroup {
  year: number | null // null = "No Date"
  label: string
  total: number
  processed: number
  pending: number
}
