import React from 'react'
import { useEffect } from 'react'
import { useSessionStore } from '../store/session.store'
import { useUiStore } from '../store/ui.store'
import { useFilesStore } from '../store/files.store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { formatDate } from '@/lib/utils'
import {
  FolderOpen,
  FolderOutput,
  Plus,
  Trash2,
  Settings,
  AlertTriangle,
  Clock,
  ChevronRight,
  Image,
  Loader2
} from 'lucide-react'
import type { Session } from '../../../shared/types'

export function HomePage(): React.JSX.Element {
  const { sessions, loadSessions, setActiveSession } = useSessionStore()
  const { setPage } = useUiStore()
  const { setFiles } = useFilesStore()
  const [missingFolders, setMissingFolders] = React.useState<Set<string>>(new Set())
  const [openingSessionId, setOpeningSessionId] = React.useState<string | null>(null)

  useEffect(() => {
    loadSessions()
  }, [])

  useEffect(() => {
    if (sessions.length === 0) return
    const allFolders = [
      ...new Set([
        ...sessions.flatMap((s) => s.sourceFolders),
        ...sessions.flatMap((s) => (s.outputFolder ? [s.outputFolder] : []))
      ])
    ]
    Promise.all(allFolders.map(async (f) => ({ f, exists: await window.api.dialog.pathExists(f) }))).then(
      (results) => {
        setMissingFolders(new Set(results.filter((r) => !r.exists).map((r) => r.f)))
      }
    )
  }, [sessions])

  async function openSession(session: Session): Promise<void> {
    setOpeningSessionId(session.id)
    setActiveSession(session)
    setFiles(session.files)

    // Resolve destPaths for processed files that predate this field
    if (session.outputFolder) {
      const missing = session.files.filter((f) => f.processed && !f.destPath)
      if (missing.length > 0) {
        const resolved = await window.api.dialog.resolveDestPaths(
          session.outputFolder,
          missing.map((f) => f.name)
        )
        const { updateFile } = useFilesStore.getState()
        for (const f of missing) {
          if (resolved[f.name]) updateFile(f.id, { destPath: resolved[f.name] })
        }
      }
    }

    setPage(session.files.length > 0 ? 'explorer' : 'setup')
  }

  async function deleteSession(id: string): Promise<void> {
    await window.api.sessions.delete(id)
    loadSessions()
  }

  function newSession(): void {
    setActiveSession(null)
    setFiles([])
    setPage('setup')
  }

  if (openingSessionId) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <FolderOpen className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Opening session…</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Titlebar drag area */}
      <div
        className="h-12 w-full shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <div className="flex flex-1 flex-col overflow-hidden px-8 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between py-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Souvenirs</h1>
            <p className="text-sm text-muted-foreground">Sort your photos and videos by year</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={() => setPage('settings')}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button onClick={newSession}>
              <Plus className="mr-2 h-4 w-4" />
              New session
            </Button>
          </div>
        </div>

        <Separator />

        {/* Sessions list */}
        <div className="mt-6 flex-1 overflow-auto">
          {sessions.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="rounded-full bg-muted p-6">
                <Image className="h-10 w-10 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No sessions yet</p>
                <p className="text-sm text-muted-foreground">
                  Create a new session to start sorting your media
                </p>
              </div>
              <Button onClick={newSession}>
                <Plus className="mr-2 h-4 w-4" />
                New session
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {sessions.map((session) => {
                const hasMissingFolders =
                  session.sourceFolders.some((f) => missingFolders.has(f)) ||
                  (!!session.outputFolder && missingFolders.has(session.outputFolder))
                const pendingCount = session.files.filter((f) => !f.processed).length
                const processedCount = session.files.filter((f) => f.processed).length

                return (
                  <div
                    key={session.id}
                    className="group flex cursor-pointer items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
                    onClick={() => openSession(session)}
                  >
                    {/* Icon */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                      <FolderOpen className="h-5 w-5 text-muted-foreground" />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{session.name}</span>
                        {hasMissingFolders && (
                          <Badge variant="destructive" className="gap-1 text-xs">
                            <AlertTriangle className="h-3 w-3" />
                            Drive missing
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(session.lastAccessedAt)}
                        </span>
                        {session.files.length > 0 && (
                          <>
                            <span>{session.files.length} files</span>
                            {processedCount > 0 && (
                              <span className="text-green-600">{processedCount} processed</span>
                            )}
                            {pendingCount > 0 && <span>{pendingCount} remaining</span>}
                          </>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground font-mono">
                        {session.outputFolder && (
                          <span className="flex items-center gap-1 truncate shrink-0">
                            <FolderOutput className="h-3 w-3 shrink-0" />
                            {session.outputFolder}
                          </span>
                        )}
                        {session.sourceFolders.length > 0 && (
                          <span className="flex items-center gap-1 truncate text-muted-foreground/70">
                            <FolderOpen className="h-3 w-3 shrink-0" />
                            {session.sourceFolders.slice(0, 2).join(', ')}
                            {session.sourceFolders.length > 2 &&
                              ` +${session.sourceFolders.length - 2} more`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete session?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove the session and its scan history. Your files won't be
                              affected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteSession(session.id)
                              }}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
