import React, { useEffect, useState } from 'react'
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

const DATE_STATUS_CONFIG = {
  ok: { label: 'OK', color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle2 },
  mismatch: {
    label: 'Mismatch',
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    icon: AlertTriangle
  },
  missing: { label: 'No date', color: 'text-red-600', bg: 'bg-red-50', icon: AlertCircle }
}

function ThumbnailCell({
  file,
  loading = false
}: {
  file: MediaFile
  loading?: boolean
}): React.JSX.Element {
  const isVideo = file.mimeType.startsWith('video/')

  if (file.thumbnail) {
    return (
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded">
        <img src={file.thumbnail} alt={file.name} className="h-full w-full object-cover" />
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

function FileRow({
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
  const statusCfg = DATE_STATUS_CONFIG[file.dateStatus]
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
  const sourceFolder = activeSession?.sourceFolders.find((s) => file.path.startsWith(s))
  const relativeDir = sourceFolder ? dir.slice(sourceFolder.length).replace(/^\//, '') || './' : dir
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
          <ThumbnailCell file={file} loading={thumbLoading} />

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
            <p className="truncate text-xs text-muted-foreground font-mono">{shortPath}</p>
          </div>

          {/* Processed */}
          <div className="flex w-28 shrink-0 items-center justify-start">
            {file.processed ? (
              <Badge className="bg-green-100 text-xs text-green-600 dark:bg-green-700 dark:text-green-100">
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
                  <p>Filesystem: {file.fsDate ? formatDate(file.fsDate) : '—'}</p>
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
                {file.dateStatus !== 'ok' && (
                  <DropdownMenuItem onClick={() => onFixDate(file)}>
                    <CalendarClock className="mr-2 h-4 w-4" />
                    Fix date
                  </DropdownMenuItem>
                )}
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
        {file.dateStatus !== 'ok' && (
          <ContextMenuItem onClick={() => onFixDate(file)}>
            <CalendarClock className="mr-2 h-4 w-4" />
            Fix date
          </ContextMenuItem>
        )}
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
}

function GridCard({
  file,
  selected,
  onToggle,
  thumbLoading
}: {
  file: MediaFile
  selected: boolean
  onToggle: () => void
  thumbLoading: boolean
}): React.JSX.Element {
  const statusCfg = DATE_STATUS_CONFIG[file.dateStatus]
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
          onClick={onToggle}
        >
          {/* Thumbnail */}
          <div className="aspect-square w-full bg-muted">
            {file.thumbnail ? (
              <img src={file.thumbnail} alt={file.name} className="h-full w-full object-cover" />
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

          {/* Overlay: checkbox */}
          <div className="absolute left-2 top-2">
            {selected ? (
              <CheckSquare className="h-5 w-5 text-primary drop-shadow" />
            ) : (
              <Square className="h-5 w-5 text-white drop-shadow opacity-0 group-hover:opacity-100" />
            )}
          </div>

          {/* Status badge */}
          <div className={cn('absolute right-2 top-2 rounded-full p-1', statusCfg.bg)}>
            <StatusIcon className={cn('h-3 w-3', statusCfg.color)} />
          </div>

          {/* Info footer */}
          <div className="p-2">
            <p className="truncate text-xs font-medium">{file.name}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <p className="text-xs text-muted-foreground">{file.resolvedYear ?? '—'}</p>
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
}

export function ExplorerPage(): React.JSX.Element {
  const {
    files,
    scanVersion,
    viewMode,
    filter,
    selectedIds,
    setViewMode,
    setFilter,
    resetFilter,
    toggleSelect,
    selectAll,
    deselectAll,
    getFiltered,
    getYearGroups,
    getDuplicateGroups,
    setThumbnail,
    updateFile
  } = useFilesStore()
  const { activeSession } = useSessionStore()
  const { setPage, errorLogOpen, setErrorLogOpen } = useUiStore()

  const [fixingFile, setFixingFile] = useState<MediaFile | null>(null)

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

  // Depend on scanVersion — increments every time setFiles() is called (new scan).
  // Using files.length alone fails when a rescan returns the same number of files.
  // Individual thumbnail updates don't change scanVersion, so they won't cancel the batch.
  useEffect(() => {
    if (files.length === 0) return

    const needsThumbnail = files.filter((f) => !f.thumbnail)
    if (needsThumbnail.length === 0) return

    setPendingThumbs(new Set(needsThumbnail.map((f) => f.id)))

    const unsub = window.api.thumbnails.onReady((fileId, dataUrl) => {
      setThumbnail(fileId, dataUrl)
      setPendingThumbs((prev) => {
        const next = new Set(prev)
        next.delete(fileId)
        return next
      })
    })

    window.api.thumbnails
      .generateBatch(needsThumbnail.map((f) => ({ filePath: f.path, fileId: f.id })))
      .then(() => {
        setPendingThumbs(new Set())
      })

    return () => {
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

  const filtered = (() => {
    const base = getFiltered()
    if (!sortCol) return base // unreachable but keeps TS happy
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
  })()

  const yearGroups = getYearGroups()
  const duplicateGroups = getDuplicateGroups()
  const duplicateCount = duplicateGroups.size
  const errorCount = activeSession?.errorLog?.filter((e) => !e.retried).length ?? 0
  const thumbsRemaining = pendingThumbs.size
  const unprocessedCount = files.filter((f) => !f.processed).length
  const noDateCount = files.filter((f) => f.dateStatus === 'missing').length
  const mismatchCount = files.filter((f) => f.dateStatus === 'mismatch').length

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
              {thumbsRemaining} thumbnails…
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
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage('scan')}>
            <ScanSearch className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setPage('settings')}
          >
            <Settings className="h-4 w-4" />
          </Button>
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
                  .files.filter((f) => f.dateStatus !== 'ok').length
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
            </div>
          </div>

          {/* File list / grid — native overflow so horizontal scroll works (Radix ScrollArea hides overflow-x without a horizontal ScrollBar) */}
          <div className={cn('min-h-0 flex-1 overflow-auto', selectedIds.size > 0 && 'pb-16')}>
            {viewMode === 'list' ? (
              <div className="p-2">
                <div className="min-w-[52rem] space-y-0.5">
                  {/* Column headers */}
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
                      const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
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
                  <Separator />
                  {filtered.map((file) => (
                    <FileRow
                      key={file.id}
                      file={file}
                      selected={selectedIds.has(file.id)}
                      onToggle={() => toggleSelect(file.id)}
                      thumbLoading={pendingThumbs.has(file.id)}
                      onFixDate={setFixingFile}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <div className="py-16 text-center text-sm text-muted-foreground">
                      No files match the current filters
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                className="grid gap-3 p-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
              >
                {filtered.map((file) => (
                  <GridCard
                    key={file.id}
                    file={file}
                    selected={selectedIds.has(file.id)}
                    onToggle={() => toggleSelect(file.id)}
                    thumbLoading={pendingThumbs.has(file.id)}
                  />
                ))}
                {filtered.length === 0 && (
                  <div className="col-span-full py-16 text-center text-sm text-muted-foreground">
                    No files match the current filters
                  </div>
                )}
              </div>
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
                  Copy {selectedIds.size} file{selectedIds.size !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          )
        })()}

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
