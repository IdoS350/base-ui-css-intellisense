import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

export function findBaseUiVersion(
  rootPaths: string[],
  packageName: string,
): string | null {
  for (const root of rootPaths) {
    const pkgPath = path.join(root, 'node_modules', packageName, 'package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
          version: string
        }
        return pkg.version
      } catch {
        // corrupt package.json, try next root
      }
    }
  }
  return null
}

export function detectBaseUiVersion(packageName: string): string | null {
  const folders = vscode.workspace.workspaceFolders
  if (!folders) return null
  return findBaseUiVersion(
    folders.map((f) => f.uri.fsPath),
    packageName,
  )
}
