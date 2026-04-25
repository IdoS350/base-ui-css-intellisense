import * as path from 'path'
import * as vscode from 'vscode'

export function importsBaseUi(fileContent: string): boolean {
  return fileContent.includes('@base-ui/react')
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function findBridgeFiles(
  cssUri: vscode.Uri,
  token: vscode.CancellationToken,
): Promise<vscode.Uri[]> {
  if (token.isCancellationRequested) return []

  const basename = path.basename(cssUri.fsPath)
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(cssUri)
  const include = new vscode.RelativePattern(
    workspaceFolder ?? '',
    '**/*.{ts,tsx,js,jsx}',
  )

  // TODO: explore the findTextIsFile() api
  const candidates = await vscode.workspace.findFiles(
    include,
    '{**/node_modules,**/dist,**/out,**/releases}/**',
    undefined,
    token,
  )

  if (token.isCancellationRequested) return []

  const importPattern = new RegExp(`['"][^'"]*${escapeRegex(basename)}['"]`)
  const bridgeFiles: vscode.Uri[] = []

  for (const uri of candidates) {
    if (token.isCancellationRequested) return []
    const bytes = await vscode.workspace.fs.readFile(uri)
    const content = Buffer.from(bytes).toString('utf8')
    if (importPattern.test(content) && importsBaseUi(content)) {
      bridgeFiles.push(uri)
    }
  }

  return bridgeFiles
}
