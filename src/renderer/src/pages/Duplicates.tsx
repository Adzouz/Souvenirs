import React, { useMemo, useState, useEffect } from 'react'
import { useUiStore } from '../store/ui.store'
import { useFilesStore } from '../store/files.store'
import { useSessionStore } from '../store/session.store'
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
import { Input } from '@/components/ui/input'
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Minus,
  Copy,
  Info,
  Pencil
} from 'lucide-react'
import { cn, formatBytes, formatDate } from '@/lib/utils'
import type { MediaFile } from '../../../shared/types'

type FileAction = 'keep' | 'skip' | 'delete' | 'rename'

const DATE_STATUS_CONFIG = {
  ok: { label: 'OK', color: 'text-green-600', icon: CheckCircle2 },
  mismatch: { label: 'Mismatch', color: 'text-yellow-600', icon: AlertTriangle },
  missing: { label: 'No date', color: 'text-red-600', icon: AlertCircle },
  configured: { label: 'Configured', color: 'text-blue-600', icon: CalendarClock },
  fixed: { label: 'Fixed', color: 'text-green-600', icon: CalendarClock }
}

function FileCard({
  file,
  action,
  onAction,
  rename,
  onRename
}: {
  file: MediaFile
  action: FileAction
  onAction: (a: FileAction) => void
  rename: string
  onRename: (name: string) => void
}): React.JSX.Element {
  const thumbnail = useFilesStore((s) => s.thumbnails.get(file.id) ?? null)
  const effectiveStatus = file.dateFixed ? 'fixed' : (file.overrideDate && !file.processed) ? 'configured' : file.dateStatus
  const statusCfg = DATE_STATUS_CONFIG[effectiveStatus]
  const StatusIcon = statusCfg.icon
  const isImage = file.mimeType.startsWith('image/')
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isImage) return
    window.api.dialog.readImageAsDataUrl(file.path).then(setDataUrl)
  }, [file.path, isImage])

  const preview = dataUrl ?? thumbnail ?? undefined

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border-2 transition-all overflow-hidden',
        action === 'keep' && 'border-primary bg-primary/5',
        action === 'skip' && 'border-muted bg-muted/20 opacity-60',
        action === 'delete' && 'border-destructive/50 bg-destructive/5 opacity-50',
        action === 'rename' && 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
      )}
    >
      {/* Preview */}
      <div className="relative aspect-video w-full max-h-48 bg-muted flex items-center justify-center">
        {preview ? (
          <img src={preview} alt={file.name} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-mono text-muted-foreground">
            {file.ext.toUpperCase()}
          </div>
        )}

        {/* Action indicator */}
        <div
          className={cn(
            'absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-white text-xs font-bold shadow',
            action === 'keep' && 'bg-primary',
            action === 'skip' && 'bg-muted-foreground/60',
            action === 'delete' && 'bg-destructive',
            action === 'rename' && 'bg-blue-500'
          )}
        >
          {action === 'keep' && <Check className="h-3.5 w-3.5 text-white dark:text-black" />}
          {action === 'skip' && <Minus className="h-3.5 w-3.5" />}
          {action === 'rename' && <Pencil className="h-3 w-3" />}
          {action === 'delete' && <Trash2 className="h-3 w-3" />}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="truncate text-xs text-muted-foreground font-mono" title={file.path}>
          {file.path}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatBytes(file.size)}</span>
          <span>·</span>
          <span className={cn('flex items-center gap-1', statusCfg.color)}>
            <StatusIcon className="h-3 w-3" />
            {statusCfg.label}
          </span>
          {file.resolvedDate && <span>· {formatDate(file.resolvedDate)}</span>}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5 pt-1">
          <Button
            size="sm"
            variant={action === 'keep' ? 'default' : 'outline'}
            className="flex-1 h-7 text-xs gap-1"
            onClick={() => onAction('keep')}
          >
            <Check className="h-3 w-3" />
            Keep
          </Button>
          <Button
            size="sm"
            variant={action === 'skip' ? 'secondary' : 'outline'}
            className="flex-1 h-7 text-xs gap-1"
            onClick={() => onAction('skip')}
          >
            <Minus className="h-3 w-3" />
            Skip
          </Button>
          <Button
            size="sm"
            variant={action === 'rename' ? 'outline' : 'outline'}
            className={cn(
              'flex-1 h-7 text-xs gap-1',
              action === 'rename' && 'border-blue-400 text-blue-600'
            )}
            onClick={() => {
              onAction('rename')
              if (!rename) onRename(file.name)
            }}
          >
            <Pencil className="h-3 w-3" />
            Rename
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant={action === 'delete' ? 'destructive' : 'outline'}
                className="flex-1 h-7 text-xs gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Move to Trash?</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="font-mono text-xs break-all">{file.name}</span> will be moved to
                  the Trash when you apply. You can restore it from there if needed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => onAction('delete')}
                >
                  Mark for deletion
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {action === 'rename' && (
          <Input
            className="h-7 text-xs font-mono mt-1"
            value={rename}
            onChange={(e) => onRename(e.target.value)}
            placeholder="New filename…"
            autoFocus
          />
        )}
      </div>
    </div>
  )
}

export function DuplicatesPage(): React.JSX.Element {
  const { setPage } = useUiStore()
  const { files, getDuplicateGroups, removeFile, updateFile } = useFilesStore()
  const { updateActiveSession } = useSessionStore()

  const duplicateGroups = useMemo(() => getDuplicateGroups(), [files])

  const [renames, setRenames] = useState<Map<string, string>>(new Map())

  function setRename(fileId: string, name: string): void {
    setRenames((prev) => new Map(prev).set(fileId, name))
  }

  // Per-file action state — defaults depend on group type
  const [actions, setActions] = useState<Map<string, FileAction>>(() => {
    const map = new Map<string, FileAction>()
    for (const groupFiles of duplicateGroups.values()) {
      if (groupFiles[0]?.duplicateType === 'content') {
        // True duplicates: keep first, skip rest
        groupFiles.forEach((f, i) => map.set(f.id, i === 0 ? 'keep' : 'skip'))
      } else {
        // Name conflicts: keep all — they're different files, copy engine renames on conflict
        groupFiles.forEach((f) => map.set(f.id, 'keep'))
      }
    }
    return map
  })

  function setAction(fileId: string, action: FileAction): void {
    setActions((prev) => new Map(prev).set(fileId, action))
  }

  function setGroupActions(groupFiles: MediaFile[], actionFn: (i: number) => FileAction): void {
    setActions((prev) => {
      const next = new Map(prev)
      groupFiles.forEach((f, i) => next.set(f.id, actionFn(i)))
      return next
    })
  }

  const summary = useMemo(() => {
    let keep = 0,
      skip = 0,
      del = 0,
      ren = 0
    for (const a of actions.values()) {
      if (a === 'keep') keep++
      else if (a === 'skip') skip++
      else if (a === 'delete') del++
      else if (a === 'rename') ren++
    }
    return { keep, skip, del, ren }
  }, [actions])

  async function apply(): Promise<void> {
    for (const [, groupFiles] of duplicateGroups) {
      for (const f of groupFiles) {
        const action = actions.get(f.id)
        if (action === 'skip') {
          removeFile(f.id)
        } else if (action === 'delete') {
          try {
            await window.api.dialog.trashFile(f.path)
            removeFile(f.id)
          } catch (err) {
            console.error('Failed to trash', f.path, err)
          }
        } else if (action === 'rename') {
          const newName = renames.get(f.id)
          if (newName && newName !== f.name) {
            try {
              const newPath = await window.api.dialog.renameFile(f.path, newName)
              updateFile(f.id, {
                path: newPath,
                name: newName,
                duplicateGroupId: null,
                duplicateType: null
              })
            } catch (err) {
              console.error('Failed to rename', f.path, err)
            }
          } else {
            updateFile(f.id, { duplicateGroupId: null, duplicateType: null })
          }
        }
      }
    }

    // Clear duplicate flags only when the conflict is resolved:
    // if ≤1 file remains kept in a group, the conflict is gone.
    // If 2+ are kept, they're still duplicates — leave flags intact.
    for (const [, groupFiles] of duplicateGroups) {
      const kept = groupFiles.filter((f) => actions.get(f.id) === 'keep')
      if (kept.length <= 1) {
        for (const f of groupFiles) {
          if (actions.get(f.id) === 'keep') {
            updateFile(f.id, { duplicateGroupId: null, duplicateType: null })
          }
        }
      }
    }

    // Persist updated files to session so copy:preview reads the cleared flags
    updateActiveSession({ files: useFilesStore.getState().files })

    setPage('explorer')
  }

  if (duplicateGroups.size === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
        <p className="text-muted-foreground text-sm">No conflicts found.</p>
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
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setPage('explorer')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-sm font-medium flex-1">Conflict Resolver</span>
        <Badge variant="secondary">
          {duplicateGroups.size} group{duplicateGroups.size !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-10">
          {Array.from(duplicateGroups.entries()).map(([groupId, groupFiles], groupIdx) => {
            const isContent = groupFiles[0]?.duplicateType === 'content'
            const year = groupFiles[0]?.resolvedYear ?? 'No date'

            return (
              <div key={groupId} className="space-y-4">
                {/* Group header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {isContent ? (
                        <Badge
                          variant="outline"
                          className="text-orange-600 border-orange-300 text-xs gap-1"
                        >
                          <Copy className="h-3 w-3" />
                          Identical files · {year}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-amber-600 border-amber-300 text-xs gap-1"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Name conflict · {year}
                        </Badge>
                      )}
                    </div>
                    {!isContent && (
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        These files share the same name and year but may have different content. If
                        you keep multiple, they will be auto-renamed when copied to avoid
                        overwriting.
                      </p>
                    )}
                  </div>

                  {/* Quick actions */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setGroupActions(groupFiles, () => 'keep')}
                    >
                      Keep all
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        setGroupActions(groupFiles, (i) => (i === 0 ? 'keep' : 'skip'))
                      }
                    >
                      Keep first, skip rest
                    </Button>
                    {isContent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() =>
                          setGroupActions(groupFiles, (i) => (i === 0 ? 'keep' : 'delete'))
                        }
                      >
                        Keep first, delete rest
                      </Button>
                    )}
                  </div>
                </div>

                {/* File cards */}
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(groupFiles.length, 3)}, minmax(0, 1fr))`
                  }}
                >
                  {groupFiles.map((file) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      action={actions.get(file.id) ?? 'keep'}
                      onAction={(a) => setAction(file.id, a)}
                      rename={renames.get(file.id) ?? ''}
                      onRename={(name) => setRename(file.id, name)}
                    />
                  ))}
                </div>

                {groupIdx < duplicateGroups.size - 1 && <Separator />}
              </div>
            )
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t px-6 py-4">
        <Button variant="ghost" onClick={() => setPage('explorer')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Cancel
        </Button>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {summary.keep > 0 && (
              <span className="flex items-center gap-1 text-green-600">
                <Check className="h-3 w-3" />
                {summary.keep} kept
              </span>
            )}
            {summary.skip > 0 && (
              <span className="flex items-center gap-1">
                <Minus className="h-3 w-3" />
                {summary.skip} skipped
              </span>
            )}
            {summary.ren > 0 && (
              <span className="flex items-center gap-1 text-blue-600">
                <Pencil className="h-3 w-3" />
                {summary.ren} will be renamed
              </span>
            )}
            {summary.del > 0 && (
              <span className="flex items-center gap-1 text-destructive">
                <Trash2 className="h-3 w-3" />
                {summary.del} will be trashed
              </span>
            )}
          </div>
          <Button onClick={apply}>
            <Check className="mr-2 h-4 w-4" />
            Apply
          </Button>
        </div>
      </div>
    </div>
  )
}
