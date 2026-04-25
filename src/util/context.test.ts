import { describe, expect, it } from 'vitest'
import { detectFromPrefix } from './context'

describe('detectFromPrefix', () => {
  // Attribute name
  it('empty bracket', () =>
    expect(detectFromPrefix('.foo[')).toEqual({
      kind: 'attribute-name',
      prefix: '',
    }))
  it('partial data-', () =>
    expect(detectFromPrefix('.foo[data-')).toEqual({
      kind: 'attribute-name',
      prefix: 'data-',
    }))
  it('full attr name', () =>
    expect(detectFromPrefix('.foo[data-side')).toEqual({
      kind: 'attribute-name',
      prefix: 'data-side',
    }))

  // Attribute value — double quotes
  it('value, no quote', () =>
    expect(detectFromPrefix('[data-side=')).toEqual({
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: '',
    }))
  it('value, open double quote', () =>
    expect(detectFromPrefix('[data-side="')).toEqual({
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: '',
    }))
  it('value, partial double quote', () =>
    expect(detectFromPrefix('[data-side="to')).toEqual({
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: 'to',
    }))

  // Attribute value — single quotes
  it('value, open single quote', () =>
    expect(detectFromPrefix("[data-side='")).toEqual({
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: '',
    }))
  it('value, partial single quote', () =>
    expect(detectFromPrefix("[data-side='to")).toEqual({
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: 'to',
    }))

  // None cases
  it('closed bracket', () =>
    expect(detectFromPrefix('[data-side="top"]')).toEqual({ kind: 'none' }))
  it('non-data attribute', () =>
    expect(detectFromPrefix('[aria-')).toEqual({ kind: 'none' }))

  // CSS variables
  it('var( open', () =>
    expect(detectFromPrefix('color: var(')).toEqual({
      kind: 'css-variable',
      prefix: '',
    }))
  it('var(-- open', () =>
    expect(detectFromPrefix('color: var(--')).toEqual({
      kind: 'css-variable',
      prefix: '--',
    }))
  it('var(-- partial name', () =>
    expect(detectFromPrefix('color: var(--accordion')).toEqual({
      kind: 'css-variable',
      prefix: '--accordion',
    }))
  it('var() closed', () =>
    expect(detectFromPrefix('color: var(--accordion-panel-height)')).toEqual({
      kind: 'none',
    }))

  // Structural
  it('chained selectors', () =>
    expect(detectFromPrefix('[data-open][data-')).toEqual({
      kind: 'attribute-name',
      prefix: 'data-',
    }))
  it(':not() wrapping', () =>
    expect(detectFromPrefix(':not([data-')).toEqual({
      kind: 'attribute-name',
      prefix: 'data-',
    }))

  // Multiline (joined with newline as detectContext does)
  it('bracket on previous line', () =>
    expect(detectFromPrefix('[\n  data-side="to')).toEqual({
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: 'to',
    }))
})
