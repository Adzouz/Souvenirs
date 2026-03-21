import React from 'react'
import { useEffect, useRef } from 'react'
import { useSessionStore } from '../store/session.store'
import { useFilesStore } from '../store/files.store'
import { useUiStore } from '../store/ui.store'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { ScanSearch, X } from 'lucide-react'

export function ScanPage(): React.JSX.Element {
  const { activeSession, updateActiveSession } = useSessionStore()
  const { files: existingFiles, setFiles, mergeFiles } = useFilesStore()
  const { setPage, scanProgress, setScanProgress, incrementalScanFolder, setIncrementalScanFolder } = useUiStore()
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!activeSession) return
    cancelledRef.current = false

    const unsub = window.api.scanner.onProgress((progress) => {
      setScanProgress(progress)
    })

    if (incrementalScanFolder) {
      // Incremental: only scan the new folder, merge results
      const existingPaths = existingFiles.map((f) => f.path)
      window.api.scanner
        .scanNew(activeSession.id, incrementalScanFolder, existingPaths)
        .then((newFiles) => {
          if (cancelledRef.current) return
          mergeFiles(newFiles)
          updateActiveSession({ files: useFilesStore.getState().files })
          setIncrementalScanFolder(null)
          setScanProgress(null)
          setPage('explorer')
        })
        .catch((err) => {
          console.error('Incremental scan error:', err)
          setIncrementalScanFolder(null)
          setScanProgress(null)
          setPage('explorer')
        })
    } else {
      window.api.scanner
        .scan(activeSession.id, activeSession.sourceFolders)
        .then((files) => {
          if (cancelledRef.current) return
          setFiles(files)
          updateActiveSession({ files })
          setScanProgress(null)
          setPage('explorer')
        })
        .catch((err) => {
          console.error('Scan error:', err)
          setScanProgress(null)
          setPage('setup')
        })
    }

    return unsub
  }, [])

  async function cancel(): Promise<void> {
    cancelledRef.current = true
    await window.api.scanner.cancel()
    setScanProgress(null)
    setPage('setup')
  }

  const percent =
    scanProgress && scanProgress.total > 0
      ? Math.round((scanProgress.scanned / scanProgress.total) * 100)
      : 0

  const phase = scanProgress?.phase ?? 'scanning'
  const phaseLabel =
    phase === 'hashing' ? 'Detecting duplicates…' :
    phase === 'matching' ? 'Matching with library…' :
    'Scanning files…'

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-8 px-8">
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <ScanSearch className="h-7 w-7 animate-pulse text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">{phaseLabel}</h2>
        {scanProgress && phase === 'scanning' && (
          <p className="text-sm text-muted-foreground">
            {scanProgress.found} media files found
          </p>
        )}
      </div>

      <div className="w-full max-w-md space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span className="truncate max-w-[260px]">{scanProgress?.current ?? '—'}</span>
          <span className="shrink-0 tabular-nums font-medium">
            {scanProgress && scanProgress.total > 0
              ? `${percent}% · ${scanProgress.scanned} / ${scanProgress.total}`
              : '…'}
          </span>
        </div>
        <Progress value={percent} className="h-2" />
      </div>

      <div className="flex gap-3 text-sm text-muted-foreground">
        {scanProgress && phase === 'scanning' && (
          <>
            <span className="rounded-full bg-muted px-3 py-1">
              {scanProgress.found} media found
            </span>
            {scanProgress.skipped > 0 && (
              <span className="rounded-full bg-muted px-3 py-1">
                {scanProgress.skipped} skipped
              </span>
            )}
          </>
        )}
      </div>

      <Button variant="ghost" size="sm" onClick={cancel}>
        <X className="mr-2 h-3 w-3" />
        Cancel
      </Button>
    </div>
  )
}
