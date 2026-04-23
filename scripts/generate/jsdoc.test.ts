import * as assert from 'assert'
import { describe, it } from 'node:test'
import { extractJsDocDescription, extractJsDocType } from './jsdoc.js'

describe('extractJsDocDescription', () => {
  it('extracts a single-line description', () => {
    const text = `
  /**
   * Present when the popup is open.
   */
  open = 'data-open'`
    assert.strictEqual(
      extractJsDocDescription(text),
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
    assert.strictEqual(
      extractJsDocDescription(text),
      'Which side the popup is on.',
    )
  })

  it('joins multi-line descriptions', () => {
    const text = `
  /**
   * Line one.
   * Line two.
   */
  foo = 'data-foo'`
    assert.strictEqual(extractJsDocDescription(text), 'Line one. Line two.')
  })

  it('returns undefined when there is no JSDoc', () => {
    assert.strictEqual(
      extractJsDocDescription(`  open = 'data-open'`),
      undefined,
    )
  })

  it('returns undefined for an empty JSDoc block', () => {
    assert.strictEqual(
      extractJsDocDescription(`  /** */\n  open = 'data-open'`),
      undefined,
    )
  })
})

describe('extractJsDocType', () => {
  it('extracts a union type', () => {
    const text = `/** @type {'top' | 'bottom' | 'left' | 'right'} */`
    assert.strictEqual(
      extractJsDocType(text),
      `'top' | 'bottom' | 'left' | 'right'`,
    )
  })

  it('extracts a primitive type', () => {
    assert.strictEqual(extractJsDocType(`/** @type {number} */`), 'number')
  })

  it('returns undefined when there is no @type tag', () => {
    assert.strictEqual(extractJsDocType(`/** Present when open. */`), undefined)
  })
})
