import { create } from 'zustand'
import type { DependencyStatus, ScanProgress, CopyProgress } from '../../../shared/types'

type AppPage = 'home' | 'setup' | 'scan' | 'explorer' | 'preview' | 'duplicates' | 'date-fix' | 'settings'
export type Theme = 'light' | 'dark'

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

interface UiState {
  page: AppPage
  scanProgress: ScanProgress | null
  copyProgress: CopyProgress | null
  errorLogOpen: boolean
  dependencies: DependencyStatus | null
  theme: Theme

  setPage: (page: AppPage) => void
  setScanProgress: (progress: ScanProgress | null) => void
  setCopyProgress: (progress: CopyProgress | null) => void
  setErrorLogOpen: (open: boolean) => void
  setDependencies: (deps: DependencyStatus) => void
  setTheme: (theme: Theme) => void
}

const savedTheme = (localStorage.getItem('theme') as Theme | null) ?? 'light'
applyTheme(savedTheme)

export const useUiStore = create<UiState>((set) => ({
  page: 'home',
  scanProgress: null,
  copyProgress: null,
  errorLogOpen: false,
  dependencies: null,
  theme: savedTheme,

  setPage: (page) => set({ page }),
  setScanProgress: (scanProgress) => set({ scanProgress }),
  setCopyProgress: (copyProgress) => set({ copyProgress }),
  setErrorLogOpen: (errorLogOpen) => set({ errorLogOpen }),
  setDependencies: (dependencies) => set({ dependencies }),
  setTheme: (theme) => {
    localStorage.setItem('theme', theme)
    applyTheme(theme)
    set({ theme })
  }
}))
