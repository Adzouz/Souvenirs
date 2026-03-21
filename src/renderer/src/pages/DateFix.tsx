import React, { useState, useMemo } from 'react'
import { useUiStore } from '../store/ui.store'
import { useFilesStore } from '../store/files.store'
import { useSessionStore } from '../store/session.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  CalendarClock,
  CheckSquare,
  Square,
  CheckCircle2,
  Info
} from 'lucide-react'
import { cn, formatBytes, formatDate } from '@/lib/utils'
import type { MediaFile } from '../../../shared/types'

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type RunState = 'idle' | 'done'

export function DateFixPage(): React.JSX.Element {
  const { setPage } = useUiStore()
  const { files, thumbnails, updateFile } = useFilesStore()
  const { updateActiveSession } = useSessionStore()

  const [showOk, setShowOk] = useState(false)

  // Only unprocessed files — processed files already have their date applied at the destination
  const sourceFiles = useMemo(() => files.filter((f) => !f.processed), [files])

  // All files with date issues (+ ok files when toggle is on)
  const problemFiles = useMemo(
    () => showOk ? sourceFiles : sourceFiles.filter((f) => f.dateStatus !== 'ok'),
    [sourceFiles, showOk]
  )
  const okCount = useMemo(() => sourceFiles.filter((f) => f.dateStatus === 'ok').length, [sourceFiles])

  // Target dates: fileId → datetime-local string (or '' if not set)
  const [targets, setTargets] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of files.filter((f) => !f.processed && f.dateStatus !== 'ok')) {
      init[f.id] = f.overrideDate ? toDatetimeLocal(f.overrideDate) : (f.exifDate ?? f.fsDate) ? toDatetimeLocal((f.exifDate ?? f.fsDate)!) : ''
    }
    return init
  })

  const [modes, setModes] = useState<Record<string, DateMode>>(() => {
    const init: Record<string, DateMode> = {}
    for (const f of files.filter((f) => !f.processed && f.dateStatus !== 'ok')) {
      init[f.id] = f.exifDate ? 'exif' : f.fsDate ? 'fs' : 'mtime'
    }
    return init
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDate, setBulkDate] = useState('')
  const [runState, setRunState] = useState<RunState>('idle')
  const [savedCount, setSavedCount] = useState(0)

  const configured = problemFiles.filter((f) => f.overrideDate !== null)
  const configuredIds = new Set(configured.map((f) => f.id))
  const mismatches = problemFiles.filter((f) => f.dateStatus === 'mismatch' && !configuredIds.has(f.id))
  const missing = problemFiles.filter((f) => f.dateStatus === 'missing' && !configuredIds.has(f.id))
  const okFiles = problemFiles.filter((f) => f.dateStatus === 'ok' && !configuredIds.has(f.id))

  const allReadyCount = problemFiles.filter((f) => targets[f.id]).length
  const fixCandidates =
    selected.size > 0
      ? problemFiles.filter((f) => selected.has(f.id) && targets[f.id])
      : problemFiles.filter((f) => targets[f.id])
  const readyCount = fixCandidates.length

  function toggleSelect(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll(): void {
    setSelected(new Set(problemFiles.map((f) => f.id)))
  }

  function deselectAll(): void {
    setSelected(new Set())
  }

  function applyBulkDate(): void {
    if (!bulkDate || selected.size === 0) return
    setTargets((prev) => {
      const next = { ...prev }
      for (const id of selected) next[id] = bulkDate
      return next
    })
  }

  function prefillAllMismatches(): void {
    setTargets((prev) => {
      const next = { ...prev }
      for (const f of mismatches) {
        if (f.exifDate) next[f.id] = toDatetimeLocal(f.exifDate)
      }
      return next
    })
    setModes((prev) => {
      const next = { ...prev }
      for (const f of mismatches) {
        if (f.exifDate) next[f.id] = 'exif'
      }
      return next
    })
  }

  function runFix(): void {
    const toFix = fixCandidates
    if (toFix.length === 0) return

    for (const file of toFix) {
      const iso = new Date(targets[file.id]).toISOString()
      updateFile(file.id, { overrideDate: iso })
    }

    updateActiveSession({ files: useFilesStore.getState().files })
    setSavedCount(toFix.length)
    setRunState('done')
  }

  // ── Done state ─────────────────────────────────────────────────────────────
  if (runState === 'done') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6 px-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold">Date preferences saved</h2>
          <p className="text-sm text-muted-foreground">
            {savedCount} file{savedCount !== 1 ? 's' : ''} will have their date corrected when copied or moved.
            Your original files won't be touched.
          </p>
        </div>
        <Button onClick={() => setPage('explorer')}>Back to explorer</Button>
      </div>
    )
  }

  // ── Idle state ─────────────────────────────────────────────────────────────
  if (problemFiles.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
        <p className="text-muted-foreground text-sm">All dates are OK.</p>
        <Button variant="outline" onClick={() => setPage('explorer')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to explorer
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Titlebar */}
      <div
        className="flex h-12 shrink-0 items-center gap-2 border-b pl-20 pr-4 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage('explorer')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-sm font-medium">Date Fix</span>
          {mismatches.length > 0 && (
            <Badge variant="outline" className="text-yellow-600 border-yellow-300">
              {mismatches.length} mismatch
            </Badge>
          )}
          {missing.length > 0 && (
            <Badge variant="outline" className="text-red-600 border-red-300">
              {missing.length} no date
            </Badge>
          )}
        </div>
      </div>

      {/* Bulk actions bar */}
      <div className="flex shrink-0 items-center gap-3 border-b bg-muted/30 px-4 py-2 flex-wrap">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={selected.size === problemFiles.length ? deselectAll : selectAll}>
          {selected.size === problemFiles.length && selected.size > 0
            ? <CheckSquare className="h-4 w-4" />
            : <Square className="h-4 w-4" />
          }
        </Button>
        {mismatches.length > 0 && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={prefillAllMismatches}>
            Pre-fill all mismatches with EXIF date
          </Button>
        )}
        {okCount > 0 && (
          <Button
            variant={showOk ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 text-xs ml-auto"
            onClick={() => setShowOk((v) => !v)}
          >
            {showOk ? `Hide OK files` : `Show OK files (${okCount})`}
          </Button>
        )}
        {selected.size > 0 && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            <Input
              type="datetime-local"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
              className="h-7 w-52 text-xs"
            />
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={applyBulkDate} disabled={!bulkDate}>
              Apply to selected
            </Button>
          </>
        )}
      </div>

      {/* File list */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Mismatch section */}
          {mismatches.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">
                Date mismatch — {mismatches.length} file{mismatches.length !== 1 ? 's' : ''}
              </p>
              <div className="rounded-md border overflow-hidden">
                {mismatches.map((file, i) => (
                  <FileFixRow
                    key={file.id}
                    file={file}
                    target={targets[file.id] ?? ''}
                    mode={modes[file.id] ?? 'exif'}
                    selected={selected.has(file.id)}
                    thumbnail={thumbnails.get(file.id) ?? null}
                    onToggleSelect={() => toggleSelect(file.id)}
                    onTargetChange={(v) => setTargets((p) => ({ ...p, [file.id]: v }))}
                    onModeChange={(m) => setModes((p) => ({ ...p, [file.id]: m }))}
                    isLast={i === mismatches.length - 1}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Missing section */}
          {missing.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">
                No date — {missing.length} file{missing.length !== 1 ? 's' : ''}
              </p>
              <div className="rounded-md border overflow-hidden">
                {missing.map((file, i) => (
                  <FileFixRow
                    key={file.id}
                    file={file}
                    target={targets[file.id] ?? ''}
                    mode={modes[file.id] ?? 'fs'}
                    selected={selected.has(file.id)}
                    thumbnail={thumbnails.get(file.id) ?? null}
                    onToggleSelect={() => toggleSelect(file.id)}
                    onTargetChange={(v) => setTargets((p) => ({ ...p, [file.id]: v }))}
                    onModeChange={(m) => setModes((p) => ({ ...p, [file.id]: m }))}
                    isLast={i === missing.length - 1}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Configured section */}
          {configured.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-green-600 px-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Configured — {configured.length} file{configured.length !== 1 ? 's' : ''}
              </p>
              <div className="rounded-md border border-green-200 dark:border-green-800 overflow-hidden">
                {configured.map((file, i) => (
                  <FileFixRow
                    key={file.id}
                    file={file}
                    target={targets[file.id] ?? (file.overrideDate ? toDatetimeLocal(file.overrideDate) : '')}
                    mode={modes[file.id] ?? 'exif'}
                    selected={selected.has(file.id)}
                    thumbnail={thumbnails.get(file.id) ?? null}
                    configured
                    onToggleSelect={() => toggleSelect(file.id)}
                    onTargetChange={(v) => setTargets((p) => ({ ...p, [file.id]: v }))}
                    onModeChange={(m) => setModes((p) => ({ ...p, [file.id]: m }))}
                    isLast={i === configured.length - 1}
                  />
                ))}
              </div>
            </div>
          )}

          {/* OK files section */}
          {okFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">
                OK — {okFiles.length} file{okFiles.length !== 1 ? 's' : ''}
              </p>
              <div className="rounded-md border overflow-hidden">
                {okFiles.map((file, i) => (
                  <FileFixRow
                    key={file.id}
                    file={file}
                    target={targets[file.id] ?? ''}
                    mode={modes[file.id] ?? 'exif'}
                    selected={selected.has(file.id)}
                    thumbnail={thumbnails.get(file.id) ?? null}
                    onToggleSelect={() => toggleSelect(file.id)}
                    onTargetChange={(v) => setTargets((p) => ({ ...p, [file.id]: v }))}
                    onModeChange={(m) => setModes((p) => ({ ...p, [file.id]: m }))}
                    isLast={i === okFiles.length - 1}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Info banner */}
      <div className="flex items-center gap-3 border-t border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 px-6 py-2">
        <Info className="h-4 w-4 shrink-0 text-blue-500" />
        <p className="flex-1 text-xs text-blue-900 dark:text-blue-100">
          Dates are applied to the destination file during copy or move. Your original files won't be modified.
        </p>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t px-6 py-4">
        <Button variant="ghost" onClick={() => setPage('explorer')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {selected.size > 0
              ? `${readyCount} of ${selected.size} selected ready`
              : `${allReadyCount} of ${problemFiles.length} files ready`}
          </span>
          <Button onClick={runFix} disabled={readyCount === 0}>
            <CalendarClock className="mr-2 h-4 w-4" />
            Save for {readyCount} file{readyCount !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}

type DateMode = 'exif' | 'fs' | 'mtime'

function FileFixRow({
  file,
  thumbnail,
  target,
  mode,
  selected,
  configured = false,
  onToggleSelect,
  onTargetChange,
  onModeChange,
  isLast
}: {
  file: MediaFile
  thumbnail: string | null
  target: string
  mode: DateMode
  selected: boolean
  configured?: boolean
  onToggleSelect: () => void
  onTargetChange: (v: string) => void
  onModeChange: (m: DateMode) => void
  isLast: boolean
}): React.JSX.Element {
  function selectMode(m: DateMode): void {
    onModeChange(m)
    if (m === 'exif' && file.exifDate) onTargetChange(toDatetimeLocal(file.exifDate))
    else if (m === 'fs' && file.fsDate) onTargetChange(toDatetimeLocal(file.fsDate))
    else if (m === 'mtime' && file.fsMtimeDate) onTargetChange(toDatetimeLocal(file.fsMtimeDate))
  }

  const hasExif = !!file.exifDate
  const hasFs = !!file.fsDate
  const hasMtime = !!file.fsMtimeDate
  const showToggle = [hasExif, hasFs, hasMtime].filter(Boolean).length > 1

  return (
    <>
      <div className={cn(
        'flex items-center gap-3 px-3 py-3 text-sm transition-colors',
        selected && 'bg-accent/50',
        configured && 'bg-green-50 dark:bg-green-950/30'
      )}>
        {/* Checkbox */}
        <button className="shrink-0 text-muted-foreground" onClick={onToggleSelect}>
          {selected
            ? <CheckSquare className="h-4 w-4 text-primary" />
            : <Square className="h-4 w-4 opacity-40" />
          }
        </button>

        {/* Thumbnail */}
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded">
          {thumbnail
            ? <img src={thumbnail} alt={file.name} className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center bg-muted text-[8px] font-mono text-muted-foreground">{file.ext.toUpperCase()}</div>
          }
        </div>

        {/* Name + dates */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            EXIF: {file.exifDate ? formatDate(file.exifDate) : <span className="opacity-40">—</span>}
            {' · '}
            Created: {file.fsDate ? formatDate(file.fsDate) : <span className="opacity-40">—</span>}
            {' · '}
            Modified: {file.fsMtimeDate ? formatDate(file.fsMtimeDate) : <span className="opacity-40">—</span>}
          </p>
        </div>

        {/* Size */}
        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
          {formatBytes(file.size)}
        </span>

        {/* Date control */}
        <div className="shrink-0 w-48 space-y-1">
          {showToggle && (
            <div className="flex rounded-md border overflow-hidden text-xs h-6">
              {hasExif && (
                <button
                  className={cn(
                    'flex-1 px-2 transition-colors',
                    mode === 'exif' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                  onClick={() => selectMode('exif')}
                >
                  EXIF
                </button>
              )}
              {hasFs && (
                <button
                  className={cn(
                    'flex-1 px-2 border-l transition-colors',
                    mode === 'fs' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                  onClick={() => selectMode('fs')}
                >
                  Created
                </button>
              )}
              {hasMtime && (
                <button
                  className={cn(
                    'flex-1 px-2 border-l transition-colors',
                    mode === 'mtime' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                  onClick={() => selectMode('mtime')}
                >
                  Modified
                </button>
              )}
            </div>
          )}
          <Input
            type="datetime-local"
            value={target}
            onChange={(e) => onTargetChange(e.target.value)}
            className={cn('h-7 w-full text-xs pr-2', !target && 'border-muted-foreground/30')}
          />
        </div>
      </div>
      {!isLast && <Separator />}
    </>
  )
}
