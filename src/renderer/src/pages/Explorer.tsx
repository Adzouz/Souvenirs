import React, { useEffect, useState } from 'react'
import { VList } from 'virtua'
import { useFilesStore } from '../store/files.store'
import { useSessionStore } from '../store/session.store'
import { useUiStore } from '../store/ui.store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Settings,
  ScanSearch,
  List,
  LayoutGrid,
  Search,
  CheckSquare,
  Square,
  FolderOpen,
  FolderPlus,
  ExternalLink,
  Copy,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Filter,
  ArrowLeft,
  TriangleAlert,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  CalendarClock,
  MoreHorizontal,
  FolderOutput
} from 'lucide-react'
import { cn, formatBytes, formatDate } from '@/lib/utils'
import type { MediaFile } from '../../../shared/types'
import { ErrorLogDrawer } from '@/components/ErrorLogDrawer'
import { DateFixDialog } from '@/components/DateFixDialog'
import { Lightbox } from '@/components/Lightbox'

const DATE_STATUS_CONFIG = {
  ok: { label: 'OK', color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle2 },
  mismatch: {
    label: 'Mismatch',
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    icon: AlertTriangle
  },
  missing: { label: 'No date', color: 'text-red-600', bg: 'bg-red-50', icon: AlertCircle },
  configured: {
    label: 'Configured',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    icon: CalendarClock
  },
  fixed: { label: 'Fixed', color: 'text-green-600', bg: 'bg-green-50', icon: CalendarClock }
}

function getDateStatus(file: MediaFile): keyof typeof DATE_STATUS_CONFIG {
  if (file.dateFixed) return 'fixed'
  if (file.overrideDate && !file.processed) return 'configured'
  return file.dateStatus
}

function getDestDisplay(file: MediaFile, outputFolder: string): string {
  const rootName = outputFolder.substring(outputFolder.lastIndexOf('/') + 1)
  const yearFolder = file.destPath
    ? (file.destPath.split('/').slice(-2, -1)[0] ?? '')
    : (file.resolvedYear?.toString() ?? 'NoDate')
  return rootName === yearFolder ? yearFolder : `${rootName}/${yearFolder}`
}

function ThumbnailCell({
  file,
  thumbnail,
  loading = false
}: {
  file: MediaFile
  thumbnail: string | null
  loading?: boolean
}): React.JSX.Element {
  const isVideo = file.mimeType.startsWith('video/')

  if (thumbnail) {
    return (
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded">
        <img src={thumbnail} alt={file.name} className="h-full w-full object-cover" />
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-white" />
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return <div className="h-10 w-10 shrink-0 animate-pulse rounded bg-muted" />
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted text-[9px] font-mono text-muted-foreground">
      {file.ext.toUpperCase()}
    </div>
  )
}

const FileRow = React.memo(function FileRow({
  file,
  selected,
  onToggle,
  thumbLoading,
  onFixDate
}: {
  file: MediaFile
  selected: boolean
  onToggle: () => void
  thumbLoading: boolean
  onFixDate: (file: MediaFile) => void
}): React.JSX.Element {
  const thumbnail = useFilesStore((s) => s.thumbnails.get(file.id) ?? null)
  const statusCfg = DATE_STATUS_CONFIG[getDateStatus(file)]
  const StatusIcon = statusCfg.icon
  const { setPage } = useUiStore()
  const { setFilter } = useFilesStore()
  const { activeSession } = useSessionStore()

  async function openInFinder(): Promise<void> {
    const dir = file.path.substring(0, file.path.lastIndexOf('/'))
    await window.api.dialog.openFolderInFinder(dir)
  }

  async function openFile(): Promise<void> {
    await window.api.dialog.openFile(file.path)
  }

  const dir = file.path.substring(0, file.path.lastIndexOf('/'))
  const sourceFolder = activeSession?.sourceFolders
    .map((s) => s.replace(/\/$/, ''))
    .find((s) => file.path.startsWith(s + '/') || file.path === s)
  const rootName = sourceFolder ? sourceFolder.substring(sourceFolder.lastIndexOf('/') + 1) : ''
  const relativeSuffix = sourceFolder ? dir.slice(sourceFolder.length).replace(/^\//, '') : ''
  const relativeDir = rootName
    ? relativeSuffix
      ? `${rootName}/${relativeSuffix}`
      : rootName
    : dir.split('/').filter(Boolean).slice(-2).join('/') || dir
  const shortPath = relativeDir.length > 60 ? '…' + relativeDir.slice(-57) : relativeDir

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'group flex min-w-0 cursor-default items-center gap-3 rounded-md px-3 py-2 transition-colors select-none',
            selected ? 'bg-accent' : 'hover:bg-muted/50'
          )}
          onClick={onToggle}
        >
          {/* Checkbox */}
          <div
            className="shrink-0 text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
          >
            {selected ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4 opacity-40 group-hover:opacity-100" />
            )}
          </div>

          {/* Thumbnail */}
          <ThumbnailCell file={file} thumbnail={thumbnail} loading={thumbLoading} />

          {/* Name + path — min-w-0 chain so row can shrink; right columns stay visible */}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate text-sm font-medium">{file.name}</span>
              {file.duplicateType && (
                <Badge
                  variant="outline"
                  className="shrink-0 border-orange-300 text-orange-600 text-xs"
                >
                  Duplicate
                </Badge>
              )}
            </div>
            <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground font-mono">
              {file.status === 'moved' ||
              (file.processed && activeSession?.transferMode === 'move') ? (
                activeSession?.outputFolder ? (
                  <>
                    <FolderOutput className="h-3 w-3 shrink-0 text-green-500" />
                    <span className="truncate text-green-600">
                      {getDestDisplay(file, activeSession.outputFolder)}
                    </span>
                  </>
                ) : null
              ) : (
                <>
                  <FolderOpen className="h-3 w-3 shrink-0 opacity-60" />
                  <span className="truncate">{shortPath}</span>
                  {file.processed && activeSession?.outputFolder && (
                    <>
                      <FolderOutput className="h-3 w-3 shrink-0 ml-1 text-green-500" />
                      <span className="truncate text-green-600">
                        {getDestDisplay(file, activeSession.outputFolder)}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Processed */}
          <div className="flex w-28 shrink-0 items-center justify-start">
            {file.processed ? (
              <Badge className="bg-green-100 hover:bg-green-100 text-xs text-green-600 dark:bg-green-700 dark:hover:bg-green-700 dark:text-green-100">
                Processed
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Not processed
              </Badge>
            )}
          </div>

          {/* Size */}
          <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
            {formatBytes(file.size)}
          </span>

          {/* Date */}
          <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
            {formatDate(file.resolvedDate)}
          </span>

          {/* Status */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'flex w-20 shrink-0 items-center justify-end gap-1 text-xs',
                    statusCfg.color
                  )}
                >
                  <StatusIcon className="h-3 w-3" />
                  <span>{statusCfg.label}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs space-y-1">
                  <p>EXIF: {file.exifDate ? formatDate(file.exifDate) : '—'}</p>
                  <p>Created: {file.fsDate ? formatDate(file.fsDate) : '—'}</p>
                  <p>Modified: {file.fsMtimeDate ? formatDate(file.fsMtimeDate) : '—'}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* More actions */}
          <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openFile}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open file
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openInFinder}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Show in Finder
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onFixDate(file)}>
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Fix date
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setFilter({ year: file.resolvedYear ?? 'no-date' })
                    onToggle()
                  }}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Filter by year {file.resolvedYear ?? 'No Date'}
                </DropdownMenuItem>
                {file.duplicateGroupId && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setPage('duplicates')}>
                      <TriangleAlert className="mr-2 h-4 w-4" />
                      Resolve duplicates
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={openFile}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Open file
        </ContextMenuItem>
        <ContextMenuItem onClick={openInFinder}>
          <FolderOpen className="mr-2 h-4 w-4" />
          Show in Finder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onFixDate(file)}>
          <CalendarClock className="mr-2 h-4 w-4" />
          Fix date
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            setFilter({ year: file.resolvedYear ?? 'no-date' })
            onToggle()
          }}
        >
          <Filter className="mr-2 h-4 w-4" />
          Filter by year {file.resolvedYear ?? 'No Date'}
        </ContextMenuItem>
        {file.duplicateGroupId && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => setPage('duplicates')}>
              <TriangleAlert className="mr-2 h-4 w-4" />
              Resolve duplicates
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})

const GridCard = React.memo(function GridCard({
  file,
  selected,
  onToggle,
  thumbLoading,
  onOpen,
  selectMode
}: {
  file: MediaFile
  selected: boolean
  onToggle: () => void
  thumbLoading: boolean
  onOpen: () => void
  selectMode: boolean
}): React.JSX.Element {
  const thumbnail = useFilesStore((s) => s.thumbnails.get(file.id) ?? null)
  const statusCfg = DATE_STATUS_CONFIG[getDateStatus(file)]
  const StatusIcon = statusCfg.icon
  const isVideo = file.mimeType.startsWith('video/')

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'group relative cursor-default overflow-hidden rounded-lg border transition-all select-none',
            selected
              ? 'border-primary ring-2 ring-primary/20'
              : 'border-border hover:border-muted-foreground/40'
          )}
          onClick={selectMode ? onToggle : onOpen}
        >
          {/* Thumbnail */}
          <div className="aspect-square w-full bg-muted">
            {thumbnail ? (
              <img src={thumbnail} alt={file.name} className="h-full w-full object-cover" />
            ) : thumbLoading ? (
              <div className="h-full w-full animate-pulse bg-muted" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-mono text-muted-foreground">
                {file.ext.toUpperCase()}
              </div>
            )}
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40">
                  <div className="h-0 w-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-white ml-0.5" />
                </div>
              </div>
            )}
          </div>

          {/* Checkbox — always toggles selection; entering select mode on first click */}
          <div
            className="absolute left-2 top-2"
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
          >
            {selected ? (
              <CheckSquare className="h-5 w-5 text-primary drop-shadow" />
            ) : (
              <Square
                className={cn(
                  'h-5 w-5 text-white drop-shadow transition-opacity',
                  selectMode ? 'opacity-50' : 'opacity-0 group-hover:opacity-100'
                )}
              />
            )}
          </div>

          {/* Status badge */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn('absolute right-2 top-2 rounded-full p-1', statusCfg.bg)}>
                  <StatusIcon className={cn('h-3 w-3', statusCfg.color)} />
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">
                <div className="text-xs space-y-1">
                  <p className="font-medium">{statusCfg.label}</p>
                  {file.dateStatus === 'ok' && <p>EXIF and filesystem dates match</p>}
                  {file.dateStatus === 'mismatch' && (
                    <>
                      <p>EXIF and filesystem dates differ</p>
                      <p>EXIF: {file.exifDate ? formatDate(file.exifDate) : '—'}</p>
                      <p>Filesystem: {file.fsDate ? formatDate(file.fsDate) : '—'}</p>
                    </>
                  )}
                  {file.dateStatus === 'missing' && <p>No date metadata found</p>}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Info footer */}
          <div className="p-2">
            <p className="truncate text-xs font-medium">{file.name}</p>
            <div className="flex items-center gap-1 mt-0.5">
              {file.processed ? (
                <FolderOutput className="h-3 w-3 shrink-0 text-green-500" />
              ) : (
                <FolderOpen className="h-3 w-3 shrink-0 opacity-40" />
              )}
              {file.duplicateType && (
                <Badge
                  variant="outline"
                  className="h-3.5 text-[9px] px-1 border-orange-300 text-orange-600"
                >
                  dup
                </Badge>
              )}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={() => window.api.dialog.openFile(file.path)}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Open file
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            const dir = file.path.substring(0, file.path.lastIndexOf('/'))
            window.api.dialog.openFolderInFinder(dir)
          }}
        >
          <FolderOpen className="mr-2 h-4 w-4" />
          Show in Finder
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})

export function ExplorerPage(): React.JSX.Element {
  const {
    files,
    scanVersion,
    viewMode,
    filter,
    selectedIds,
    thumbnails,
    setViewMode,
    setFilter,
    resetFilter,
    toggleSelect,
    selectAll,
    deselectAll,
    getFiltered,
    getYearGroups,
    getDuplicateGroups,
    setThumbnailBatch,
    updateFile
  } = useFilesStore()
  const { activeSession, updateActiveSession } = useSessionStore()
  const { setPage, errorLogOpen, setErrorLogOpen, setIncrementalScanFolder } = useUiStore()

  async function addFolderToSort(): Promise<void> {
    const folder = await window.api.dialog.openFolder()
    if (!folder || !activeSession) return
    if (activeSession.sourceFolders.includes(folder)) return
    const updated = { ...activeSession, sourceFolders: [...activeSession.sourceFolders, folder] }
    await window.api.sessions.update(updated)
    updateActiveSession({ sourceFolders: updated.sourceFolders })
    setIncrementalScanFolder(folder)
    setPage('scan')
  }

  const [fixingFile, setFixingFile] = useState<MediaFile | null>(null)
  const [lightboxFileId, setLightboxFileId] = useState<string | null>(null)

  function handleFixed(fileId: string, newDate: string): void {
    const year = new Date(newDate).getFullYear()
    updateFile(fileId, {
      exifDate: newDate,
      fsDate: newDate,
      resolvedDate: newDate,
      resolvedYear: year,
      dateStatus: 'ok'
    })
  }

  // Track which fileIds are still awaiting a thumbnail
  const [pendingThumbs, setPendingThumbs] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (files.length === 0) return

    const needsThumbnail = files.filter((f) => !thumbnails.has(f.id))
    if (needsThumbnail.length === 0) return

    setPendingThumbs(new Set(needsThumbnail.map((f) => f.id)))

    // Batch thumbnail updates: accumulate arrivals and flush every 80ms to avoid
    // triggering a re-render per thumbnail (which would be O(n) work each time).
    const pendingBatch = new Map<string, string>()
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const flush = (): void => {
      if (pendingBatch.size === 0) return
      const batch = new Map(pendingBatch)
      pendingBatch.clear()
      flushTimer = null
      setThumbnailBatch(batch)
      setPendingThumbs((prev) => {
        const next = new Set(prev)
        for (const id of batch.keys()) next.delete(id)
        return next
      })
    }

    const unsub = window.api.thumbnails.onReady((fileId, dataUrl) => {
      pendingBatch.set(fileId, dataUrl)
      if (!flushTimer) flushTimer = setTimeout(flush, 80)
    })

    window.api.thumbnails
      .generateBatch(needsThumbnail.map((f) => ({ filePath: f.path, fileId: f.id })))
      .then(() => {
        if (flushTimer) {
          clearTimeout(flushTimer)
          flush()
        }
        setPendingThumbs(new Set())
      })

    return () => {
      if (flushTimer) clearTimeout(flushTimer)
      window.api.thumbnails.cancelBatch()
      unsub()
    }
  }, [scanVersion])

  const [sortCol, setSortCol] = useState<'name' | 'size' | 'date'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function handleSort(col: 'name' | 'size' | 'date'): void {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  // All derived values memoized — only recompute when their actual inputs change,
  // NOT on every thumbnail update (thumbnails are now stored separately).
  const filtered = React.useMemo(() => {
    const base = getFiltered().filter((f) =>
      filter.dateStatus ? getDateStatus(f) === filter.dateStatus : true
    )
    return [...base].sort((a, b) => {
      let cmp = 0
      if (sortCol === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortCol === 'size') cmp = a.size - b.size
      else if (sortCol === 'date') {
        const da = a.resolvedDate ?? ''
        const db = b.resolvedDate ?? ''
        cmp = da < db ? -1 : da > db ? 1 : 0
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [files, filter, sortCol, sortDir])

  const yearGroups = React.useMemo(() => getYearGroups(), [files])
  const duplicateGroups = React.useMemo(() => getDuplicateGroups(), [files])
  const duplicateCount = duplicateGroups.size
  const errorCount = activeSession?.errorLog?.filter((e) => !e.retried).length ?? 0
  const thumbsRemaining = pendingThumbs.size
  const { unprocessedCount, noDateCount, mismatchCount } = React.useMemo(
    () => ({
      unprocessedCount: files.filter((f) => !f.processed).length,
      noDateCount: files.filter((f) => getDateStatus(f) === 'missing').length,
      mismatchCount: files.filter((f) => getDateStatus(f) === 'mismatch').length
    }),
    [files]
  )

  // Select mode: derived from whether anything is selected
  const selectMode = selectedIds.size > 0

  // Lightbox navigation within the current filtered list
  const lightboxIndex = lightboxFileId ? filtered.findIndex((f) => f.id === lightboxFileId) : -1
  const lightboxFile = lightboxIndex >= 0 ? filtered[lightboxIndex] : null

  // Column count for grid view — recalculates on resize (sidebar=208px, padding=32px, card+gap=152px)
  const [gridCols, setGridCols] = React.useState(() =>
    Math.max(2, Math.floor((window.innerWidth - 240) / 152))
  )
  React.useEffect(() => {
    const handler = (): void =>
      setGridCols(Math.max(2, Math.floor((window.innerWidth - 240) / 152)))
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Flatten filtered files into VList items: year headers + rows of gridCols cards
  type GridItem =
    | { type: 'header'; label: string; count: number; isFirst: boolean }
    | { type: 'row'; files: MediaFile[]; rowKey: string }

  const gridItems = React.useMemo((): GridItem[] => {
    const groups = new Map<string, { label: string; files: MediaFile[] }>()
    for (const file of filtered) {
      const key = file.resolvedYear?.toString() ?? 'no-date'
      if (!groups.has(key))
        groups.set(key, { label: file.resolvedYear?.toString() ?? 'No date', files: [] })
      groups.get(key)!.files.push(file)
    }
    const sorted = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'no-date') return 1
      if (b === 'no-date') return -1
      return parseInt(a) - parseInt(b)
    })
    const items: GridItem[] = []
    sorted.forEach(([key, { label, files }], groupIdx) => {
      items.push({ type: 'header', label, count: files.length, isFirst: groupIdx === 0 })
      for (let i = 0; i < files.length; i += gridCols) {
        items.push({ type: 'row', files: files.slice(i, i + gridCols), rowKey: `${key}-${i}` })
      }
    })
    return items
  }, [filtered, gridCols])

  function handleSelectAll(): void {
    if (selectedIds.size === filtered.length) deselectAll()
    else selectAll()
  }

  return (
    <div className="relative flex h-screen flex-col">
      {/* Titlebar — drag on empty/title area; only buttons are no-drag (full no-drag children block dragging) */}
      <div
        className="flex h-12 shrink-0 items-center gap-2 border-b pl-20 pr-4 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage('home')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {activeSession?.name ?? 'Explorer'}
        </span>
        <div
          className="flex shrink-0 items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {thumbsRemaining > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums mr-1">
              {thumbsRemaining} thumbnails remaining…
            </span>
          )}
          {errorCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive gap-1.5 h-7"
              onClick={() => setErrorLogOpen(true)}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="text-xs">{errorCount} errors</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={addFolderToSort}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Add folder to sort
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPage('scan')}
                >
                  <ScanSearch className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Rescan</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPage('settings')}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="flex w-52 shrink-0 flex-col border-r bg-sidebar">
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-1">
              <button
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors',
                  filter.year === null && !filter.unprocessedOnly
                    ? 'bg-sidebar-accent font-medium'
                    : 'hover:bg-sidebar-accent/60'
                )}
                onClick={resetFilter}
              >
                <span>All files</span>
                <span className="text-xs text-muted-foreground">
                  {useFilesStore.getState().files.length}
                </span>
              </button>

              <Separator className="my-2" />
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                By year
              </p>

              {yearGroups.map((group) => (
                <button
                  key={group.year ?? 'nodate'}
                  className={cn(
                    'flex w-full flex-col rounded-md px-2 py-1.5 text-sm transition-colors',
                    filter.year === group.year || (filter.year === 'no-date' && group.year === null)
                      ? 'bg-sidebar-accent font-medium'
                      : 'hover:bg-sidebar-accent/60'
                  )}
                  onClick={() => setFilter({ year: group.year ?? 'no-date' })}
                >
                  <div className="flex w-full items-center justify-between">
                    <span>{group.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {group.processed} / {group.total}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                    <div
                      className="h-full bg-green-500/60 rounded-full"
                      style={{ width: `${(group.processed / group.total) * 100}%` }}
                    />
                  </div>
                </button>
              ))}

              <Separator className="my-2" />
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Filters
              </p>

              <button
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-left transition-colors',
                  filter.unprocessedOnly
                    ? 'bg-sidebar-accent font-medium'
                    : 'hover:bg-sidebar-accent/60'
                )}
                onClick={() => setFilter({ unprocessedOnly: !filter.unprocessedOnly })}
              >
                <span className="flex-1">Unprocessed only</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {unprocessedCount}
                </span>
              </button>

              <button
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left transition-colors',
                  filter.dateStatus === 'missing'
                    ? 'bg-sidebar-accent font-medium'
                    : 'hover:bg-sidebar-accent/60'
                )}
                onClick={() =>
                  setFilter({ dateStatus: filter.dateStatus === 'missing' ? null : 'missing' })
                }
              >
                <AlertCircle className="h-3 w-3 text-red-500" />
                <span className="flex-1">No date</span>
                <span className="text-xs text-muted-foreground tabular-nums">{noDateCount}</span>
              </button>

              <button
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left transition-colors',
                  filter.dateStatus === 'mismatch'
                    ? 'bg-sidebar-accent font-medium'
                    : 'hover:bg-sidebar-accent/60'
                )}
                onClick={() =>
                  setFilter({ dateStatus: filter.dateStatus === 'mismatch' ? null : 'mismatch' })
                }
              >
                <AlertTriangle className="h-3 w-3 text-yellow-600" />
                <span className="flex-1">Date mismatch</span>
                <span className="text-xs text-muted-foreground tabular-nums">{mismatchCount}</span>
              </button>

              {(() => {
                const dateIssueCount = useFilesStore
                  .getState()
                  .files.filter((f) => !f.processed && f.dateStatus !== 'ok').length
                return dateIssueCount > 0 ? (
                  <>
                    <Separator className="my-2" />
                    <button
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent/60 text-yellow-600"
                      onClick={() => setPage('date-fix')}
                    >
                      <span className="flex items-center gap-2">
                        <CalendarClock className="h-3 w-3" />
                        Fix dates
                      </span>
                      <span className="text-xs">{dateIssueCount}</span>
                    </button>
                  </>
                ) : null
              })()}
              {duplicateCount > 0 && (
                <>
                  <Separator className="my-2" />
                  <button
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent/60 text-orange-600"
                    onClick={() => setPage('duplicates')}
                  >
                    <span className="flex items-center gap-2">
                      <TriangleAlert className="h-3 w-3" />
                      Resolve duplicates
                    </span>
                    <span className="text-xs">{duplicateCount}</span>
                  </button>
                </>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {(mismatchCount > 0 || noDateCount > 0) && (
            <p className="mx-4 mt-2 rounded-md border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Date status</span>
              {' — '}
              <span className="text-yellow-700 dark:text-yellow-600/90">Mismatch</span>
              {' means the EXIF date and the filesystem date differ. '}
              <span className="text-red-700 dark:text-red-500/90">No date</span>
              {
                ' means the file has neither. You can fix them by clicking the "Fix dates" button in the sidebar.'
              }
            </p>
          )}
          {/* Toolbar */}
          <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
            {/* Select all */}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSelectAll}>
              {selectedIds.size > 0 && selectedIds.size === filtered.length ? (
                <CheckSquare className="h-4 w-4" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </Button>

            {selectedIds.size > 0 ? (
              <>
                <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={deselectAll}>
                  Deselect
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">{filtered.length} files</span>
            )}

            <div className="flex-1" />

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search files…"
                value={filter.search}
                onChange={(e) => setFilter({ search: e.target.value })}
                className="h-7 w-48 pl-7 text-xs"
              />
            </div>

            {/* View toggle */}
            <div className="flex rounded-md border">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-7 w-7 rounded-r-none border-0',
                        viewMode === 'list' && 'bg-accent'
                      )}
                      onClick={() => setViewMode('list')}
                    >
                      <List className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>List view</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-7 w-7 rounded-l-none border-0',
                        viewMode === 'grid' && 'bg-accent'
                      )}
                      onClick={() => setViewMode('grid')}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Grid view</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* File list / grid */}
          <div className={cn('min-h-0 flex-1 flex flex-col', selectedIds.size > 0 && 'pb-16')}>
            {viewMode === 'list' ? (
              <>
                {/* Column headers — outside VList so they stay fixed while rows scroll */}
                <div className="shrink-0 overflow-x-auto border-b">
                  <div className="min-w-[52rem] px-2 pt-2 pb-1">
                    <div className="flex min-w-0 items-center gap-3 px-3 py-1 text-xs font-medium text-muted-foreground">
                      <div className="w-4 shrink-0" />
                      <div className="w-10 shrink-0" />
                      {(['name', 'processed', 'size', 'date'] as const).map((col) => {
                        if (col === 'processed') {
                          return (
                            <div key={col} className="w-28 shrink-0">
                              Processed
                            </div>
                          )
                        }
                        const active = sortCol === col
                        const Icon = active
                          ? sortDir === 'asc'
                            ? ArrowUp
                            : ArrowDown
                          : ArrowUpDown
                        const label =
                          col === 'name' ? 'Name / Path' : col === 'size' ? 'Size' : 'Date'
                        const cls =
                          col === 'name'
                            ? 'min-w-0 flex-1'
                            : col === 'size'
                              ? 'w-16 shrink-0 justify-end'
                              : 'w-28 shrink-0 justify-end'
                        return (
                          <button
                            key={col}
                            type="button"
                            className={cn(
                              'flex min-w-0 items-center gap-1 cursor-pointer hover:text-foreground transition-colors select-none',
                              cls,
                              active && 'text-foreground'
                            )}
                            onClick={() => handleSort(col)}
                          >
                            {col !== 'name' && <Icon className="h-3 w-3 shrink-0" />}
                            {label}
                            {col === 'name' && <Icon className="h-3 w-3 shrink-0" />}
                          </button>
                        )
                      })}
                      <div className="w-20 shrink-0 text-right">Date Status</div>
                      <div className="w-6 shrink-0" />
                    </div>
                  </div>
                </div>
                {filtered.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    No files match the current filters
                  </div>
                ) : (
                  <VList
                    className="flex-1 overflow-x-auto"
                    style={{
                      paddingLeft: '0.5rem',
                      paddingRight: '0.5rem',
                      paddingBottom: '0.5rem'
                    }}
                  >
                    {filtered.map((file) => (
                      <div key={file.id} className="min-w-[52rem]">
                        <FileRow
                          file={file}
                          selected={selectedIds.has(file.id)}
                          onToggle={() => toggleSelect(file.id)}
                          thumbLoading={pendingThumbs.has(file.id)}
                          onFixDate={setFixingFile}
                        />
                      </div>
                    ))}
                  </VList>
                )}
              </>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No files match the current filters
              </div>
            ) : (
              <VList className="flex-1">
                {gridItems.map((item) =>
                  item.type === 'header' ? (
                    <div
                      key={`header-${item.label}`}
                      className={cn(
                        'flex items-center justify-between px-4 pb-2',
                        item.isFirst ? 'pt-4' : 'pt-6'
                      )}
                    >
                      <h3 className="text-sm font-semibold">{item.label}</h3>
                      <span className="text-xs text-muted-foreground">
                        {item.count} {item.count === 1 ? 'file' : 'files'}
                      </span>
                    </div>
                  ) : (
                    <div key={item.rowKey} className="px-4 pb-3">
                      <div
                        className="grid gap-3"
                        style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
                      >
                        {item.files.map((file) => (
                          <GridCard
                            key={file.id}
                            file={file}
                            selected={selectedIds.has(file.id)}
                            onToggle={() => toggleSelect(file.id)}
                            thumbLoading={pendingThumbs.has(file.id)}
                            onOpen={() => setLightboxFileId(file.id)}
                            selectMode={selectMode}
                          />
                        ))}
                      </div>
                    </div>
                  )
                )}
              </VList>
            )}
          </div>
        </div>
      </div>

      {/* Sticky footer — shown when files are selected */}
      {selectedIds.size > 0 &&
        (() => {
          const hasOutput = !!activeSession?.outputFolder

          return (
            <div className="absolute bottom-0 left-52 right-0 border-t bg-background/95 backdrop-blur shadow-[0_-1px_4px_rgba(0,0,0,0.06)]">
              {/* No output folder callout */}
              {!hasOutput && (
                <div className="flex items-start gap-3 border-b bg-yellow-100 dark:bg-yellow-950/80 px-6 py-3">
                  <FolderOutput className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-yellow-800">
                      No destination folder configured
                    </p>
                    <p className="text-xs text-yellow-700 mt-0.5">
                      Set a destination folder in the session setup before copying or moving files.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-yellow-300 text-yellow-800 hover:bg-yellow-100"
                    onClick={() => setPage('setup')}
                  >
                    Configure
                  </Button>
                </div>
              )}

              {/* Action row */}
              <div className="flex items-center justify-between px-6 py-3">
                <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
                <Button disabled={!hasOutput} onClick={() => setPage('preview')}>
                  <Copy className="mr-2 h-4 w-4" />
                  {activeSession?.transferMode === 'move' ? 'Move' : 'Copy'} {selectedIds.size} file
                  {selectedIds.size !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          )
        })()}

      {/* Lightbox */}
      {lightboxFile && (
        <Lightbox
          file={lightboxFile}
          currentIndex={lightboxIndex}
          total={filtered.length}
          sourceFolders={activeSession?.sourceFolders ?? []}
          outputFolder={activeSession?.outputFolder ?? null}
          onClose={() => setLightboxFileId(null)}
          onPrev={
            lightboxIndex > 0 ? () => setLightboxFileId(filtered[lightboxIndex - 1].id) : null
          }
          onNext={
            lightboxIndex < filtered.length - 1
              ? () => setLightboxFileId(filtered[lightboxIndex + 1].id)
              : null
          }
        />
      )}

      {/* Error log drawer */}
      <ErrorLogDrawer open={errorLogOpen} onClose={() => setErrorLogOpen(false)} />

      {/* Date fix dialog */}
      <DateFixDialog
        file={fixingFile}
        open={!!fixingFile}
        onClose={() => setFixingFile(null)}
        onFixed={handleFixed}
      />
    </div>
  )
}
