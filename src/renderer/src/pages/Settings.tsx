import React from 'react'
import { useUiStore } from '../store/ui.store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, CheckCircle2, XCircle, Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SettingsPage(): React.JSX.Element {
  const { setPage, dependencies, theme, setTheme } = useUiStore()

  function DepRow({
    name,
    ok,
    version,
    installHint
  }: {
    name: string
    ok: boolean
    version?: string
    installHint: string
  }): React.JSX.Element {
    return (
      <div className="flex items-center gap-3 py-3">
        {ok ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
        ) : (
          <XCircle className="h-5 w-5 shrink-0 text-red-500" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium">{name}</span>
            {ok && version && (
              <Badge variant="secondary" className="text-xs">
                {version}
              </Badge>
            )}
          </div>
          {!ok && <p className="text-xs text-muted-foreground mt-0.5">{installHint}</p>}
        </div>
        <Badge variant={ok ? 'secondary' : 'destructive'} className="text-xs">
          {ok ? 'Installed' : 'Missing'}
        </Badge>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      <div
        className="h-12 w-full shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      <div className="flex flex-1 flex-col overflow-hidden px-8 pb-8">
        <div className="flex items-center gap-3 py-6">
          <Button variant="ghost" size="icon" onClick={() => setPage('home')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>

        <Separator />

        <div className="mt-6 max-w-lg space-y-6">
          {/* Theme */}
          <div>
            <h2 className="text-sm font-semibold mb-1">Appearance</h2>
            <p className="text-xs text-muted-foreground mb-3">Choose the interface theme.</p>
            <div className="flex rounded-md border overflow-hidden w-fit text-sm">
              <button
                className={cn(
                  'flex items-center gap-2 px-4 py-2 transition-colors',
                  theme === 'light' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
                onClick={() => setTheme('light')}
              >
                <Sun className="h-4 w-4" />
                Light
              </button>
              <button
                className={cn(
                  'flex items-center gap-2 px-4 py-2 border-l transition-colors',
                  theme === 'dark' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
                onClick={() => setTheme('dark')}
              >
                <Moon className="h-4 w-4" />
                Dark
              </button>
            </div>
          </div>

          <Separator />

          <div>
            <h2 className="text-sm font-semibold mb-1">Dependencies</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Souvenirs requires these tools to be installed on your system.
            </p>
            <div className="rounded-lg border divide-y">
              <div className="px-4">
                <DepRow
                  name="exiftool"
                  ok={dependencies?.exiftool ?? false}
                  version={dependencies?.exiftoolVersion}
                  installHint="brew install exiftool"
                />
              </div>
              <div className="px-4">
                <DepRow
                  name="SetFile"
                  ok={dependencies?.setFile ?? false}
                  installHint="Install Xcode Command Line Tools: xcode-select --install"
                />
              </div>
              <div className="px-4">
                <DepRow
                  name="ffmpeg"
                  ok={dependencies?.ffmpeg ?? false}
                  installHint="brew install ffmpeg (required for video thumbnails)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
