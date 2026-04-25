import { describe, expect, it } from 'vitest'
import { extractJsDocDescription, extractJsDocType } from './jsdoc'

describe('extractJsDocDescription', () => {
  it('extracts a single-line description', () => {
    const text = `
  /**
   * Present when the popup is open.
   */
  open = 'data-open'`
    expect(extractJsDocDescription(text)).toBe(
      'Present when the popup is open.',
    )
  })

  it('strips @type lines', () => {
    const text = `
  /**
   * Which side the popup is on.
   * @type {'top' | 'bottom'}
   */
  side = 'data-side'`
    expect(extractJsDocDescription(text)).toBe('Which side the popup is on.')
  })

  it('joins multi-line descriptions', () => {
    const text = `
  /**
   * Line one.
   * Line two.
   */
  foo = 'data-foo'`
    expect(extractJsDocDescription(text)).toBe('Line one. Line two.')
  })

  it('returns undefined when there is no JSDoc', () => {
    expect(extractJsDocDescription(`  open = 'data-open'`)).toBeUndefined()
  })

  it('returns undefined for an empty JSDoc block', () => {
    expect(
      extractJsDocDescription(`  /** */\n  open = 'data-open'`),
    ).toBeUndefined()
  })
})

describe('extractJsDocType', () => {
  it('extracts a union type', () => {
    const text = `/** @type {'top' | 'bottom' | 'left' | 'right'} */`
    expect(extractJsDocType(text)).toBe(`'top' | 'bottom' | 'left' | 'right'`)
  })

  it('extracts a primitive type', () => {
    expect(extractJsDocType(`/** @type {number} */`)).toBe('number')
  })

  it('returns undefined when there is no @type tag', () => {
    expect(extractJsDocType(`/** Present when open. */`)).toBeUndefined()
  })
})
