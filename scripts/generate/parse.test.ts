import * as fs from 'fs'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { deriveComponentName, parseEnumFile, parseSharedEnums } from './parse'
import { makeTmpDir, writeFile } from './test-helpers'

describe('deriveComponentName', () => {
  it('strips DataAttributes.ts suffix', () => {
    expect(
      deriveComponentName('/some/path/ComboboxPopupDataAttributes.ts'),
    ).toBe('ComboboxPopup')
  })

  it('strips CssVars.ts suffix', () => {
    expect(deriveComponentName('/some/path/DialogPopupCssVars.ts')).toBe(
      'DialogPopup',
    )
  })
})

describe('parseEnumFile', () => {
  const tmpRoot = makeTmpDir()
  afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

  it('extracts direct string literal members', () => {
    const filePath = writeFile(
      tmpRoot,
      'ComboboxPopupDataAttributes.ts',
      `export enum ComboboxPopupDataAttributes {
  /**
   * Present when the items list is empty.
   */
  empty = 'data-empty',
}`,
    )
    const results = parseEnumFile(filePath, tmpRoot, new Map())
    expect(results.length).toBe(1)
    expect(results[0].value).toBe('data-empty')
    expect(results[0].description).toBe('Present when the items list is empty.')
    expect(results[0].component).toBe('ComboboxPopup')
  })

  it('resolves property-access members via sharedValues', () => {
    const filePath = writeFile(
      tmpRoot,
      'DialogPopupDataAttributes.ts',
      `export enum DialogPopupDataAttributes {
  open = CommonPopupDataAttributes.open,
}`,
    )
    const shared = new Map([['CommonPopupDataAttributes.open', 'data-open']])
    const results = parseEnumFile(filePath, tmpRoot, shared)
    expect(results[0].value).toBe('data-open')
  })

  it('skips members that cannot be resolved', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const filePath = writeFile(
      tmpRoot,
      'UnknownDataAttributes.ts',
      `export enum UnknownDataAttributes {
  mystery = SomeEnum.unknownMember,
}`,
    )
    const results = parseEnumFile(filePath, tmpRoot, new Map())
    expect(results.length).toBe(0)
    warn.mockRestore()
  })

  it('extracts @type union and stores it as rawType', () => {
    const filePath = writeFile(
      tmpRoot,
      'SideDataAttributes.ts',
      `export enum SideDataAttributes {
  /**
   * Which side.
   * @type {'top' | 'bottom'}
   */
  side = 'data-side',
}`,
    )
    const results = parseEnumFile(filePath, tmpRoot, new Map())
    expect(results[0].rawType).toBe(`'top' | 'bottom'`)
  })

  it('produces a relative sourceFile path', () => {
    const filePath = writeFile(
      tmpRoot,
      'packages/react/src/dialog/DialogDataAttributes.ts',
      `export enum DialogDataAttributes { open = 'data-open' }`,
    )
    const results = parseEnumFile(filePath, tmpRoot, new Map())
    expect(results[0].sourceFile).toBe(
      'packages/react/src/dialog/DialogDataAttributes.ts',
    )
  })

  it('handles files with multiple enums', () => {
    const filePath = writeFile(
      tmpRoot,
      'MultiEnumDataAttributes.ts',
      `export enum FooDataAttributes { a = 'data-a' }
export enum BarDataAttributes { b = 'data-b' }`,
    )
    const results = parseEnumFile(filePath, tmpRoot, new Map())
    expect(results.length).toBe(2)
    expect(results.map((r) => r.value)).toEqual(['data-a', 'data-b'])
  })
})

describe('parseSharedEnums', () => {
  const tmpRoot = makeTmpDir()
  afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

  it('builds the shared map from utils/ and resolves chained references', async () => {
    writeFile(
      tmpRoot,
      'packages/react/src/internals/stateAttributesMapping.ts',
      `export enum TransitionStatusDataAttributes {
  startingStyle = 'data-starting-style',
  endingStyle   = 'data-ending-style',
}`,
    )
    writeFile(
      tmpRoot,
      'packages/react/src/utils/popupStateMapping.ts',
      `export enum CommonPopupDataAttributes {
  open          = 'data-open',
  startingStyle = TransitionStatusDataAttributes.startingStyle,
}`,
    )

    const map = await parseSharedEnums(tmpRoot)

    expect(map.get('TransitionStatusDataAttributes.startingStyle')).toBe(
      'data-starting-style',
    )
    expect(map.get('CommonPopupDataAttributes.open')).toBe('data-open')
    expect(map.get('CommonPopupDataAttributes.startingStyle')).toBe(
      'data-starting-style',
    )
  })

  it('includes DataAttributes files for cross-component references', async () => {
    writeFile(
      tmpRoot,
      'packages/react/src/combobox/item/ComboboxItemDataAttributes.ts',
      `export enum ComboboxItemDataAttributes {
  highlighted = 'data-highlighted',
}`,
    )

    const map = await parseSharedEnums(tmpRoot)
    expect(map.get('ComboboxItemDataAttributes.highlighted')).toBe(
      'data-highlighted',
    )
  })
})
