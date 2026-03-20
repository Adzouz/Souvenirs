import { create } from 'zustand'
import type { Session } from '../../../shared/types'

interface SessionState {
  sessions: Session[]
  activeSession: Session | null
  loading: boolean

  setSessions: (sessions: Session[]) => void
  setActiveSession: (session: Session | null) => void
  updateActiveSession: (partial: Partial<Session>) => void
  setLoading: (loading: boolean) => void

  loadSessions: () => Promise<void>
  loadSession: (id: string) => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSession: null,
  loading: false,

  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (activeSession) => set({ activeSession }),
  updateActiveSession: (partial) => {
    const { activeSession } = get()
    if (!activeSession) return
    const updated = { ...activeSession, ...partial }
    set({ activeSession: updated })
    window.api.sessions.update(updated)
  },
  setLoading: (loading) => set({ loading }),

  loadSessions: async () => {
    set({ loading: true })
    try {
      const sessions = await window.api.sessions.list()
      set({ sessions })
    } finally {
      set({ loading: false })
    }
  },

  loadSession: async (id) => {
    set({ loading: true })
    try {
      const session = await window.api.sessions.get(id)
      set({ activeSession: session })
    } finally {
      set({ loading: false })
    }
  }
}))
