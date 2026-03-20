import React, { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../store/ui.store'
import { useSessionStore } from '../store/session.store'
import { useFilesStore } from '../store/files.store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ArrowLeft,
  Copy,
  MoveRight,
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FolderOutput
} from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import type { CopyAction, CopyProgress } from '../../../shared/types'

type RunState = 'idle' | 'running' | 'done'

/** Numeric year folders sort ascending; non-numeric (e.g. NoDate) sort last. */
function yearFolderSortKey(folder: string): number {
  return /^\d+$/.test(folder) ? parseInt(folder, 10) : Number.POSITIVE_INFINITY
}

export function PreviewPage(): React.JSX.Element {
  const { setPage, setCopyProgress, copyProgress } = useUiStore()
  const { activeSession, updateActiveSession } = useSessionStore()
  const { files, updateFile, selectedIds, deselectAll } = useFilesStore()

  const [actions, setActions] = useState<CopyAction[]>([])
  const [runState, setRunState] = useState<RunState>('idle')
  const [summary, setSummary] = useState<{ copied: number; failed: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const cancelledRef = useRef(false)

  const isMove = activeSession?.transferMode === 'move'
  const verb = isMove ? 'Move' : 'Copy'

  useEffect(() => {
    if (!activeSession) return
    const ids = Array.from(selectedIds)
    window.api.copy.preview(ids, activeSession.id).then((result) => {
      setActions(result)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (runState !== 'running') return
    const unsub = window.api.copy.onProgress((progress: CopyProgress) => {
      setCopyProgress(progress)
    })
    return unsub
  }, [runState])

  async function run(): Promise<void> {
    if (!activeSession) return
    cancelledRef.current = false
    setRunState('running')
    setCopyProgress({ total: actions.length, copied: 0, failed: 0, current: '' })

    let copied = 0
    let failed = 0
    try {
      const result = await window.api.copy.execute(actions, activeSession.id)
      copied = result?.copied ?? 0
      failed = result?.failed ?? 0
    } catch {
      failed = actions.length
    }

    // Leave the running screen as soon as the copy job finishes — session sync can be slow or
    // fail on large IPC payloads (e.g. many thumbnails) and must not block this transition.
    setSummary({ copied, failed })
    setCopyProgress(null)
    setRunState('done')
    deselectAll()

    try {
      const updatedSession = await window.api.sessions.get(activeSession.id)
      if (updatedSession) {
        updateActiveSession({ files: updatedSession.files, errorLog: updatedSession.errorLog })
        for (const f of updatedSession.files) {
          updateFile(f.id, { status: f.status, processed: f.processed, errorMessage: f.errorMessage })
        }
      }
    } catch {
      /* best-effort: explorer may refresh from disk on next navigation */
    }
  }

  async function cancel(): Promise<void> {
    cancelledRef.current = true
    await window.api.copy.cancel()
  }

  const totalSize = actions.reduce((sum, a) => {
    const file = files.find((f) => f.id === a.fileId)
    return sum + (file?.size ?? 0)
  }, 0)

  const dateFix = actions.filter((a) => a.fixDate).length
  const dupeCount = actions.filter((a) => a.isDuplicate).length

  // Group actions by year folder (first path segment after outputFolder)
  const outputFolder = activeSession?.outputFolder ?? ''
  type YearGroup = { yearFolder: string; destFolderPath: string; actions: CopyAction[] }
  const yearGroups: YearGroup[] = []
  const yearMap = new Map<string, YearGroup>()
  for (const action of actions) {
    const rel = action.destPath.slice(outputFolder.length + 1)
    const yearFolder = rel.split('/')[0] ?? 'unknown'
    if (!yearMap.has(yearFolder)) {
      const group: YearGroup = {
        yearFolder,
        destFolderPath: `${outputFolder}/${yearFolder}`,
        actions: []
      }
      yearMap.set(yearFolder, group)
      yearGroups.push(group)
    }
    yearMap.get(yearFolder)!.actions.push(action)
  }

  yearGroups.sort((a, b) => {
    const ka = yearFolderSortKey(a.yearFolder)
    const kb = yearFolderSortKey(b.yearFolder)
    if (ka !== kb) return ka - kb
    return a.yearFolder.localeCompare(b.yearFolder)
  })

  const percent =
    copyProgress && copyProgress.total > 0
      ? Math.round(((copyProgress.copied + copyProgress.failed) / copyProgress.total) * 100)
      : 0

  // ── Done state ─────────────────────────────────────────────────────────────
  if (runState === 'done' && summary) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6 px-8">
        <div
          className={cn(
            'flex h-16 w-16 items-center justify-center rounded-full',
            summary.failed > 0 ? 'bg-yellow-100' : 'bg-green-100'
          )}
        >
          {summary.failed > 0 ? (
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
          ) : (
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          )}
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold">{verb} complete</h2>
          <p className="text-sm text-muted-foreground">
            {summary.copied} file{summary.copied !== 1 ? 's' : ''} {isMove ? 'moved' : 'copied'}
            {summary.failed > 0 && `, ${summary.failed} failed`}
          </p>
        </div>
        <div className="flex gap-3">
          {summary.failed > 0 && (
            <Button variant="outline" onClick={() => setPage('explorer')}>
              View errors
            </Button>
          )}
          <Button onClick={() => setPage('explorer')}>Back to explorer</Button>
        </div>
      </div>
    )
  }

  // ── Running state ──────────────────────────────────────────────────────────
  if (runState === 'running') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-8 px-8">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            {isMove ? (
              <MoveRight className="h-7 w-7 animate-pulse text-muted-foreground" />
            ) : (
              <Copy className="h-7 w-7 animate-pulse text-muted-foreground" />
            )}
          </div>
          <h2 className="text-lg font-semibold">{verb}ing files…</h2>
        </div>
        <div className="w-full max-w-md space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="truncate max-w-[260px]">{copyProgress?.current ?? '—'}</span>
            <span className="shrink-0 tabular-nums font-medium">
              {percent}% · {copyProgress?.copied ?? 0} / {copyProgress?.total ?? '…'}
            </span>
          </div>
          <Progress value={percent} className="h-2" />
          {(copyProgress?.failed ?? 0) > 0 && (
            <p className="text-xs text-destructive text-right">{copyProgress!.failed} failed</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={cancel}>
          Cancel
        </Button>
      </div>
    )
  }

  // ── Preview state ──────────────────────────────────────────────────────────
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
        <span className="min-w-0 flex-1 text-sm font-medium">{verb} Preview</span>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Preparing actions…</span>
        </div>
      ) : actions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-muted-foreground text-sm">
            No files selected or no output folder set.
          </p>
          <Button variant="outline" onClick={() => setPage('explorer')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="flex shrink-0 items-center gap-4 border-b bg-muted/30 px-6 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{actions.length} files</span>
            <span>{formatBytes(totalSize)}</span>
            {dateFix > 0 && (
              <Badge variant="outline" className="gap-1 text-blue-600 border-blue-300">
                <CalendarClock className="h-2.5 w-2.5" />
                {dateFix} date fix{dateFix !== 1 ? 'es' : ''}
              </Badge>
            )}
            {dupeCount > 0 && (
              <Badge variant="outline" className="gap-1 text-orange-600 border-orange-300">
                {dupeCount} duplicate{dupeCount !== 1 ? 's' : ''}
              </Badge>
            )}
            {isMove && (
              <Badge variant="outline" className="gap-1 text-destructive border-destructive/40">
                <AlertTriangle className="h-2.5 w-2.5" />
                Move mode — originals will be deleted
              </Badge>
            )}
            {activeSession?.outputFolder && (
              <span className="flex flex-1 items-center justify-end gap-1 font-mono">
                <FolderOutput className="h-3 w-3 shrink-0" />
                {activeSession.outputFolder}
              </span>
            )}
          </div>

          {/* Year groups */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {yearGroups.map((group) => (
                <div key={group.yearFolder}>
                  {/* Group header */}
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-sm font-semibold">{group.yearFolder}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                      <FolderOutput className="h-3 w-3 shrink-0" />
                      {group.destFolderPath}
                      <span className="ml-1 text-muted-foreground/60">
                        · {group.actions.length} file{group.actions.length !== 1 ? 's' : ''}
                      </span>
                    </span>
                  </div>

                  <div className="rounded-md border overflow-hidden divide-y">
                    {group.actions.map((action) => {
                      const file = files.find((f) => f.id === action.fileId)
                      const name = file?.name ?? action.sourcePath.split('/').pop() ?? ''

                      return (
                        <div
                          key={action.fileId}
                          className="flex items-center gap-3 px-3 py-2 text-sm"
                        >
                          {/* Thumbnail */}
                          <div className="h-8 w-8 shrink-0 overflow-hidden rounded">
                            {file?.thumbnail ? (
                              <img
                                src={file.thumbnail}
                                alt={name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-muted text-[8px] font-mono text-muted-foreground">
                                {file?.ext.toUpperCase() ?? '?'}
                              </div>
                            )}
                          </div>

                          {/* Name */}
                          <span className="flex-1 truncate font-medium">{name}</span>

                          {/* Size */}
                          <span className="shrink-0 text-xs text-muted-foreground w-16 text-right">
                            {formatBytes(file?.size ?? 0)}
                          </span>

                          {/* Badges */}
                          <div className="flex items-center gap-1 shrink-0">
                            {action.fixDate && (
                              <Badge
                                variant="outline"
                                className="h-4 text-[10px] px-1.5 text-blue-600 border-blue-300"
                              >
                                Date fix
                              </Badge>
                            )}
                            {action.isDuplicate && (
                              <Badge
                                variant="outline"
                                className="h-4 text-[10px] px-1.5 text-orange-600 border-orange-300"
                              >
                                Duplicate
                              </Badge>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Footer */}
          {dateFix > 0 && (
            <div className="flex items-center gap-3 border-t border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 px-6 py-2">
              <CalendarClock className="h-4 w-4 shrink-0 text-blue-500" />
              <p className="flex-1 text-xs text-blue-900 dark:text-blue-100">
                {dateFix} file{dateFix !== 1 ? 's' : ''} with mismatched dates will be automatically
                fixed. If you want, you can go back and fix them yourself. Your originals won't be
                affected.
              </p>
            </div>
          )}
          <div className="flex shrink-0 items-center justify-between border-t px-6 py-4">
            <Button variant="ghost" onClick={() => setPage('explorer')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={run}
              className={cn(isMove && 'bg-destructive hover:bg-destructive/90')}
            >
              {isMove ? <MoveRight className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {verb} {actions.length} file{actions.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
