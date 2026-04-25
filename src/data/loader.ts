import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import type { BaseUiData } from './types'

let cached: BaseUiData | null = null

export function loadData(context: vscode.ExtensionContext): BaseUiData {
  if (cached) return cached

  const jsonPath = context.asAbsolutePath(
    path.join('data', 'base-ui-attributes.json'),
  )

  if (!fs.existsSync(jsonPath)) {
    console.warn(
      '[base-ui-intellisense] base-ui-attributes.json not found. Run `pnpm run generate` first.',
    )
    return (cached = { version: 'unknown', components: {} })
  }

  const raw = fs.readFileSync(jsonPath, 'utf-8')
  cached = JSON.parse(raw) as BaseUiData
  return cached
}
