import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import type { Session } from '../../shared/types'
import { sessionStore } from '../session-store'

export function registerSessionHandlers(): void {
  ipcMain.handle('sessions:list', (): Session[] => {
    return sessionStore.get('sessions')
  })

  ipcMain.handle('sessions:get', (_, id: string): Session | null => {
    const sessions = sessionStore.get('sessions')
    return sessions.find((s) => s.id === id) ?? null
  })

  ipcMain.handle(
    'sessions:create',
    (_, name: string, sourceFolders: string[], outputFolder: string, transferMode: 'copy' | 'move' = 'copy'): Session => {
      const session: Session = {
        id: randomUUID(),
        name,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        sourceFolders,
        outputFolder,
        transferMode,
        files: [],
        errorLog: []
      }
      const sessions = sessionStore.get('sessions')
      sessionStore.set('sessions', [session, ...sessions])
      return session
    }
  )

  ipcMain.handle('sessions:update', (_, session: Session): void => {
    const sessions = sessionStore.get('sessions')
    const updated = sessions.map((s) =>
      s.id === session.id ? { ...session, lastAccessedAt: new Date().toISOString() } : s
    )
    sessionStore.set('sessions', updated)
  })

  ipcMain.handle('sessions:delete', (_, id: string): void => {
    const sessions = sessionStore.get('sessions')
    sessionStore.set('sessions', sessions.filter((s) => s.id !== id))
  })
}
