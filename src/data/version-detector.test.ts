import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vscode', () => ({}))

import { findBaseUiVersion } from './version-detector'

function makeFakeRoot(dir: string, packageName: string, version: string): void {
  const pkgDir = path.join(dir, 'node_modules', packageName)
  fs.mkdirSync(pkgDir, { recursive: true })
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ version }),
  )
}

describe('findBaseUiVersion', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'base-ui-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns version when package is found', () => {
    makeFakeRoot(tmpDir, '@base-ui/react', '1.2.3')
    expect(findBaseUiVersion([tmpDir], '@base-ui/react')).toBe('1.2.3')
  })

  it('returns null when package is not installed', () => {
    expect(findBaseUiVersion([tmpDir], '@base-ui/react')).toBeNull()
  })

  it('returns null for empty root list', () => {
    expect(findBaseUiVersion([], '@base-ui/react')).toBeNull()
  })

  it('finds package in second root when first has none', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'base-ui-test-'))
    try {
      makeFakeRoot(other, '@base-ui/react', '2.0.0')
      expect(findBaseUiVersion([tmpDir, other], '@base-ui/react')).toBe('2.0.0')
    } finally {
      fs.rmSync(other, { recursive: true, force: true })
    }
  })

  it('returns first root match when multiple roots have the package', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'base-ui-test-'))
    try {
      makeFakeRoot(tmpDir, '@base-ui/react', '1.0.0')
      makeFakeRoot(other, '@base-ui/react', '2.0.0')
      expect(findBaseUiVersion([tmpDir, other], '@base-ui/react')).toBe('1.0.0')
    } finally {
      fs.rmSync(other, { recursive: true, force: true })
    }
  })

  it('respects custom packageName', () => {
    makeFakeRoot(tmpDir, '@my-fork/react', '3.0.0')
    expect(findBaseUiVersion([tmpDir], '@my-fork/react')).toBe('3.0.0')
    expect(findBaseUiVersion([tmpDir], '@base-ui/react')).toBeNull()
  })

  it('skips corrupt package.json and continues', () => {
    const pkgDir = path.join(tmpDir, 'node_modules', '@base-ui', 'react')
    fs.mkdirSync(pkgDir, { recursive: true })
    fs.writeFileSync(path.join(pkgDir, 'package.json'), 'not json')

    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'base-ui-test-'))
    try {
      makeFakeRoot(other, '@base-ui/react', '1.4.1')
      expect(findBaseUiVersion([tmpDir, other], '@base-ui/react')).toBe('1.4.1')
    } finally {
      fs.rmSync(other, { recursive: true, force: true })
    }
  })
})
