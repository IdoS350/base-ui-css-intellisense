import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AttributeIndex } from '../providers/completion.js'
import { buildHoverDocs } from './hover-docs.js'

describe('buildHoverDocs', () => {
  it('includes description, components, and GitHub link when all fields present', () => {
    const entry: AttributeIndex = {
      attribute: {
        name: 'data-open',
        description: 'Present when open.',
        values: [],
      },
      components: ['DialogPopup', 'PopoverPopup'],
      sourceFile:
        'packages/react/src/dialog/popup/DialogPopupDataAttributes.ts',
    }
    const md = buildHoverDocs(entry)
    assert(md.includes('Present when open.'))
    assert(md.includes('DialogPopup, PopoverPopup'))
    assert(md.includes('github.com/mui/base-ui'))
  })

  it('omits GitHub link when sourceFile is undefined and contains no "undefined" text', () => {
    const minimal: AttributeIndex = {
      attribute: { name: 'data-empty' },
      components: ['ComboboxPopup'],
      sourceFile: undefined,
    }
    const md = buildHoverDocs(minimal)
    assert(!md.includes('undefined'))
    assert(md.includes('ComboboxPopup'))
  })

  it('omits description line when attribute has no description', () => {
    const entry: AttributeIndex = {
      attribute: { name: 'data-disabled' },
      components: ['Select'],
      sourceFile: undefined,
    }
    const md = buildHoverDocs(entry)
    assert(md.includes('Select'))
    assert(!md.includes('undefined'))
  })

  it('lists multiple components separated by commas', () => {
    const entry: AttributeIndex = {
      attribute: { name: 'data-side', description: 'The side.', values: [] },
      components: ['TooltipPopup', 'PopoverPopup', 'SelectPopup'],
      sourceFile: undefined,
    }
    const md = buildHoverDocs(entry)
    assert(md.includes('TooltipPopup, PopoverPopup, SelectPopup'))
  })
})
