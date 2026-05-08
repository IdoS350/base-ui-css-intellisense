import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheFilePath, fetchVersionData, releaseUrl } from './fetcher'
import type { BaseUiData } from './types'

const MOCK_DATA: BaseUiData = {
  version: '1.2.3',
  components: {
    Button: { attributes: [], cssVariables: [] },
  },
}

describe('releaseUrl', () => {
  it('builds the correct GitHub release URL', () => {
    expect(releaseUrl('1.2.3')).toBe(
      'https://github.com/IdoS350/base-ui-css-intellisense/releases/download/base-ui-v1.2.3/base-ui-attributes.json',
    )
  })
})

describe('cacheFilePath', () => {
  it('builds a versioned cache path inside storageDir', () => {
    const result = cacheFilePath('/storage', '1.2.3')
    expect(result).toBe(path.join('/storage', 'base-ui-attributes-1.2.3.json'))
  })
})

describe('fetchVersionData', () => {
  let tmpDir: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'base-ui-fetch-test-'))
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  it('returns cached data without fetching when cache exists', async () => {
    const cachePath = cacheFilePath(tmpDir, '1.2.3')
    fs.writeFileSync(cachePath, JSON.stringify(MOCK_DATA))

    const result = await fetchVersionData('1.2.3', tmpDir)

    expect(result).toEqual(MOCK_DATA)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches, writes cache, and returns data on cache miss', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => MOCK_DATA,
    })

    const result = await fetchVersionData('1.2.3', tmpDir)

    expect(result).toEqual(MOCK_DATA)
    const cachePath = cacheFilePath(tmpDir, '1.2.3')
    expect(fs.existsSync(cachePath)).toBe(true)
    expect(JSON.parse(fs.readFileSync(cachePath, 'utf-8'))).toEqual(MOCK_DATA)
  })

  it('returns null when the release does not exist (404)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 })

    const result = await fetchVersionData('9.9.9', tmpDir)

    expect(result).toBeNull()
  })

  it('returns null on network error', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'))

    const result = await fetchVersionData('1.2.3', tmpDir)

    expect(result).toBeNull()
  })

  it('re-fetches when cached file is corrupt', async () => {
    const cachePath = cacheFilePath(tmpDir, '1.2.3')
    fs.writeFileSync(cachePath, 'not json')

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => MOCK_DATA,
    })

    const result = await fetchVersionData('1.2.3', tmpDir)

    expect(result).toEqual(MOCK_DATA)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
