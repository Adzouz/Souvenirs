import { ipcMain } from 'electron'
import type { ErrorEntry } from '../../shared/types'
import { sessionStore } from '../session-store'

export function registerErrorHandlers(): void {
  ipcMain.handle(
    'errors:retry',
    async (_, entries: ErrorEntry[], sessionId: string): Promise<void> => {
      const sessions = sessionStore.get('sessions')
      const session = sessions.find((s) => s.id === sessionId)
      if (!session) return

      // Mark entries as retried — actual retry logic delegates back to copy/scan IPC
      for (const entry of entries) {
        const idx = session.errorLog.findIndex((e) => e.id === entry.id)
        if (idx !== -1) session.errorLog[idx].retried = true
      }

      const updated = sessions.map((s) => (s.id === sessionId ? session : s))
      sessionStore.set('sessions', updated)
    }
  )
}
