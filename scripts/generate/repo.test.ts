import * as fs from 'fs'
import { afterAll, describe, expect, it } from 'vitest'
import { validateRepo } from './repo'
import { makeTmpDir, writeFile } from './test-helpers'

describe('validateRepo', () => {
  const tmpRoot = makeTmpDir()
  afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

  it('returns false for an empty directory', () => {
    expect(validateRepo(tmpRoot)).toBe(false)
  })

  it('returns true when expected paths exist', () => {
    writeFile(tmpRoot, 'package.json', '{"version":"1.0.0"}')
    writeFile(tmpRoot, 'packages/react/src/.keep', '')
    expect(validateRepo(tmpRoot)).toBe(true)
  })
})
