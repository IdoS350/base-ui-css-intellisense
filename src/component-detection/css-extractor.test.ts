import { describe, expect, it } from 'vitest'
import { extractClassSelectors } from './css-extractor'

describe('extractClassSelectors', () => {
  it('single class', () => {
    expect(extractClassSelectors('.root { color: red; }')).toEqual(['root'])
  })

  it('multi-selector', () => {
    const result = extractClassSelectors('.root, .popup { }')
    expect(result).toContain('root')
    expect(result).toContain('popup')
    expect(result).toHaveLength(2)
  })

  it('de-duplication', () => {
    expect(extractClassSelectors('.root { } .root:hover { }')).toEqual(['root'])
  })

  it('skips element selectors', () => {
    expect(extractClassSelectors('div { } .root { }')).toEqual(['root'])
  })

  it('hyphenated class', () => {
    expect(extractClassSelectors('.popup-root { }')).toEqual(['popup-root'])
  })

  it('no classes', () => {
    expect(extractClassSelectors('div, span { }')).toEqual([])
  })
})
