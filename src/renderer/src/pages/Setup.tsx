import React, { useState, useMemo } from 'react'
import { useSessionStore } from '../store/session.store'
import { useUiStore } from '../store/ui.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft,
  FolderOpen,
  FolderOutput,
  Plus,
  X,
  ScanSearch,
  Copy,
  MoveRight,
  AlertTriangle,
  AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TransferMode } from '../../../shared/types'

// Returns a conflict reason if library overlaps with any folder-to-sort, null otherwise
function getPathConflict(sourceFolders: string[], outputFolder: string): string | null {
  if (!outputFolder) return null
  const normalize = (p: string): string => (p.endsWith('/') ? p : p + '/')
  const normOut = normalize(outputFolder)

  for (const src of sourceFolders) {
    const normSrc = normalize(src)
    if (normSrc === normOut || src === outputFolder) {
      return `The library folder is the same as a folder to sort (${src}). This would overwrite source files.`
    }
    if (normOut.startsWith(normSrc)) {
      return `The library folder is inside a folder to sort (${src}). The scan would pick up its own output, creating an infinite loop.`
    }
    if (normSrc.startsWith(normOut)) {
      return `A folder to sort (${src}) is inside the library folder. In move mode this would delete files from inside the library.`
    }
  }
  return null
}

export function SetupPage(): React.JSX.Element {
  const { activeSession, setActiveSession } = useSessionStore()
  const { setPage } = useUiStore()

  const [sessionName, setSessionName] = useState(activeSession?.name ?? '')
  const [sourceFolders, setSourceFolders] = useState<string[]>(
    activeSession?.sourceFolders ?? []
  )
  const [outputFolder, setOutputFolder] = useState<string>(activeSession?.outputFolder ?? '')
  const [transferMode, setTransferMode] = useState<TransferMode>(
    activeSession?.transferMode ?? 'copy'
  )
  const [showMoveConfirm, setShowMoveConfirm] = useState(false)

  const pathConflict = useMemo(
    () => getPathConflict(sourceFolders, outputFolder),
    [sourceFolders, outputFolder]
  )

  async function pickSourceFolder(): Promise<void> {
    const folder = await window.api.dialog.openFolder()
    if (folder && !sourceFolders.includes(folder)) {
      setSourceFolders((prev) => [...prev, folder])
    }
  }

  async function pickOutputFolder(): Promise<void> {
    const folder = await window.api.dialog.openFolder()
    if (folder) setOutputFolder(folder)
  }

  function removeSourceFolder(folder: string): void {
    setSourceFolders((prev) => prev.filter((f) => f !== folder))
  }

  function handleModeSelect(mode: TransferMode): void {
    if (mode === 'move' && transferMode !== 'move') {
      setShowMoveConfirm(true)
    } else {
      setTransferMode(mode)
    }
  }

  async function startScan(): Promise<void> {
    const name = sessionName.trim() || `Session ${new Date().toLocaleDateString()}`

    let session = activeSession
    if (!session) {
      session = await window.api.sessions.create(name, sourceFolders, outputFolder, transferMode)
    } else {
      session = { ...session, name, sourceFolders, outputFolder: outputFolder || null, transferMode }
      await window.api.sessions.update(session)
    }
    setActiveSession(session)
    setPage('scan')
  }

  const canStart = (sourceFolders.length > 0 || !!outputFolder) && !pathConflict

  return (
    <div className="flex h-screen flex-col">
      <div className="h-12 w-full shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

      <div className="flex flex-1 flex-col overflow-hidden px-8 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3 py-6">
          <Button variant="ghost" size="icon" onClick={() => setPage('home')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Session Setup</h1>
            <p className="text-sm text-muted-foreground">Set up your photo library and folders to sort</p>
          </div>
        </div>

        <Separator />

        <div className="mt-6 flex flex-1 flex-col gap-6 overflow-auto">
          {/* Session name */}
          <div className="space-y-2">
            <Label htmlFor="session-name">Session name</Label>
            <Input
              id="session-name"
              placeholder="My Photos 2024"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {/* Photo library (output folder) */}
          <div className="space-y-3">
            <div>
              <Label>Photo library</Label>
              <p className="text-xs text-muted-foreground">
                Your organized archive, structured by year (e.g.{' '}
                <code className="text-xs">YYYY/</code>). Files already sorted here appear as processed.
              </p>
            </div>

            {outputFolder ? (
              <div
                className={cn(
                  'flex items-center gap-3 rounded-md border px-3 py-2',
                  pathConflict ? 'border-destructive bg-destructive/5' : 'bg-muted/30'
                )}
              >
                <FolderOutput
                  className={cn(
                    'h-4 w-4 shrink-0',
                    pathConflict ? 'text-destructive' : 'text-muted-foreground'
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-mono">{outputFolder}</span>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  Library
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground"
                  onClick={pickOutputFolder}
                >
                  Change
                </Button>
              </div>
            ) : (
              <button
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                onClick={pickOutputFolder}
              >
                <FolderOutput className="h-5 w-5" />
                <span className="text-sm">Click to set your photo library folder</span>
              </button>
            )}

            {/* Inline conflict error */}
            {pathConflict && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-destructive">{pathConflict}</p>
              </div>
            )}
          </div>

          {/* Folders to sort */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Folders to sort</Label>
                <p className="text-xs text-muted-foreground">
                  Unsorted media to organize into your library. Optional — skip this to browse your library only.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={pickSourceFolder}>
                <Plus className="mr-2 h-3 w-3" />
                Add folder
              </Button>
            </div>

            {sourceFolders.length === 0 ? (
              <button
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                onClick={pickSourceFolder}
              >
                <FolderOpen className="h-5 w-5" />
                <span className="text-sm">Click to add a folder to sort</span>
              </button>
            ) : (
              <div className="space-y-2">
                {sourceFolders.map((folder) => (
                  <div
                    key={folder}
                    className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2"
                  >
                    <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-mono">{folder}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeSourceFolder(folder)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={pickSourceFolder}
                >
                  <Plus className="mr-2 h-3 w-3" />
                  Add another folder
                </Button>
              </div>
            )}
          </div>

          {/* Transfer mode */}
          <div className="space-y-3">
            <div>
              <Label>Transfer mode</Label>
              <p className="text-xs text-muted-foreground">
                How files are moved from sorted folders into the library
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-md">
              {/* Copy */}
              <button
                onClick={() => handleModeSelect('copy')}
                className={cn(
                  'flex flex-col items-start gap-1.5 rounded-lg border-2 p-4 text-left transition-colors',
                  transferMode === 'copy'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/40'
                )}
              >
                <div className="flex items-center gap-2">
                  <Copy className="h-4 w-4" />
                  <span className="font-medium text-sm">Copy</span>
                  <Badge variant="secondary" className="text-xs">Recommended</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Originals stay untouched. Safe if you have enough disk space.
                </p>
              </button>

              {/* Move */}
              <button
                onClick={() => handleModeSelect('move')}
                className={cn(
                  'flex flex-col items-start gap-1.5 rounded-lg border-2 p-4 text-left transition-colors',
                  transferMode === 'move'
                    ? 'border-destructive bg-destructive/5'
                    : 'border-border hover:border-muted-foreground/40'
                )}
              >
                <div className="flex items-center gap-2">
                  <MoveRight className="h-4 w-4" />
                  <span className="font-medium text-sm">Move</span>
                  {transferMode === 'move' && (
                    <Badge variant="destructive" className="text-xs gap-1">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      Destructive
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Originals are deleted after transfer. Use when disk space is limited.
                </p>
              </button>
            </div>

            {transferMode === 'move' && (
              <div className="flex items-start gap-2 max-w-md rounded-md border border-yellow-400/50 bg-yellow-50 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
                <p className="text-xs text-yellow-700">
                  <strong>Move mode is active.</strong> Original files will be permanently deleted after transfer. This cannot be undone. Make sure you have a backup.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4">
          <p className="text-xs text-muted-foreground">
            {sourceFolders.length === 0
              ? 'Library-only mode — browse and review your organized media'
              : transferMode === 'copy'
              ? 'Files will be copied — originals are never modified'
              : 'Files will be moved — originals will be deleted after transfer'}
          </p>
          <Button onClick={startScan} disabled={!canStart}>
            <ScanSearch className="mr-2 h-4 w-4" />
            Start scan
          </Button>
        </div>
      </div>

      {/* Move mode confirmation dialog */}
      <AlertDialog open={showMoveConfirm} onOpenChange={setShowMoveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Switch to Move mode?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                In Move mode, original files are <strong>permanently deleted</strong> after being transferred to the destination. This cannot be undone.
              </span>
              <span className="block">
                Only use this if you are running low on disk space and have already backed up your files elsewhere.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Copy mode</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => setTransferMode('move')}
            >
              Switch to Move mode
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
