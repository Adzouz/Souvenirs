import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { exiftool } from 'exiftool-vendored'
import type { DependencyStatus } from '../../shared/types'

const execFileAsync = promisify(execFile)

async function checkCommand(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cmd, args)
    return stdout.trim()
  } catch {
    return null
  }
}

export function registerMetadataHandlers(): void {
  ipcMain.handle('metadata:checkDependencies', async (): Promise<DependencyStatus> => {
    const [exiftoolOut, setFileOut, ffmpegOut] = await Promise.all([
      checkCommand('exiftool', ['-ver']),
      checkCommand('which', ['SetFile']),
      checkCommand('ffmpeg', ['-version'])
    ])

    return {
      exiftool: !!exiftoolOut,
      setFile: !!setFileOut,
      ffmpeg: !!ffmpegOut,
      exiftoolVersion: exiftoolOut ?? undefined
    }
  })

  ipcMain.handle(
    'metadata:fixDate',
    async (_, filePath: string, newDate: string): Promise<void> => {
      // Write to EXIF on the original file
      await exiftool.write(
        filePath,
        {
          CreateDate: newDate,
          DateTimeOriginal: newDate
        },
        ['-overwrite_original']
      )

      // Also sync filesystem creation date via SetFile (macOS only)
      if (process.platform === 'darwin') {
        // Convert ISO to MM/DD/YYYY HH:MM:SS for SetFile
        const d = new Date(newDate)
        const formatted = [
          String(d.getMonth() + 1).padStart(2, '0'),
          String(d.getDate()).padStart(2, '0'),
          d.getFullYear()
        ].join('/') + ' ' + [
          String(d.getHours()).padStart(2, '0'),
          String(d.getMinutes()).padStart(2, '0'),
          String(d.getSeconds()).padStart(2, '0')
        ].join(':')

        await execFileAsync('SetFile', ['-d', formatted, filePath]).catch(() => {
          // SetFile may not be available — non-fatal, EXIF was already written
          console.warn('SetFile not available, skipping filesystem date update')
        })
      }
    }
  )
}
