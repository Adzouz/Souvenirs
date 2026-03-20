import React from 'react'
import { useSessionStore } from '../store/session.store'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
}

export function ErrorLogDrawer({ open, onClose }: Props): React.JSX.Element {
  const { activeSession } = useSessionStore()
  const errors = activeSession?.errorLog?.filter((e) => !e.retried) ?? []

  async function retryAll(): Promise<void> {
    if (!activeSession) return
    await window.api.errors.retry(errors, activeSession.id)
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[420px] p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            Error log
            {errors.length > 0 && (
              <Badge variant="destructive" className="ml-1">{errors.length}</Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        {errors.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No errors
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-3 border-b">
              <span className="text-xs text-muted-foreground">{errors.length} unresolved</span>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={retryAll}>
                <RefreshCw className="h-3 w-3" />
                Retry all
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y">
                {errors.map((entry) => (
                  <div key={entry.id} className="px-6 py-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs capitalize">{entry.operation}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(entry.timestamp)}</span>
                    </div>
                    {entry.filePath && (
                      <p className="text-xs font-mono text-muted-foreground truncate">{entry.filePath}</p>
                    )}
                    <p className="text-xs text-destructive">{entry.message}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs gap-1 px-2"
                      onClick={() => window.api.errors.retry([entry], activeSession!.id)}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
