import * as assert from 'assert'
import * as fs from 'fs'
import { after, describe, it } from 'node:test'
import { makeTmpDir, writeFile } from './test-helpers.js'
import { validateRepo } from './repo.js'

describe('validateRepo', () => {
  const tmpRoot = makeTmpDir()
  after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

  it('returns false for an empty directory', () => {
    assert.strictEqual(validateRepo(tmpRoot), false)
  })

  it('returns true when expected paths exist', () => {
    writeFile(tmpRoot, 'package.json', '{"version":"1.0.0"}')
    writeFile(tmpRoot, 'packages/react/src/.keep', '')
    assert.strictEqual(validateRepo(tmpRoot), true)
  })
})
