import * as fs from 'fs'
import * as path from 'path'

export function validateRepo(repoPath: string): boolean {
  const srcDir = path.join(repoPath, 'packages/react/src')
  const pkgFile = path.join(repoPath, 'package.json')
  return fs.existsSync(srcDir) && fs.existsSync(pkgFile)
}

export function readVersion(repoPath: string): string {
  const pkgPath = path.join(repoPath, 'packages/react/package.json')
  const fallback = path.join(repoPath, 'package.json')
  const pkg = JSON.parse(
    fs.readFileSync(fs.existsSync(pkgPath) ? pkgPath : fallback, 'utf-8'),
  )
  return pkg.version as string
}
