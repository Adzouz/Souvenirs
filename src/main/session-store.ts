import Store from 'electron-store'
import type { Session } from '../shared/types'

interface StoreSchema {
  sessions: Session[]
}

/** Single store so all IPC handlers see the same in-memory session data after writes. */
export const sessionStore = new Store<StoreSchema>({ defaults: { sessions: [] } })
