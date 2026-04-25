import { describe, expect, it } from 'vitest'
import type { AttributeIndex, CssVarIndex } from '../providers/completion'
import { buildCssVarHoverDocs, buildHoverDocs } from './hover-docs'

describe('buildCssVarHoverDocs', () => {
  it('includes description, type, components, and GitHub link when all fields present', () => {
    const entry: CssVarIndex = {
      cssVar: {
        name: '--accordion-panel-height',
        description: "The accordion panel's height.",
        type: 'number',
      },
      components: ['AccordionPanel'],
      sourceFile: 'packages/react/src/accordion/panel/AccordionPanelCssVars.ts',
    }
    const md = buildCssVarHoverDocs(entry)
    expect(md).toContain('--accordion-panel-height')
    expect(md).toContain("The accordion panel's height.")
    expect(md).toContain('`number`')
    expect(md).toContain('AccordionPanel')
    expect(md).toContain('github.com/mui/base-ui')
  })

  it('omits type line when type is absent', () => {
    const entry: CssVarIndex = {
      cssVar: { name: '--anchor-width', description: 'The anchor width.' },
      components: ['MenuPositioner'],
      sourceFile: undefined,
    }
    const md = buildCssVarHoverDocs(entry)
    expect(md).not.toContain('**Type:**')
  })

  it('omits GitHub link when sourceFile is undefined', () => {
    const entry: CssVarIndex = {
      cssVar: { name: '--anchor-width' },
      components: ['MenuPositioner'],
      sourceFile: undefined,
    }
    const md = buildCssVarHoverDocs(entry)
    expect(md).not.toContain('undefined')
    expect(md).toContain('MenuPositioner')
  })

  it('omits description line when cssVar has no description', () => {
    const entry: CssVarIndex = {
      cssVar: { name: '--transform-origin' },
      components: ['PopoverPositioner'],
      sourceFile: undefined,
    }
    const md = buildCssVarHoverDocs(entry)
    expect(md).toContain('PopoverPositioner')
    expect(md).not.toContain('undefined')
  })
})

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
