import * as assert from 'assert'
import * as fs from 'fs'
import { after, describe, it } from 'node:test'
import { makeTmpDir, writeFile } from './test-helpers.js'
import { deriveComponentName, parseEnumFile, parseSharedEnums } from './parse.js'

describe('deriveComponentName', () => {
  it('strips DataAttributes.ts suffix', () => {
    assert.strictEqual(
      deriveComponentName('/some/path/ComboboxPopupDataAttributes.ts'),
      'ComboboxPopup',
    )
  })

  it('strips CssVars.ts suffix', () => {
    assert.strictEqual(
      deriveComponentName('/some/path/DialogPopupCssVars.ts'),
      'DialogPopup',
    )
  })
})

describe('parseEnumFile', () => {
  const tmpRoot = makeTmpDir()
  after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

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
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].value, 'data-empty')
    assert.strictEqual(
      results[0].description,
      'Present when the items list is empty.',
    )
    assert.strictEqual(results[0].component, 'ComboboxPopup')
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
    assert.strictEqual(results[0].value, 'data-open')
  })

  it('skips members that cannot be resolved', () => {
    const filePath = writeFile(
      tmpRoot,
      'UnknownDataAttributes.ts',
      `export enum UnknownDataAttributes {
  mystery = SomeEnum.unknownMember,
}`,
    )
    const results = parseEnumFile(filePath, tmpRoot, new Map())
    assert.strictEqual(results.length, 0)
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
    assert.strictEqual(results[0].rawType, `'top' | 'bottom'`)
  })

  it('produces a relative sourceFile path', () => {
    const filePath = writeFile(
      tmpRoot,
      'packages/react/src/dialog/DialogDataAttributes.ts',
      `export enum DialogDataAttributes { open = 'data-open' }`,
    )
    const results = parseEnumFile(filePath, tmpRoot, new Map())
    assert.strictEqual(
      results[0].sourceFile,
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
    assert.strictEqual(results.length, 2)
    assert.deepStrictEqual(
      results.map((r) => r.value),
      ['data-a', 'data-b'],
    )
  })
})

describe('parseSharedEnums', () => {
  const tmpRoot = makeTmpDir()
  after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

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

    assert.strictEqual(
      map.get('TransitionStatusDataAttributes.startingStyle'),
      'data-starting-style',
    )
    assert.strictEqual(map.get('CommonPopupDataAttributes.open'), 'data-open')
    assert.strictEqual(
      map.get('CommonPopupDataAttributes.startingStyle'),
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
    assert.strictEqual(
      map.get('ComboboxItemDataAttributes.highlighted'),
      'data-highlighted',
    )
  })
})
