import { ipcMain } from 'electron'
import { join, dirname, basename, extname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { copy, move } from 'fs-extra'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { exiftool } from 'exiftool-vendored'
import { getMainWindow, sendNotification } from '../index'
import { sessionStore } from '../session-store'
import type { CopyAction, CopyProgress, CopyResult } from '../../shared/types'

const execFileAsync = promisify(execFile)

let cancelledCopy = false

function getDestPath(
  outputFolder: string,
  year: number | null,
  fileName: string
): string {
  const yearDir = year ? String(year) : 'NoDate'
  return join(outputFolder, yearDir, fileName)
}

function fileAlreadyExists(destPath: string): boolean {
  return existsSync(destPath)
}

export function registerCopyHandlers(): void {
  ipcMain.handle(
    'copy:preview',
    async (_, fileIds: string[], sessionId: string): Promise<CopyAction[]> => {
      const sessions = sessionStore.get('sessions')
      const session = sessions.find((s) => s.id === sessionId)
      if (!session || !session.outputFolder) return []

      const actions: CopyAction[] = []

      for (const fileId of fileIds) {
        const file = session.files.find((f) => f.id === fileId)
        if (!file) continue

        const yearDir = file.resolvedYear ? String(file.resolvedYear) : 'NoDate'
        let proposedName = file.name
        let willRename = false

        const destPath = getDestPath(session.outputFolder, file.resolvedYear, file.name)
        if (fileAlreadyExists(destPath)) {
          // Generate a unique name: YYYYMMDDHHmmss-{shortId}.ext
          const d = file.resolvedDate ? new Date(file.resolvedDate) : new Date()
          const stamp = [
            d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, '0'),
            String(d.getDate()).padStart(2, '0'),
            String(d.getHours()).padStart(2, '0'),
            String(d.getMinutes()).padStart(2, '0'),
            String(d.getSeconds()).padStart(2, '0')
          ].join('')
          const shortId = Math.random().toString(36).slice(2, 7)
          const ext = extname(file.name)
          proposedName = `${stamp}-${shortId}${ext}`
          willRename = true
        }

        actions.push({
          fileId,
          sourcePath: file.path,
          destPath: join(session.outputFolder, yearDir, proposedName),
          willRename,
          proposedName,
          fixDate: file.dateStatus !== 'ok',
          fixedDate: file.resolvedDate,
          isDuplicate: !!file.duplicateGroupId
        })
      }

      return actions
    }
  )

  ipcMain.handle(
    'copy:execute',
    async (_, actions: CopyAction[], sessionId: string): Promise<CopyResult> => {
      cancelledCopy = false
      const win = getMainWindow()
      const sessions = sessionStore.get('sessions')
      const session = sessions.find((s) => s.id === sessionId)
      if (!session) return { copied: 0, failed: 0 }

      let copied = 0
      let failed = 0
      const total = actions.length

      for (const action of actions) {
        if (cancelledCopy) break

        const progress: CopyProgress = {
          total,
          copied,
          failed,
          current: basename(action.sourcePath)
        }
        win?.webContents.send('copy:progress', progress)

        try {
          // Ensure destination directory exists
          mkdirSync(dirname(action.destPath), { recursive: true })

          // Copy or move file depending on session transfer mode
          if (session.transferMode === 'move') {
            await move(action.sourcePath, action.destPath, { overwrite: false })
          } else {
            await copy(action.sourcePath, action.destPath, { overwrite: false })
          }

          // Fix EXIF date on the copy if needed
          if (action.fixDate && action.fixedDate) {
            await exiftool.write(
              action.destPath,
              {
                CreateDate: action.fixedDate,
                DateTimeOriginal: action.fixedDate
              },
              ['-overwrite_original']
            )

            // Sync filesystem date on the copy (macOS)
            if (process.platform === 'darwin') {
              const d = new Date(action.fixedDate)
              const formatted = [
                String(d.getMonth() + 1).padStart(2, '0'),
                String(d.getDate()).padStart(2, '0'),
                d.getFullYear()
              ].join('/') + ' ' + [
                String(d.getHours()).padStart(2, '0'),
                String(d.getMinutes()).padStart(2, '0'),
                String(d.getSeconds()).padStart(2, '0')
              ].join(':')

              await execFileAsync('SetFile', ['-d', formatted, action.destPath]).catch(() => {})
            }
          }

          // Mark file as processed in session
          const fileIdx = session.files.findIndex((f) => f.id === action.fileId)
          if (fileIdx !== -1) {
            session.files[fileIdx].status = session.transferMode === 'move' ? 'moved' : 'copied'
            session.files[fileIdx].processed = true
          }

          copied++
        } catch (err) {
          failed++
          const fileIdx = session.files.findIndex((f) => f.id === action.fileId)
          if (fileIdx !== -1) {
            session.files[fileIdx].status = 'error'
            session.files[fileIdx].errorMessage = String(err)
          }
          session.errorLog.push({
            id: Math.random().toString(36).slice(2),
            timestamp: new Date().toISOString(),
            fileId: action.fileId,
            filePath: action.sourcePath,
            operation: 'copy',
            message: String(err),
            retried: false
          })
        }
      }

      // Persist updated session
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId ? { ...session, lastAccessedAt: new Date().toISOString() } : s
      )
      sessionStore.set('sessions', updatedSessions)

      // Final progress so the renderer has correct counts (last file never got a post-success event)
      win?.webContents.send('copy:progress', {
        total,
        copied,
        failed,
        current: ''
      })

      // Send OS notification
      const verb = session.transferMode === 'move' ? 'moved' : 'copied'
      sendNotification(
        `${session.transferMode === 'move' ? 'Move' : 'Copy'} complete`,
        `${copied} file${copied !== 1 ? 's' : ''} ${verb}${failed > 0 ? `, ${failed} failed` : ''}.`
      )

      return { copied, failed }
    }
  )

  ipcMain.handle('copy:cancel', (): void => {
    cancelledCopy = true
  })
}
