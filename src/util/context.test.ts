import { describe, expect, it } from 'vitest'
import { detectFromPrefix, detectSelectorScope } from './context'

describe('detectFromPrefix', () => {
  // Attribute name
  it('empty bracket', () =>
    expect(detectFromPrefix('.foo[')).toEqual({
      kind: 'attribute-name',
      prefix: '',
      selectorScope: 'foo',
    }))
  it('partial data-', () =>
    expect(detectFromPrefix('.foo[data-')).toEqual({
      kind: 'attribute-name',
      prefix: 'data-',
      selectorScope: 'foo',
    }))
  it('full attr name', () =>
    expect(detectFromPrefix('.foo[data-side')).toEqual({
      kind: 'attribute-name',
      prefix: 'data-side',
      selectorScope: 'foo',
    }))

  // Attribute value — double quotes
  it('value, no quote', () =>
    expect(detectFromPrefix('[data-side=')).toEqual({
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: '',
      selectorScope: null,
    }))
  it('value, open double quote', () =>
    expect(detectFromPrefix('[data-side="')).toEqual({
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: '',
      selectorScope: null,
    }))
  it('value, partial double quote', () =>
    expect(detectFromPrefix('[data-side="to')).toEqual({
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: 'to',
      selectorScope: null,
    }))

  // Attribute value — single quotes
  it('value, open single quote', () =>
    expect(detectFromPrefix("[data-side='")).toEqual({
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: '',
      selectorScope: null,
    }))
  it('value, partial single quote', () =>
    expect(detectFromPrefix("[data-side='to")).toEqual({
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: 'to',
      selectorScope: null,
    }))

  // None cases
  it('closed bracket', () =>
    expect(detectFromPrefix('[data-side="top"]')).toEqual({ kind: 'none' }))
  it('non-data attribute', () =>
    expect(detectFromPrefix('[aria-')).toEqual({ kind: 'none' }))

  // CSS variables — inside var()
  it('var( open', () =>
    expect(detectFromPrefix('color: var(')).toEqual({
      kind: 'css-variable',
      prefix: '',
      selectorScope: null,
      needsVarWrapper: false,
    }))
  it('var(-- open', () =>
    expect(detectFromPrefix('color: var(--')).toEqual({
      kind: 'css-variable',
      prefix: '--',
      selectorScope: null,
      needsVarWrapper: false,
    }))
  it('var(-- partial name', () =>
    expect(detectFromPrefix('color: var(--accordion')).toEqual({
      kind: 'css-variable',
      prefix: '--accordion',
      selectorScope: null,
      needsVarWrapper: false,
    }))
  it('var() closed', () =>
    expect(detectFromPrefix('color: var(--accordion-panel-height)')).toEqual({
      kind: 'none',
    }))

  // CSS variables — bare -- without var()
  it('bare -- after colon', () =>
    expect(detectFromPrefix('color: --')).toEqual({
      kind: 'css-variable',
      prefix: '--',
      selectorScope: null,
      needsVarWrapper: true,
    }))
  it('bare -- partial name after colon', () =>
    expect(detectFromPrefix('color: --accordion')).toEqual({
      kind: 'css-variable',
      prefix: '--accordion',
      selectorScope: null,
      needsVarWrapper: true,
    }))
  it('bare -- inside scoped rule', () =>
    expect(detectFromPrefix('.root {\n  background: --')).toEqual({
      kind: 'css-variable',
      prefix: '--',
      selectorScope: 'root',
      needsVarWrapper: true,
    }))

  // Structural
  it('chained selectors', () =>
    expect(detectFromPrefix('[data-open][data-')).toEqual({
      kind: 'attribute-name',
      prefix: 'data-',
      selectorScope: null,
    }))
  it(':not() wrapping', () =>
    expect(detectFromPrefix(':not([data-')).toEqual({
      kind: 'attribute-name',
      prefix: 'data-',
      selectorScope: null,
    }))

  // Multiline (joined with newline as detectContext does)
  it('bracket on previous line', () =>
    expect(detectFromPrefix('[\n  data-side="to')).toEqual({
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: 'to',
      selectorScope: null,
    }))

  // selectorScope propagation
  it('attribute-name inside scoped rule', () =>
    expect(detectFromPrefix('.root {\n  [data-')).toEqual({
      kind: 'attribute-name',
      prefix: 'data-',
      selectorScope: 'root',
    }))
  it('css-variable inside scoped rule', () =>
    expect(detectFromPrefix('.popup-root {\n  color: var(--')).toEqual({
      kind: 'css-variable',
      prefix: '--',
      selectorScope: 'popup-root',
      needsVarWrapper: false,
    }))
  it('attribute-value inside scoped rule', () =>
    expect(detectFromPrefix('.root {\n  [data-side="')).toEqual({
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: '',
      selectorScope: 'root',
    }))
})

describe('detectSelectorScope', () => {
  it('simple class', () => expect(detectSelectorScope('.root { ')).toBe('root'))
  it('hyphenated class', () =>
    expect(detectSelectorScope('.popup-root { ')).toBe('popup-root'))
  it('pseudo-selector', () =>
    expect(detectSelectorScope('.root:hover { ')).toBe('root'))
  it('multi-selector, last wins', () =>
    expect(detectSelectorScope('.root, .popup { ')).toBe('popup'))
  it('descendant combinator, last wins', () =>
    expect(detectSelectorScope('.root .child { ')).toBe('child'))
  it('element selector only', () =>
    expect(detectSelectorScope('div { ')).toBeNull())
  it('no brace found', () => expect(detectSelectorScope('[data-')).toBeNull())
  it('nested block: inner class wins', () =>
    expect(detectSelectorScope('.root {\n  color: red;\n  .child { ')).toBe(
      'child',
    ))
  it('closed inner block before cursor: outer class returned', () =>
    expect(
      detectSelectorScope('.root {\n  .closed { color: red; }\n  [data-'),
    ).toBe('root'))
  it('class before [ inside @layer block', () =>
    expect(detectSelectorScope('@layer primitives {\n  .Input[')).toBe('Input'))
  it('class before [ with partial attr inside @layer', () =>
    expect(detectSelectorScope('@layer primitives {\n  .Input[data-')).toBe(
      'Input',
    ))
})
