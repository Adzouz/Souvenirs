import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { CalendarClock, Loader2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { MediaFile } from '../../../shared/types'

function toDatetimeLocal(iso: string): string {
  // Convert ISO string to value usable by <input type="datetime-local">
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(value: string): string {
  // Convert datetime-local value back to ISO string
  return new Date(value).toISOString()
}

export function DateFixDialog({
  file,
  open,
  onClose,
  onFixed
}: {
  file: MediaFile | null
  open: boolean
  onClose: () => void
  onFixed: (fileId: string, newDate: string) => void
}): React.JSX.Element {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!file) return
    // Pre-fill with best available date
    const prefill = file.exifDate ?? file.fsDate
    setValue(prefill ? toDatetimeLocal(prefill) : '')
    setError(null)
  }, [file])

  async function handleSave(): Promise<void> {
    if (!file || !value) return
    setSaving(true)
    setError(null)
    try {
      const iso = fromDatetimeLocal(value)
      await window.api.metadata.fixDate(file.path, iso)
      onFixed(file.id, iso)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fix date')
    } finally {
      setSaving(false)
    }
  }

  if (!file) return <></>

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Fix date
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-sm text-muted-foreground font-mono truncate">{file.name}</p>

          {/* Show existing dates for reference */}
          {(file.exifDate || file.fsDate || file.fsMtimeDate) && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs">
              {(
                [
                  { label: 'EXIF', date: file.exifDate },
                  { label: 'Created', date: file.fsDate },
                  { label: 'Modified', date: file.fsMtimeDate }
                ] as { label: string; date: string | null }[]
              ).map(({ label, date }) =>
                date ? (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{formatDate(date)}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-5 text-[10px] px-1.5"
                        onClick={() => setValue(toDatetimeLocal(date))}
                      >
                        Use
                      </Button>
                    </div>
                  </div>
                ) : null
              )}
            </div>
          )}

          <Separator />

          {/* Date input */}
          <div className="space-y-1.5">
            <Label htmlFor="fix-date-input">Set date to</Label>
            <Input
              id="fix-date-input"
              type="datetime-local"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="relative pr-10 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-3 [&::-webkit-calendar-picker-indicator]:top-1/2 [&::-webkit-calendar-picker-indicator]:-translate-y-1/2 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!value || saving}>
            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Apply fix
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
