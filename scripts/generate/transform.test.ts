import * as assert from 'assert'
import { describe, it } from 'node:test'
import {
  parseTypeUnion,
  transformAttributes,
  transformCssVars,
} from './transform.js'

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


describe('transformAttributes', () => {
  it('maps value → name and keeps description', () => {
    const items = [
      {
        value: 'data-open',
        description: 'Present when open.',
        component: 'Dialog',
        sourceFile: 'packages/react/src/dialog/DialogDataAttributes.ts',
      },
    ]
    const [attr] = transformAttributes(items)
    assert.strictEqual(attr.name, 'data-open')
    assert.strictEqual(attr.description, 'Present when open.')
    assert.strictEqual(attr.component, 'Dialog')
    assert.deepStrictEqual(attr.values, [])
  })

  it('parses values from rawType', () => {
    const items = [
      {
        value: 'data-side',
        rawType: `'top' | 'bottom'`,
        component: 'Combobox',
        sourceFile: 'packages/react/src/combobox/ComboboxDataAttributes.ts',
      },
    ]
    const [attr] = transformAttributes(items)
    assert.deepStrictEqual(attr.values, [{ value: 'top' }, { value: 'bottom' }])
  })
})

describe('transformCssVars', () => {
  it('maps value → name', () => {
    const items = [
      {
        value: '--anchor-width',
        description: 'The width of the anchor.',
        component: 'Combobox',
        sourceFile: 'a.ts',
      },
    ]
    assert.strictEqual(transformCssVars(items)[0].name, '--anchor-width')
  })

  it('appends rawType to description in parens', () => {
    const items = [
      {
        value: '--nested-dialogs',
        description: 'How many dialogs are nested.',
        rawType: 'number',
        component: 'Dialog',
        sourceFile: 'a.ts',
      },
    ]
    assert.strictEqual(
      transformCssVars(items)[0].description,
      'How many dialogs are nested. (number)',
    )
  })

  it('uses rawType alone as description when no description exists', () => {
    const items = [
      {
        value: '--some-var',
        rawType: '<length>',
        component: 'Foo',
        sourceFile: 'a.ts',
      },
    ]
    assert.strictEqual(transformCssVars(items)[0].description, '<length>')
  })
})
