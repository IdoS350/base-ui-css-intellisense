import { describe, expect, it, vi } from 'vitest'
import type { IndexManager } from '../component-detection/index-manager'
import type { BaseUiData } from '../data/types'

vi.mock('vscode', () => {
  class Position {
    constructor(
      public line: number,
      public character: number,
    ) {}
    translate(_lineDelta: number, charDelta: number) {
      return new Position(this.line, this.character + charDelta)
    }
  }

  class Range {
    constructor(
      public start: Position,
      public end: Position,
    ) {}
  }

  class CompletionItem {
    label: string
    kind: number
    detail?: string
    documentation?: unknown
    sortText?: string
    filterText?: string
    insertText?: string
    range?: Range
    constructor(label: string, kind: number) {
      this.label = label
      this.kind = kind
    }
  }

  class MarkdownString {
    value = ''
    appendMarkdown(s: string) {
      this.value += s
      return this
    }
  }
  return {
    Position,
    Range,
    CompletionItem,
    MarkdownString,
    CompletionItemKind: { Property: 9, EnumMember: 11, Variable: 5 },
  }
})

import { BaseUiCompletionProvider } from './completion'

const MOCK_DATA: BaseUiData = {
  version: '1.0.0',
  components: {
    Dialog: {
      attributes: [
        { name: 'data-open', values: [{ value: 'true' }, { value: 'false' }] },
      ],
      cssVariables: [{ name: '--dialog-z-index' }],
      attributesSourceFile: undefined,
      cssVarsSourceFile: undefined,
    },
    Tooltip: {
      attributes: [
        { name: 'data-side', values: [{ value: 'top' }, { value: 'bottom' }] },
      ],
      cssVariables: [{ name: '--tooltip-z-index' }],
      attributesSourceFile: undefined,
      cssVarsSourceFile: undefined,
    },
  },
}

function makeProvider() {
  return new BaseUiCompletionProvider(MOCK_DATA, {} as unknown as IndexManager)
}

function fakePosition() {
  return {
    line: 0,
    character: 10,
    translate: (_lineDelta: number, charDelta: number) => ({
      line: 0,
      character: 10 + charDelta,
    }),
  } as unknown as import('vscode').Position
}

describe('attributeNameCompletions', () => {
  it('returns all attributes when scopeComponents is null (no scope restriction)', () => {
    const provider = makeProvider()
    const items = (provider as any).attributeNameCompletions(
      'data-',
      fakePosition(),
      null,
    )
    const names = items.map((i: { label: string }) => i.label)
    expect(names).toContain('data-open')
    expect(names).toContain('data-side')
  })

  it('returns no attributes when scopeComponents is empty (unknown class)', () => {
    const provider = makeProvider()
    const items = (provider as any).attributeNameCompletions(
      'data-',
      fakePosition(),
      [],
    )
    expect(items).toHaveLength(0)
  })

  it('filters to matching component when scopeComponents is set', () => {
    const provider = makeProvider()
    const items = (provider as any).attributeNameCompletions(
      'data-',
      fakePosition(),
      ['Dialog'],
    )
    const names = items.map((i: { label: string }) => i.label)
    expect(names).toContain('data-open')
    expect(names).not.toContain('data-side')
  })
})

describe('cssVariableCompletions', () => {
  it('returns all css vars when scopeComponents is null (no scope restriction)', () => {
    const provider = makeProvider()
    const items = (provider as any).cssVariableCompletions(
      '--',
      fakePosition(),
      null,
      false,
    )
    const names = items.map((i: { label: string }) => i.label)
    expect(names).toContain('--dialog-z-index')
    expect(names).toContain('--tooltip-z-index')
  })

  it('returns no css vars when scopeComponents is empty (unknown class)', () => {
    const provider = makeProvider()
    const items = (provider as any).cssVariableCompletions(
      '--',
      fakePosition(),
      [],
      false,
    )
    expect(items).toHaveLength(0)
  })

  it('filters to matching component when scopeComponents is set', () => {
    const provider = makeProvider()
    const items = (provider as any).cssVariableCompletions(
      '--',
      fakePosition(),
      ['Tooltip'],
      false,
    )
    const names = items.map((i: { label: string }) => i.label)
    expect(names).toContain('--tooltip-z-index')
    expect(names).not.toContain('--dialog-z-index')
  })
})
