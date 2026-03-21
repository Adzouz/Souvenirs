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
  // Thumbnails stored separately so updates don't invalidate the files array
  thumbnails: Map<string, string>
  thumbnailsLoading: Set<string>

  setFiles: (files: MediaFile[]) => void
  mergeFiles: (newFiles: MediaFile[]) => void
  updateFile: (id: string, partial: Partial<MediaFile>) => void
  removeFile: (id: string) => void
  setThumbnail: (id: string, dataUrl: string) => void
  setThumbnailBatch: (batch: Map<string, string>) => void

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
  thumbnails: new Map(),
  thumbnailsLoading: new Set(),

  setFiles: (files) => set((state) => ({
    files,
    thumbnails: new Map(),
    thumbnailsLoading: new Set(),
    selectedIds: new Set(),
    scanVersion: state.scanVersion + 1
  })),

  // Appends new files to existing ones, re-runs name+year duplicate detection,
  // and bumps scanVersion so thumbnail generation picks up the new entries.
  mergeFiles: (newFiles) => set((state) => {
    const merged = [...state.files, ...newFiles]

    // Clear name-duplicate flags on non-processed source files only.
    // Content-duplicate flags are preserved — don't overwrite them.
    merged.forEach((f) => {
      if (f.duplicateType === 'name' && !f.processed) {
        f.duplicateGroupId = null
        f.duplicateType = null
      }
    })

    // Re-run name+year detection on source (non-processed) files only,
    // skipping files already in a content-duplicate group.
    const nameYearMap = new Map<string, MediaFile[]>()
    for (const f of merged) {
      if (f.processed || f.duplicateType === 'content') continue
      const key = `${f.name}::${f.resolvedYear ?? 'nodate'}`
      const group = nameYearMap.get(key) ?? []
      group.push(f)
      nameYearMap.set(key, group)
    }
    for (const group of nameYearMap.values()) {
      if (group.length < 2) continue
      const groupId = group.map((f) => f.path).join('|')
      group.forEach((f) => { f.duplicateGroupId = groupId; f.duplicateType = 'name' })
    }

    return { files: merged, scanVersion: state.scanVersion + 1 }
  }),

  updateFile: (id, partial) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, ...partial } : f))
    })),

  removeFile: (id) =>
    set((state) => ({
      files: state.files.filter((f) => f.id !== id),
      selectedIds: new Set([...state.selectedIds].filter((s) => s !== id))
    })),

  // O(1) — does NOT touch the files array, so filtered/yearGroups stay valid
  setThumbnail: (id, dataUrl) =>
    set((state) => {
      const thumbnails = new Map(state.thumbnails)
      thumbnails.set(id, dataUrl)
      const thumbnailsLoading = new Set(state.thumbnailsLoading)
      thumbnailsLoading.delete(id)
      return { thumbnails, thumbnailsLoading }
    }),

  // Batch version for flushing multiple thumbnails at once
  setThumbnailBatch: (batch) =>
    set((state) => {
      const thumbnails = new Map(state.thumbnails)
      const thumbnailsLoading = new Set(state.thumbnailsLoading)
      for (const [id, url] of batch) {
        thumbnails.set(id, url)
        thumbnailsLoading.delete(id)
      }
      return { thumbnails, thumbnailsLoading }
    }),

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
      // dateStatus filter is applied in the component using getDateStatus() for effective status
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
    // Remove stale singleton groups (pair was deleted or never correctly linked)
    const result = new Map<string, MediaFile[]>()
    for (const [id, group] of map) {
      if (group.length >= 2) result.set(id, group)
    }
    return result
  }
}))
