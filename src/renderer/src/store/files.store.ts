import { create } from 'zustand'
import type { MediaFile, ViewMode, YearGroup, DateStatus } from '../../../shared/types'

interface FilesFilter {
  year: number | 'no-date' | null // null = all
  dateStatus: DateStatus | null
  fileType: 'image' | 'video' | null
  unprocessedOnly: boolean
  search: string
}

interface FilesState {
  files: MediaFile[]
  scanVersion: number
  selectedIds: Set<string>
  viewMode: ViewMode
  filter: FilesFilter
  thumbnailsLoading: Set<string>

  setFiles: (files: MediaFile[]) => void
  updateFile: (id: string, partial: Partial<MediaFile>) => void
  removeFile: (id: string) => void
  setThumbnail: (id: string, dataUrl: string) => void

  toggleSelect: (id: string) => void
  selectAll: () => void
  deselectAll: () => void
  selectByYear: (year: number | null) => void

  setViewMode: (mode: ViewMode) => void
  setFilter: (partial: Partial<FilesFilter>) => void
  resetFilter: () => void

  // Derived
  getFiltered: () => MediaFile[]
  getYearGroups: () => YearGroup[]
  getDuplicateGroups: () => Map<string, MediaFile[]>
}

const defaultFilter: FilesFilter = {
  year: null,
  dateStatus: null,
  fileType: null,
  unprocessedOnly: false,
  search: ''
}

export const useFilesStore = create<FilesState>((set, get) => ({
  files: [],
  scanVersion: 0,
  selectedIds: new Set(),
  viewMode: 'list',
  filter: defaultFilter,
  thumbnailsLoading: new Set(),

  setFiles: (files) => set((state) => ({ files, selectedIds: new Set(), scanVersion: state.scanVersion + 1 })),

  updateFile: (id, partial) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, ...partial } : f))
    })),

  removeFile: (id) =>
    set((state) => ({
      files: state.files.filter((f) => f.id !== id),
      selectedIds: new Set([...state.selectedIds].filter((s) => s !== id))
    })),

  setThumbnail: (id, dataUrl) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, thumbnail: dataUrl } : f)),
      thumbnailsLoading: new Set([...state.thumbnailsLoading].filter((x) => x !== id))
    })),

  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedIds: next }
    }),

  selectAll: () =>
    set(() => ({
      selectedIds: new Set(get().getFiltered().map((f) => f.id))
    })),

  deselectAll: () => set({ selectedIds: new Set() }),

  selectByYear: (year) =>
    set((state) => ({
      selectedIds: new Set(
        state.files.filter((f) => f.resolvedYear === year).map((f) => f.id)
      )
    })),

  setViewMode: (viewMode) => set({ viewMode }),

  setFilter: (partial) =>
    set((state) => ({ filter: { ...state.filter, ...partial } })),

  resetFilter: () => set({ filter: defaultFilter }),

  getFiltered: () => {
    const { files, filter } = get()
    return files.filter((f) => {
      if (filter.year !== null) {
        if (filter.year === 'no-date' && f.resolvedYear !== null) return false
        if (typeof filter.year === 'number' && f.resolvedYear !== filter.year) return false
      }
      if (filter.dateStatus && f.dateStatus !== filter.dateStatus) return false
      if (filter.fileType) {
        const isImage = f.mimeType.startsWith('image/')
        if (filter.fileType === 'image' && !isImage) return false
        if (filter.fileType === 'video' && isImage) return false
      }
      if (filter.unprocessedOnly && f.processed) return false
      if (filter.search) {
        const q = filter.search.toLowerCase()
        if (!f.name.toLowerCase().includes(q)) return false
      }
      return true
    })
  },

  getYearGroups: () => {
    const { files } = get()
    const map = new Map<number | null, YearGroup>()

    for (const f of files) {
      const year = f.resolvedYear
      if (!map.has(year)) {
        map.set(year, {
          year,
          label: year ? String(year) : 'No Date',
          total: 0,
          processed: 0,
          pending: 0
        })
      }
      const group = map.get(year)!
      group.total++
      if (f.processed) group.processed++
      else group.pending++
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.year === null) return 1
      if (b.year === null) return -1
      return a.year - b.year
    })
  },

  getDuplicateGroups: () => {
    const { files } = get()
    const map = new Map<string, MediaFile[]>()
    for (const f of files) {
      if (!f.duplicateGroupId) continue
      const existing = map.get(f.duplicateGroupId) ?? []
      map.set(f.duplicateGroupId, [...existing, f])
    }
    return map
  }
}))
