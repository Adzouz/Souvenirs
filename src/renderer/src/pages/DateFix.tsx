import React, { useState, useMemo } from 'react'
import { useUiStore } from '../store/ui.store'
import { useFilesStore } from '../store/files.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  CalendarClock,
  CheckSquare,
  Square,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'
import { cn, formatBytes, formatDate } from '@/lib/utils'
import type { MediaFile } from '../../../shared/types'

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type RunState = 'idle' | 'running' | 'done'

export function DateFixPage(): React.JSX.Element {
  const { setPage } = useUiStore()
  const { files, updateFile } = useFilesStore()

  // All files with date issues
  const problemFiles = useMemo(
    () => files.filter((f) => f.dateStatus !== 'ok'),
    [files]
  )

  // Target dates: fileId → datetime-local string (or '' if not set)
  const [targets, setTargets] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of files.filter((f) => f.dateStatus !== 'ok')) {
      const best = f.exifDate ?? f.fsDate
      init[f.id] = best ? toDatetimeLocal(best) : ''
    }
    return init
  })

  const [modes, setModes] = useState<Record<string, DateMode>>(() => {
    const init: Record<string, DateMode> = {}
    for (const f of files.filter((f) => f.dateStatus !== 'ok')) {
      init[f.id] = f.exifDate ? 'exif' : 'fs'
    }
    return init
  })

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDate, setBulkDate] = useState('')
  const [runState, setRunState] = useState<RunState>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mismatches = problemFiles.filter((f) => f.dateStatus === 'mismatch')
  const missing = problemFiles.filter((f) => f.dateStatus === 'missing')

  const readyCount = problemFiles.filter((f) => targets[f.id]).length

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

  async function runFix(): Promise<void> {
    const toFix = problemFiles.filter((f) => targets[f.id])
    if (toFix.length === 0) return

    setRunState('running')
    setErrors({})
    setProgress({ done: 0, total: toFix.length, current: '' })

    for (const file of toFix) {
      setProgress((p) => ({ ...p, current: file.name }))
      try {
        const iso = new Date(targets[file.id]).toISOString()
        await window.api.metadata.fixDate(file.path, iso)
        updateFile(file.id, {
          exifDate: iso,
          fsDate: iso,
          resolvedDate: iso,
          resolvedYear: new Date(iso).getFullYear(),
          dateStatus: 'ok'
        })
      } catch (e) {
        setErrors((prev) => ({
          ...prev,
          [file.id]: e instanceof Error ? e.message : 'Failed'
        }))
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }))
    }

    setRunState('done')
  }

  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const failCount = Object.keys(errors).length

  // ── Running state ──────────────────────────────────────────────────────────
  if (runState === 'running') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-8 px-8">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <CalendarClock className="h-7 w-7 animate-pulse text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">Fixing dates…</h2>
        </div>
        <div className="w-full max-w-md space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="truncate max-w-[260px]">{progress.current}</span>
            <span className="tabular-nums font-medium">{percent}% · {progress.done} / {progress.total}</span>
          </div>
          <Progress value={percent} className="h-2" />
        </div>
      </div>
    )
  }

  // ── Done state ─────────────────────────────────────────────────────────────
  if (runState === 'done') {
    const fixed = progress.total - failCount
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6 px-8">
        <div className={cn(
          'flex h-16 w-16 items-center justify-center rounded-full',
          failCount > 0 ? 'bg-yellow-100' : 'bg-green-100'
        )}>
          {failCount > 0
            ? <AlertTriangle className="h-8 w-8 text-yellow-600" />
            : <CheckCircle2 className="h-8 w-8 text-green-600" />
          }
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold">Done</h2>
          <p className="text-sm text-muted-foreground">
            {fixed} file{fixed !== 1 ? 's' : ''} fixed
            {failCount > 0 && `, ${failCount} failed`}
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
      <div className="flex shrink-0 items-center gap-3 border-b bg-muted/30 px-4 py-2">
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
                    error={errors[file.id]}
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
                    error={errors[file.id]}
                    onToggleSelect={() => toggleSelect(file.id)}
                    onTargetChange={(v) => setTargets((p) => ({ ...p, [file.id]: v }))}
                    onModeChange={(m) => setModes((p) => ({ ...p, [file.id]: m }))}
                    isLast={i === missing.length - 1}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t px-6 py-4">
        <Button variant="ghost" onClick={() => setPage('explorer')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {readyCount} of {problemFiles.length} files ready
          </span>
          <Button onClick={runFix} disabled={readyCount === 0}>
            <CalendarClock className="mr-2 h-4 w-4" />
            Fix {readyCount} file{readyCount !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}

type DateMode = 'exif' | 'fs'

function FileFixRow({
  file,
  target,
  mode,
  selected,
  error,
  onToggleSelect,
  onTargetChange,
  onModeChange,
  isLast
}: {
  file: MediaFile
  target: string
  mode: DateMode
  selected: boolean
  error: string | undefined
  onToggleSelect: () => void
  onTargetChange: (v: string) => void
  onModeChange: (m: DateMode) => void
  isLast: boolean
}): React.JSX.Element {
  function selectMode(m: DateMode): void {
    onModeChange(m)
    if (m === 'exif' && file.exifDate) onTargetChange(toDatetimeLocal(file.exifDate))
    else if (m === 'fs' && file.fsDate) onTargetChange(toDatetimeLocal(file.fsDate))
  }

  const hasExif = !!file.exifDate
  const hasFs = !!file.fsDate
  const showToggle = hasExif && hasFs

  return (
    <>
      <div className={cn(
        'flex items-center gap-3 px-3 py-3 text-sm transition-colors',
        selected && 'bg-accent/50',
        error && 'bg-destructive/5'
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
          {file.thumbnail
            ? <img src={file.thumbnail} alt={file.name} className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center bg-muted text-[8px] font-mono text-muted-foreground">{file.ext.toUpperCase()}</div>
          }
        </div>

        {/* Name + dates */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            EXIF: {file.exifDate ? formatDate(file.exifDate) : <span className="opacity-40">Unknown</span>}
            {' · '}
            Filesystem: {file.fsDate ? formatDate(file.fsDate) : <span className="opacity-40">Unknown</span>}
          </p>
          {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}
        </div>

        {/* Size */}
        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
          {formatBytes(file.size)}
        </span>

        {/* Date control */}
        <div className="shrink-0 w-48 space-y-1">
          {showToggle && (
            <div className="flex rounded-md border overflow-hidden text-xs h-6">
              <button
                className={cn(
                  'flex-1 px-2 transition-colors',
                  mode === 'exif' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
                onClick={() => selectMode('exif')}
              >
                EXIF
              </button>
              <button
                className={cn(
                  'flex-1 px-2 border-l transition-colors',
                  mode === 'fs' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
                onClick={() => selectMode('fs')}
              >
                Filesystem
              </button>
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
