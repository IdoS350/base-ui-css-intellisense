import { describe, expect, it } from 'vitest'
import type { AttributeIndex } from '../providers/completion'
import { buildHoverDocs } from './hover-docs'

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
    expect(md).toContain('Present when open.')
    expect(md).toContain('DialogPopup, PopoverPopup')
    expect(md).toContain('github.com/mui/base-ui')
  })

  it('omits GitHub link when sourceFile is undefined and contains no "undefined" text', () => {
    const minimal: AttributeIndex = {
      attribute: { name: 'data-empty' },
      components: ['ComboboxPopup'],
      sourceFile: undefined,
    }
    const md = buildHoverDocs(minimal)
    expect(md).not.toContain('undefined')
    expect(md).toContain('ComboboxPopup')
  })

  it('omits description line when attribute has no description', () => {
    const entry: AttributeIndex = {
      attribute: { name: 'data-disabled' },
      components: ['Select'],
      sourceFile: undefined,
    }
    const md = buildHoverDocs(entry)
    expect(md).toContain('Select')
    expect(md).not.toContain('undefined')
  })

  it('lists multiple components separated by commas', () => {
    const entry: AttributeIndex = {
      attribute: { name: 'data-side', description: 'The side.', values: [] },
      components: ['TooltipPopup', 'PopoverPopup', 'SelectPopup'],
      sourceFile: undefined,
    }
    const md = buildHoverDocs(entry)
    expect(md).toContain('TooltipPopup, PopoverPopup, SelectPopup')
  })
})
