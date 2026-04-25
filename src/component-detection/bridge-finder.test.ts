import { describe, expect, it, vi } from 'vitest'
import { importsBaseUi } from './bridge-finder'

vi.mock('vscode', () => ({}))

describe('importsBaseUi', () => {
  it('has named import', () =>
    expect(importsBaseUi("import { Popover } from '@base-ui/react'")).toBe(
      true,
    ))

  it('has namespace import', () =>
    expect(importsBaseUi("import * as BaseUI from '@base-ui/react'")).toBe(
      true,
    ))

  it('not present', () =>
    expect(importsBaseUi("import React from 'react'")).toBe(false))

  it('commented out (acceptable false-positive)', () =>
    expect(importsBaseUi("// import { X } from '@base-ui/react'")).toBe(true))
})
