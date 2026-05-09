import * as fs from 'fs'
import * as path from 'path'
import type { BaseUiData } from './types'

const REPO = 'IdoS350/base-ui-css-intellisense-data'
const ASSET_NAME = 'base-ui-attributes.json'

export function releaseUrl(version: string): string {
  return `https://github.com/${REPO}/releases/download/base-ui-v${version}/${ASSET_NAME}`
}

export function cacheFilePath(storageDir: string, version: string): string {
  return path.join(storageDir, `base-ui-attributes-${version}.json`)
}

export async function fetchVersionData(
  version: string,
  storageDir: string,
): Promise<BaseUiData | null> {
  const cachePath = cacheFilePath(storageDir, version)

  if (fs.existsSync(cachePath)) {
    try {
      return JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as BaseUiData
    } catch {
      // corrupt cache, fall through to re-fetch
    }
  }

  let data: BaseUiData
  try {
    const response = await fetch(releaseUrl(version))
    if (!response.ok) return null
    data = (await response.json()) as BaseUiData
  } catch {
    return null
  }

  fs.mkdirSync(storageDir, { recursive: true })
  fs.writeFileSync(cachePath, JSON.stringify(data), 'utf-8')

  return data
}
