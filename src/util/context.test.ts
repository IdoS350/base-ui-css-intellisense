import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { detectFromPrefix } from './context.js'

describe('detectFromPrefix', () => {
  // Attribute name
  it('empty bracket', () =>
    assert.deepEqual(detectFromPrefix('.foo['), {
      kind: 'attribute-name',
      prefix: '',
    }))
  it('partial data-', () =>
    assert.deepEqual(detectFromPrefix('.foo[data-'), {
      kind: 'attribute-name',
      prefix: 'data-',
    }))
  it('full attr name', () =>
    assert.deepEqual(detectFromPrefix('.foo[data-side'), {
      kind: 'attribute-name',
      prefix: 'data-side',
    }))

  // Attribute value — double quotes
  it('value, no quote', () =>
    assert.deepEqual(detectFromPrefix('[data-side='), {
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: '',
    }))
  it('value, open double quote', () =>
    assert.deepEqual(detectFromPrefix('[data-side="'), {
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: '',
    }))
  it('value, partial double quote', () =>
    assert.deepEqual(detectFromPrefix('[data-side="to'), {
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: 'to',
    }))

  // Attribute value — single quotes
  it('value, open single quote', () =>
    assert.deepEqual(detectFromPrefix("[data-side='"), {
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: '',
    }))
  it('value, partial single quote', () =>
    assert.deepEqual(detectFromPrefix("[data-side='to"), {
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: 'to',
    }))

  // None cases
  it('closed bracket', () =>
    assert.deepEqual(detectFromPrefix('[data-side="top"]'), { kind: 'none' }))
  it('non-data attribute', () =>
    assert.deepEqual(detectFromPrefix('[aria-'), { kind: 'none' }))

  // CSS variables
  it('var( open', () =>
    assert.deepEqual(detectFromPrefix('color: var('), {
      kind: 'css-variable',
      prefix: '',
    }))
  it('var(-- open', () =>
    assert.deepEqual(detectFromPrefix('color: var(--'), {
      kind: 'css-variable',
      prefix: '--',
    }))
  it('var(-- partial name', () =>
    assert.deepEqual(detectFromPrefix('color: var(--accordion'), {
      kind: 'css-variable',
      prefix: '--accordion',
    }))
  it('var() closed', () =>
    assert.deepEqual(detectFromPrefix('color: var(--accordion-panel-height)'), {
      kind: 'none',
    }))

  // Structural
  it('chained selectors', () =>
    assert.deepEqual(detectFromPrefix('[data-open][data-'), {
      kind: 'attribute-name',
      prefix: 'data-',
    }))
  it(':not() wrapping', () =>
    assert.deepEqual(detectFromPrefix(':not([data-'), {
      kind: 'attribute-name',
      prefix: 'data-',
    }))

  // Multiline (joined with newline as detectContext does)
  it('bracket on previous line', () =>
    assert.deepEqual(detectFromPrefix('[\n  data-side="to'), {
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: 'to',
    }))
})
