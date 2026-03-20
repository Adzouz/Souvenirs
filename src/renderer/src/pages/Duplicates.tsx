import React, { useMemo, useState, useEffect } from 'react'
import { useUiStore } from '../store/ui.store'
import { useFilesStore } from '../store/files.store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { ArrowLeft, Check, X, CheckCircle2, AlertCircle, AlertTriangle, Trash2 } from 'lucide-react'
import { cn, formatBytes, formatDate } from '@/lib/utils'
import type { MediaFile } from '../../../shared/types'

const DATE_STATUS_CONFIG = {
  ok: { label: 'OK', color: 'text-green-600', icon: CheckCircle2 },
  mismatch: { label: 'Mismatch', color: 'text-yellow-600', icon: AlertTriangle },
  missing: { label: 'No date', color: 'text-red-600', icon: AlertCircle }
}

function FileCard({
  file,
  kept,
  onToggle,
  onDelete
}: {
  file: MediaFile
  kept: boolean
  onToggle: () => void
  onDelete: () => void
}): React.JSX.Element {
  const statusCfg = DATE_STATUS_CONFIG[file.dateStatus]
  const StatusIcon = statusCfg.icon
  const isImage = file.mimeType.startsWith('image/')
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isImage) return
    window.api.dialog.readImageAsDataUrl(file.path).then(setDataUrl)
  }, [file.path, isImage])

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border-2 transition-all overflow-hidden',
        kept ? 'border-primary bg-primary/5' : 'border-muted bg-muted/20 opacity-60'
      )}
    >
      {/* Preview — 16:9 container, full image with letterboxing */}
      <div
        className="relative aspect-video w-full max-h-64 bg-muted flex items-center justify-center cursor-pointer select-none"
        onClick={onToggle}
      >
        {isImage ? (
          <img
            src={dataUrl ?? file.thumbnail ?? undefined}
            alt={file.name}
            className="h-full w-full object-contain"
          />
        ) : file.thumbnail ? (
          <img src={file.thumbnail} alt={file.name} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-mono text-muted-foreground">
            {file.ext.toUpperCase()}
          </div>
        )}

        {/* Kept/skipped indicator */}
        <div className={cn(
          'absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-white transition-all',
          kept ? 'bg-primary' : 'bg-muted-foreground/50'
        )}>
          {kept ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
        <p className="truncate text-xs text-muted-foreground font-mono" title={file.path}>{file.path}</p>
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatBytes(file.size)}</span>
            <span>·</span>
            <span className={cn('flex items-center gap-1', statusCfg.color)}>
              <StatusIcon className="h-3 w-3" />
              {statusCfg.label}
            </span>
            {file.resolvedDate && <span>· {formatDate(file.resolvedDate)}</span>}
          </div>

          {/* Delete button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => e.stopPropagation()}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Move to Trash?</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="font-mono text-xs break-all">{file.name}</span> will be moved to
                  the Trash. You can restore it from there if needed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(e) => { e.stopPropagation(); onDelete() }}
                >
                  Move to Trash
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  )
}

export function DuplicatesPage(): React.JSX.Element {
  const { setPage } = useUiStore()
  const { files, getDuplicateGroups, selectedIds, toggleSelect, removeFile, updateFile } = useFilesStore()

  const duplicateGroups = useMemo(() => getDuplicateGroups(), [files])

  // Track which file IDs are "kept" within each group
  // Default: keep files that are currently selected (or all if none selected in group)
  const [keptIds, setKeptIds] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const [, files] of duplicateGroups) {
      // Prefer keeping selected files; if none selected in group, keep all
      const selectedInGroup = files.filter((f) => selectedIds.has(f.id))
      const toKeep = selectedInGroup.length > 0 ? selectedInGroup : files
      toKeep.forEach((f) => initial.add(f.id))
    }
    return initial
  })

  const totalGroups = duplicateGroups.size
  const resolvedGroups = useMemo(() => {
    let count = 0
    for (const [, files] of duplicateGroups) {
      const keptCount = files.filter((f) => keptIds.has(f.id)).length
      if (keptCount < files.length) count++ // at least one skipped = resolved
    }
    return count
  }, [keptIds, duplicateGroups])

  function toggleFile(fileId: string): void {
    setKeptIds((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }

  function keepAll(files: MediaFile[]): void {
    setKeptIds((prev) => {
      const next = new Set(prev)
      files.forEach((f) => next.add(f.id))
      return next
    })
  }

  function keepFirst(files: MediaFile[]): void {
    setKeptIds((prev) => {
      const next = new Set(prev)
      files.forEach((f, i) => {
        if (i === 0) next.add(f.id)
        else next.delete(f.id)
      })
      return next
    })
  }

  async function handleDelete(fileId: string, filePath: string): Promise<void> {
    // Find siblings before removing so we can clear their duplicate flag if only 1 remains
    const allGroups = getDuplicateGroups()
    const siblingGroup = Array.from(allGroups.values()).find((g) => g.some((f) => f.id === fileId))
    const siblings = siblingGroup?.filter((f) => f.id !== fileId) ?? []

    await window.api.dialog.trashFile(filePath)
    removeFile(fileId)
    setKeptIds((prev) => { const next = new Set(prev); next.delete(fileId); return next })

    // If only one file remains in the group, clear its duplicate flags
    if (siblings.length === 1) {
      updateFile(siblings[0].id, { duplicateGroupId: null, duplicateType: null })
    }
  }

  function applyAndGoBack(): void {
    // Deselect any IDs that aren't kept
    for (const [, files] of duplicateGroups) {
      for (const f of files) {
        const isKept = keptIds.has(f.id)
        const isSelected = selectedIds.has(f.id)
        if (!isKept && isSelected) toggleSelect(f.id)
        if (isKept && !isSelected) toggleSelect(f.id)
      }
    }
    setPage('explorer')
  }

  if (totalGroups === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
        <p className="text-muted-foreground text-sm">No duplicates found.</p>
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
          <span className="text-sm font-medium">Duplicate Resolver</span>
          <Badge variant="secondary" className="ml-1">
            {totalGroups} group{totalGroups !== 1 ? 's' : ''}
          </Badge>
          {resolvedGroups > 0 && (
            <Badge variant="outline" className="text-green-600 border-green-300">
              {resolvedGroups} resolved
            </Badge>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-8">
          <p className="text-sm text-muted-foreground">
            These files share the same name and year. Click a file to toggle whether it's included in the copy.
            Files marked with <X className="inline h-3 w-3" /> will be deselected.
          </p>

          {Array.from(duplicateGroups.entries()).map(([groupId, files], groupIdx) => (
            <div key={groupId} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Group {groupIdx + 1}
                  </span>
                    <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">
                    {files[0].duplicateType === 'content' ? 'Same content' : 'Same name'} · {files[0].resolvedYear ?? 'No date'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => keepFirst(files)}>
                    Keep first only
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => keepAll(files)}>
                    Keep all
                  </Button>
                </div>
              </div>

              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: `repeat(${Math.min(files.length, 3)}, minmax(0, 1fr))` }}
              >
                {files.map((file) => (
                  <FileCard
                    key={file.id}
                    file={file}
                    kept={keptIds.has(file.id)}
                    onToggle={() => toggleFile(file.id)}
                    onDelete={() => handleDelete(file.id, file.path)}
                  />
                ))}
              </div>

              {groupIdx < duplicateGroups.size - 1 && <Separator />}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t px-6 py-4">
        <Button variant="ghost" onClick={() => setPage('explorer')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Cancel
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {keptIds.size} file{keptIds.size !== 1 ? 's' : ''} will be kept
          </span>
          <Button onClick={applyAndGoBack}>
            <Check className="mr-2 h-4 w-4" />
            Apply & back to explorer
          </Button>
        </div>
      </div>
    </div>
  )
}
