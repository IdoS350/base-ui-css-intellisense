import * as assert from 'assert'
import { describe, it } from 'node:test'
import { groupByComponent, parseTypeUnion } from './transform.js'

describe('parseTypeUnion', () => {
  it('parses a quoted union', () => {
    assert.deepStrictEqual(
      parseTypeUnion(`'top' | 'bottom' | 'left' | 'right'`),
      [
        { value: 'top' },
        { value: 'bottom' },
        { value: 'left' },
        { value: 'right' },
      ],
    )
  })

  it('handles double-quoted values', () => {
    assert.deepStrictEqual(parseTypeUnion(`"asc" | "desc"`), [
      { value: 'asc' },
      { value: 'desc' },
    ])
  })

  it('returns [] for a bare primitive like "number"', () => {
    assert.deepStrictEqual(parseTypeUnion('number'), [])
  })

  it('returns [] for undefined', () => {
    assert.deepStrictEqual(parseTypeUnion(undefined), [])
  })

  it('returns [] for an empty string', () => {
    assert.deepStrictEqual(parseTypeUnion(''), [])
  })
})

describe('groupByComponent', () => {
  it('groups attributes under their component', () => {
    const rawAttrs = [
      {
        value: 'data-open',
        description: 'Present when open.',
        component: 'Dialog',
        sourceFile: 'packages/react/src/dialog/DialogDataAttributes.ts',
      },
    ]
    const result = groupByComponent(rawAttrs, [])
    assert.ok(result['Dialog'])
    assert.strictEqual(result['Dialog'].attributes[0].name, 'data-open')
    assert.strictEqual(
      result['Dialog'].attributes[0].description,
      'Present when open.',
    )
    assert.strictEqual(
      result['Dialog'].attributesSourceFile,
      'packages/react/src/dialog/DialogDataAttributes.ts',
    )
  })

  it('parses values from rawType', () => {
    const rawAttrs = [
      {
        value: 'data-side',
        rawType: `'top' | 'bottom'`,
        component: 'Combobox',
        sourceFile: 'packages/react/src/combobox/ComboboxDataAttributes.ts',
      },
    ]
    const result = groupByComponent(rawAttrs, [])
    assert.deepStrictEqual(result['Combobox'].attributes[0].values, [
      { value: 'top' },
      { value: 'bottom' },
    ])
  })

  it('groups css variables under their component', () => {
    const rawCssVars = [
      {
        value: '--anchor-width',
        description: 'The width of the anchor.',
        component: 'Combobox',
        sourceFile: 'packages/react/src/combobox/ComboboxCssVars.ts',
      },
    ]
    const result = groupByComponent([], rawCssVars)
    assert.strictEqual(
      result['Combobox'].cssVariables[0].name,
      '--anchor-width',
    )
    assert.strictEqual(
      result['Combobox'].cssVarsSourceFile,
      'packages/react/src/combobox/ComboboxCssVars.ts',
    )
  })

  it('appends rawType to css var description in parens', () => {
    const rawCssVars = [
      {
        value: '--nested-dialogs',
        description: 'How many dialogs are nested.',
        rawType: 'number',
        component: 'Dialog',
        sourceFile: 'a.ts',
      },
    ]
    const result = groupByComponent([], rawCssVars)
    assert.strictEqual(
      result['Dialog'].cssVariables[0].description,
      'How many dialogs are nested. (number)',
    )
  })

  it('merges attributes and css vars for the same component', () => {
    const rawAttrs = [
      {
        value: 'data-open',
        component: 'Dialog',
        sourceFile: 'DialogDataAttributes.ts',
      },
    ]
    const rawCssVars = [
      {
        value: '--nested-dialogs',
        component: 'Dialog',
        sourceFile: 'DialogCssVars.ts',
      },
    ]
    const result = groupByComponent(rawAttrs, rawCssVars)
    assert.strictEqual(result['Dialog'].attributes.length, 1)
    assert.strictEqual(result['Dialog'].cssVariables.length, 1)
    assert.strictEqual(
      result['Dialog'].attributesSourceFile,
      'DialogDataAttributes.ts',
    )
    assert.strictEqual(result['Dialog'].cssVarsSourceFile, 'DialogCssVars.ts')
  })
})
