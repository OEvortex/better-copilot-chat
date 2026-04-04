import { join } from 'path'
import { pathToFileURL } from 'url'

export function getDistImportSpecifier(baseDir) {
  const distPath = join(baseDir, '..', 'dist', 'cli.mjs')
  return pathToFileURL(distPath).href
}
