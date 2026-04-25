import { describe, expect, it } from 'vitest'
import { groupByComponent, parseTypeUnion } from './transform'

describe('parseTypeUnion', () => {
  it('parses a quoted union', () => {
    expect(parseTypeUnion(`'top' | 'bottom' | 'left' | 'right'`)).toEqual([
      { value: 'top' },
      { value: 'bottom' },
      { value: 'left' },
      { value: 'right' },
    ])
  })

  it('handles double-quoted values', () => {
    expect(parseTypeUnion(`"asc" | "desc"`)).toEqual([
      { value: 'asc' },
      { value: 'desc' },
    ])
  })

  it('returns [] for a bare primitive like "number"', () => {
    expect(parseTypeUnion('number')).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(parseTypeUnion(undefined)).toEqual([])
  })

  it('returns [] for an empty string', () => {
    expect(parseTypeUnion('')).toEqual([])
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
    expect(result['Dialog']).toBeTruthy()
    expect(result['Dialog'].attributes[0].name).toBe('data-open')
    expect(result['Dialog'].attributes[0].description).toBe(
      'Present when open.',
    )
    expect(result['Dialog'].attributesSourceFile).toBe(
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
    expect(result['Combobox'].attributes[0].values).toEqual([
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
    expect(result['Combobox'].cssVariables[0].name).toBe('--anchor-width')
    expect(result['Combobox'].cssVarsSourceFile).toBe(
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
    expect(result['Dialog'].cssVariables[0].description).toBe(
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
    expect(result['Dialog'].attributes.length).toBe(1)
    expect(result['Dialog'].cssVariables.length).toBe(1)
    expect(result['Dialog'].attributesSourceFile).toBe(
      'DialogDataAttributes.ts',
    )
    expect(result['Dialog'].cssVarsSourceFile).toBe('DialogCssVars.ts')
  })
})
