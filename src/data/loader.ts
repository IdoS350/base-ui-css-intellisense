import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { fetchVersionData } from './fetcher'
import type { BaseUiData } from './types'
import { detectBaseUiVersion } from './version-detector'

function loadBundled(context: vscode.ExtensionContext): BaseUiData {
  const jsonPath = context.asAbsolutePath(
    path.join('data', 'base-ui-attributes.json'),
  )
  if (!fs.existsSync(jsonPath)) {
    return { version: 'unknown', components: {} }
  }
  return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as BaseUiData
}

export async function loadData(
  context: vscode.ExtensionContext,
  packageName: string,
  log: (msg: string) => void,
): Promise<BaseUiData> {
  const bundled = loadBundled(context)
  const installedVersion = detectBaseUiVersion(packageName)

  if (!installedVersion) {
    log(
      `No ${packageName} installation found — using bundled data (v${bundled.version}).`,
    )
    return bundled
  }

  log(`Detected ${packageName} v${installedVersion}.`)

  if (installedVersion === bundled.version) {
    log(`Version matches bundled data.`)
    return bundled
  }

  log(`Fetching data for v${installedVersion}...`)
  const fetched = await fetchVersionData(
    installedVersion,
    context.globalStorageUri.fsPath,
  )

  if (fetched) {
    log(`Loaded remote data for v${installedVersion}.`)
    return fetched
  }

  log(
    `No remote data for v${installedVersion} — falling back to bundled v${bundled.version}.`,
  )
  return bundled
}
