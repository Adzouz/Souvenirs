import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { X, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, AlertCircle, ExternalLink, FolderOpen, FolderOutput } from 'lucide-react'
import { cn, formatBytes, formatDate } from '@/lib/utils'
import type { MediaFile } from '../../../shared/types'

const DATE_STATUS_CONFIG = {
  ok: { label: 'OK', color: 'text-green-400', icon: CheckCircle2 },
  mismatch: { label: 'Mismatch', color: 'text-yellow-400', icon: AlertTriangle },
  missing: { label: 'No date', color: 'text-red-400', icon: AlertCircle }
}

interface LightboxProps {
  file: MediaFile
  currentIndex: number
  total: number
  sourceFolders: string[]
  outputFolder: string | null
  onClose: () => void
  onPrev: (() => void) | null
  onNext: (() => void) | null
}

export function Lightbox({
  file,
  currentIndex,
  total,
  sourceFolders,
  outputFolder,
  onClose,
  onPrev,
  onNext
}: LightboxProps): React.JSX.Element {
  const isVideo = file.mimeType.startsWith('video/')
  const statusCfg = DATE_STATUS_CONFIG[file.dateStatus]
  const StatusIcon = statusCfg.icon

  // Relative source path (same logic as FileRow in Explorer)
  const dir = file.path.substring(0, file.path.lastIndexOf('/'))
  const matchedSourceFolder = sourceFolders
    .map((s) => s.replace(/\/$/, ''))
    .find((s) => file.path.startsWith(s + '/') || file.path === s)
  const srcRootName = matchedSourceFolder
    ? matchedSourceFolder.substring(matchedSourceFolder.lastIndexOf('/') + 1)
    : ''
  const srcRelSuffix = matchedSourceFolder ? dir.slice(matchedSourceFolder.length).replace(/^\//, '') : ''
  const relativeSourcePath = srcRootName
    ? srcRelSuffix ? `${srcRootName}/${srcRelSuffix}` : srcRootName
    : dir.split('/').filter(Boolean).slice(-2).join('/') || dir

  // Destination display (same logic as getDestDisplay in Explorer)
  const destDisplay = outputFolder
    ? (() => {
        const rootName = outputFolder.substring(outputFolder.lastIndexOf('/') + 1)
        const yearFolder = file.destPath
          ? (file.destPath.split('/').slice(-2, -1)[0] ?? '')
          : (file.resolvedYear?.toString() ?? 'NoDate')
        return rootName === yearFolder ? yearFolder : `${rootName}/${yearFolder}`
      })()
    : null

  const isMoved = file.status === 'moved'
  const [mediaSrc, setMediaSrc] = useState<string | null>(null)
  const [triedDataUrlFallback, setTriedDataUrlFallback] = useState(false)
  const [mediaReady, setMediaReady] = useState(false)
  const [mediaError, setMediaError] = useState(false)
  /** Chromium often decodes AAC from HEVC .mov but not the video — dimensions stay 0. */
  const [audioOnlyInAppPlayer, setAudioOnlyInAppPlayer] = useState(false)

  useEffect(() => {
    let cancelled = false
    setMediaSrc(null)
    setTriedDataUrlFallback(false)
    setMediaReady(false)
    setMediaError(false)
    setAudioOnlyInAppPlayer(false)
    const p = isVideo
      ? window.api.dialog.mediaPreviewUrl(file.path)
      : window.api.dialog.pathToFileUrl(file.path)
    void p.then((url) => {
      if (!cancelled) setMediaSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [file.id, file.path, isVideo])

  // Do not reset mediaReady in an effect on [mediaSrc] — it runs after paint and can run
  // after a cached image’s synchronous onLoad, leaving mediaReady false forever (opacity-0).

  useEffect(() => {
    if (!isVideo || mediaSrc === null || mediaReady || audioOnlyInAppPlayer) return
    const id = window.setTimeout(() => setMediaReady(true), 12_000)
    return () => window.clearTimeout(id)
  }, [isVideo, mediaSrc, mediaReady, audioOnlyInAppPlayer])

  function inspectVideoElement(v: HTMLVideoElement): void {
    const hasDuration = Number.isFinite(v.duration) && v.duration > 0
    if (v.videoWidth === 0 && v.videoHeight === 0 && hasDuration) {
      setAudioOnlyInAppPlayer(true)
    }
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onPrev?.()
      else if (e.key === 'ArrowRight') onNext?.()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, onPrev, onNext])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={onClose}>
      {/* Top bar */}
      <div
        className="flex h-12 shrink-0 items-center justify-between gap-4 pl-20 pr-4"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 truncate text-sm font-medium text-white/80">{file.name}</span>
        <div className="flex shrink-0 items-center gap-3">
          <span className="tabular-nums text-xs text-white/40">
            {currentIndex + 1} / {total}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/60 hover:bg-white/10 hover:text-white"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Media area */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {onPrev && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 z-10 h-10 w-10 rounded-full bg-black/40 text-white hover:bg-black/60"
            onClick={onPrev}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}

        <div className="relative flex h-full w-full items-center justify-center p-6">
          {mediaError ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-white/40">Couldn't open preview</p>
              <Button
                variant="ghost"
                size="sm"
                className="border border-white/20 text-white/60 hover:bg-white/10 hover:text-white"
                onClick={() => window.api.dialog.openFile(file.path)}
              >
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                Open in default app
              </Button>
            </div>
          ) : mediaSrc === null ? (
            <p className="text-sm text-white/40">
              {isVideo
                ? 'Preparing preview… (HEVC/ProRes may transcode briefly the first time)'
                : 'Loading preview…'}
            </p>
          ) : (
            <>
              {isVideo ? (
                <>
                  {audioOnlyInAppPlayer ? (
                    <div className="relative z-[1] flex max-w-lg flex-col items-center gap-5 px-4 text-center">
                      <p className="text-sm text-white/70">
                        This video still has no picture in the built-in player (conversion may have failed, or
                        ffmpeg/ffprobe isn’t installed — check Settings). Audio plays below; open externally
                        for full quality.
                      </p>
                      <audio
                        key={`${file.id}-audio-${mediaSrc}`}
                        src={mediaSrc}
                        controls
                        className="w-full"
                        preload="auto"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="border border-white/20 text-white/80 hover:bg-white/10 hover:text-white"
                        onClick={() => window.api.dialog.openFile(file.path)}
                      >
                        <ExternalLink className="mr-2 h-3.5 w-3.5" />
                        Open in default app
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Video must stay visible (not opacity-0) or Chromium often never loads/decodes file:// media. */}
                      <video
                        key={`${file.id}-${mediaSrc}`}
                        src={mediaSrc}
                        className="relative z-[1] max-h-full max-w-full rounded object-contain shadow-2xl"
                        controls
                        playsInline
                        preload="auto"
                        onLoadedMetadata={(e) => {
                          setMediaReady(true)
                          inspectVideoElement(e.currentTarget)
                        }}
                        onLoadedData={(e) => {
                          setMediaReady(true)
                          inspectVideoElement(e.currentTarget)
                        }}
                        onCanPlay={(e) => {
                          setMediaReady(true)
                          inspectVideoElement(e.currentTarget)
                        }}
                        onError={() => setMediaError(true)}
                      />
                      {!mediaReady && (
                        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-black/40">
                          <p className="text-sm text-white/40">Loading preview…</p>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  {!mediaReady && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <p className="text-sm text-white/40">Loading preview…</p>
                    </div>
                  )}
                  <img
                    key={`${file.id}-${mediaSrc}`}
                    src={mediaSrc}
                    alt={file.name}
                    decoding="async"
                    onLoad={() => setMediaReady(true)}
                    className={cn(
                      'max-h-full max-w-full rounded object-contain shadow-2xl transition-opacity duration-200',
                      mediaReady ? 'opacity-100' : 'opacity-0'
                    )}
                    onError={() => {
                      if (triedDataUrlFallback) {
                        setMediaError(true)
                        return
                      }
                      setTriedDataUrlFallback(true)
                      void window.api.dialog.readImageAsDataUrl(file.path).then((dataUrl) => {
                        if (dataUrl) {
                          setMediaReady(false)
                          setMediaSrc(dataUrl)
                        } else {
                          setMediaError(true)
                        }
                      })
                    }}
                  />
                </>
              )}
            </>
          )}
        </div>

        {onNext && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 z-10 h-10 w-10 rounded-full bg-black/40 text-white hover:bg-black/60"
            onClick={onNext}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Bottom info bar */}
      <div
        className="flex shrink-0 items-center gap-5 border-t border-white/10 bg-black/60 px-6 py-3 text-xs text-white/50"
        onClick={(e) => e.stopPropagation()}
      >
        <span className={cn('flex items-center gap-1.5 shrink-0', statusCfg.color)}>
          <StatusIcon className="h-3 w-3" />
          {statusCfg.label}
        </span>
        {file.resolvedDate && (
          <span className="shrink-0">{formatDate(file.resolvedDate)}</span>
        )}
        {file.exifDate && file.dateStatus !== 'ok' && (
          <span className="shrink-0">
            EXIF: {formatDate(file.exifDate)}
          </span>
        )}
        {file.fsDate && file.dateStatus !== 'ok' && (
          <span className="shrink-0">
            Filesystem: {formatDate(file.fsDate)}
          </span>
        )}
        <span className="shrink-0">{formatBytes(file.size)}</span>
        <span className="ml-auto flex items-center gap-3 min-w-0 font-mono text-xs">
          {isMoved ? (
            destDisplay && (
              <span className="flex items-center gap-1 truncate text-green-400/70">
                <FolderOutput className="h-3 w-3 shrink-0" />
                {destDisplay}
              </span>
            )
          ) : (
            <>
              <span className="flex items-center gap-1 truncate text-white/30">
                <FolderOpen className="h-3 w-3 shrink-0" />
                {relativeSourcePath}
              </span>
              {file.processed && destDisplay && (
                <span className="flex items-center gap-1 truncate text-green-400/70">
                  <FolderOutput className="h-3 w-3 shrink-0" />
                  {destDisplay}
                </span>
              )}
            </>
          )}
        </span>
      </div>
    </div>
  )
}
