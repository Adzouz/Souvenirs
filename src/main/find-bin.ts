import { existsSync } from 'fs'
import { join } from 'path'

const SEARCH_PATHS = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/opt/local/bin']

export function findBin(name: string): string {
  for (const dir of SEARCH_PATHS) {
    const full = join(dir, name)
    if (existsSync(full)) return full
  }
  return name
}
