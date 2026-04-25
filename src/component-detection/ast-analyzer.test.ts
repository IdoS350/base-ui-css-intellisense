import { parse } from '@babel/parser'
import type { JSXOpeningElement } from '@babel/types'
import { describe, expect, it } from 'vitest'
import {
  buildSelectorIndex,
  classNameContainsSelector,
  extractAliasMap,
  resolveJsxName,
} from './ast-analyzer'

function parseFile(src: string) {
  return parse(src, { plugins: ['typescript', 'jsx'], sourceType: 'module' })
}

function firstJsxOpening(src: string): JSXOpeningElement {
  const ast = parseFile(src)
  let found: JSXOpeningElement | null = null
  function walk(node: object | null | undefined): void {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    if (n['type'] === 'JSXOpeningElement') {
      found = node as JSXOpeningElement
      return
    }
    for (const val of Object.values(node)) {
      if (Array.isArray(val)) val.forEach((v) => walk(v))
      else walk(val as object)
    }
  }
  walk(ast)
  if (!found) throw new Error('No JSXOpeningElement found')
  return found
}

describe('extractAliasMap', () => {
  it('named, no alias', () => {
    const ast = parseFile(`import { Popover } from '@base-ui/react'`)
    const map = extractAliasMap(ast)
    expect(map.get('Popover')).toBe('Popover')
    expect(map.size).toBe(1)
  })

  it('named, aliased', () => {
    const ast = parseFile(`import { Popover as P } from '@base-ui/react'`)
    const map = extractAliasMap(ast)
    expect(map.get('P')).toBe('Popover')
    expect(map.size).toBe(1)
  })

  it('multiple specifiers', () => {
    const ast = parseFile(`import { Popover, Dialog } from '@base-ui/react'`)
    const map = extractAliasMap(ast)
    expect(map.get('Popover')).toBe('Popover')
    expect(map.get('Dialog')).toBe('Dialog')
    expect(map.size).toBe(2)
  })

  it('namespace import', () => {
    const ast = parseFile(`import * as BaseUI from '@base-ui/react'`)
    const map = extractAliasMap(ast)
    expect(map.get('BaseUI')).toBe('')
    expect(map.size).toBe(1)
  })

  it('non-base-ui import', () => {
    const ast = parseFile(`import { useState } from 'react'`)
    const map = extractAliasMap(ast)
    expect(map.size).toBe(0)
  })
})

describe('resolveJsxName', () => {
  it('known identifier', () => {
    const opening = firstJsxOpening(`<Popover />`)
    const result = resolveJsxName(opening, new Map([['Popover', 'Popover']]))
    expect(result).toBe('Popover')
  })

  it('aliased identifier', () => {
    const opening = firstJsxOpening(`<P />`)
    const result = resolveJsxName(opening, new Map([['P', 'Popover']]))
    expect(result).toBe('Popover')
  })

  it('member expression', () => {
    const opening = firstJsxOpening(`<Popover.Root />`)
    const result = resolveJsxName(opening, new Map([['Popover', 'Popover']]))
    expect(result).toBe('Popover.Root')
  })

  it('aliased member', () => {
    const opening = firstJsxOpening(`<P.Root />`)
    const result = resolveJsxName(opening, new Map([['P', 'Popover']]))
    expect(result).toBe('Popover.Root')
  })

  it('unknown identifier', () => {
    const opening = firstJsxOpening(`<div />`)
    const result = resolveJsxName(opening, new Map([['Popover', 'Popover']]))
    expect(result).toBeNull()
  })
})

describe('classNameContainsSelector', () => {
  it('exact string literal', () => {
    expect(classNameContainsSelector('"root"', 'root')).toBe(true)
  })

  it('CSS module', () => {
    expect(classNameContainsSelector('{styles.root}', 'root')).toBe(true)
  })

  it('clsx call', () => {
    expect(
      classNameContainsSelector("{clsx(styles.root, 'extra')}", 'root'),
    ).toBe(true)
  })

  it('substring, no match', () => {
    expect(classNameContainsSelector('"popup-root"', 'root')).toBe(false)
  })

  it('template literal no match', () => {
    expect(classNameContainsSelector('`btn-root`', 'root')).toBe(false)
  })

  it('template literal match', () => {
    expect(classNameContainsSelector('`root`', 'root')).toBe(true)
  })
})

describe('buildSelectorIndex', () => {
  it('basic integration', () => {
    const css = ['root', 'popup']
    const bridge = `
      import { Popover } from '@base-ui/react'
      function Foo() {
        return <Popover.Root className={styles.root} />
      }
    `
    const index = buildSelectorIndex(css, [bridge])
    expect(index.get('root')).toEqual(['Popover.Root'])
    expect(index.get('popup')).toBeUndefined()
  })

  it('aliased imports', () => {
    const css = ['root']
    const bridge = `
      import { Popover as P } from '@base-ui/react'
      function Foo() {
        return <P.Root className="root" />
      }
    `
    const index = buildSelectorIndex(css, [bridge])
    expect(index.get('root')).toEqual(['Popover.Root'])
  })

  it('multiple bridge files', () => {
    const css = ['root']
    const bridge1 = `
      import { Popover } from '@base-ui/react'
      function A() { return <Popover.Root className="root" /> }
    `
    const bridge2 = `
      import { Dialog } from '@base-ui/react'
      function B() { return <Dialog.Root className="root" /> }
    `
    const index = buildSelectorIndex(css, [bridge1, bridge2])
    const components = index.get('root') ?? []
    expect(components).toContain('Popover.Root')
    expect(components).toContain('Dialog.Root')
  })

  it('parse error in one file does not throw', () => {
    const css = ['root']
    const invalid = '<<< not valid jsx <<<'
    const valid = `
      import { Popover } from '@base-ui/react'
      function A() { return <Popover.Root className="root" /> }
    `
    const index = buildSelectorIndex(css, [invalid, valid])
    expect(index.get('root')).toEqual(['Popover.Root'])
  })

  it('className attribute absent does not add to index', () => {
    const css = ['root']
    const bridge = `
      import { Popover } from '@base-ui/react'
      function A() { return <Popover.Root /> }
    `
    const index = buildSelectorIndex(css, [bridge])
    expect(index.get('root')).toBeUndefined()
  })
})
