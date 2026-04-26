import { parse } from '@babel/parser'
import type { CallExpression, File } from '@babel/types'
import { describe, expect, it } from 'vitest'
import { buildSelectorIndex, extractAliasMap } from './ast-analyzer'
import {
  extractCallMappings,
  resolveArgAsComponent,
  resolveArgAsSelector,
  resolveCalleeLocalName,
} from './custom-resolver'

function parseExpr(src: string): CallExpression {
  const ast = parse(src, { plugins: ['typescript'], sourceType: 'module' })
  const stmt = ast.program.body[0]
  if (
    stmt.type !== 'ExpressionStatement' ||
    stmt.expression.type !== 'CallExpression'
  ) {
    throw new Error('Expected a CallExpression statement')
  }
  return stmt.expression
}

function parseFirstArg(src: string, argIndex = 0) {
  const call = parseExpr(src)
  return call.arguments[argIndex]
}

describe('resolveCalleeLocalName', () => {
  it('returns name for plain Identifier callee', () => {
    const call = parseExpr('styleComponent(a, b)')
    expect(resolveCalleeLocalName(call.callee)).toBe('styleComponent')
  })

  it('returns property name for MemberExpression callee', () => {
    const call = parseExpr('lib.withStyles(a, b)')
    expect(resolveCalleeLocalName(call.callee)).toBe('withStyles')
  })

  it('returns null for other callee types', () => {
    // getFactory() returns a CallExpression callee, not Identifier or MemberExpression
    const call = parseExpr('getFactory()()')
    expect(resolveCalleeLocalName(call.callee)).toBeNull()
  })
})

describe('resolveArgAsComponent', () => {
  it('resolves MemberExpression with direct mapping', () => {
    const arg = parseFirstArg('f(Popover.Root)')
    const aliasMap = new Map([['Popover', 'Popover']])
    expect(resolveArgAsComponent(arg, aliasMap)).toBe('Popover.Root')
  })

  it('resolves MemberExpression with aliased mapping', () => {
    const arg = parseFirstArg('f(P.Root)')
    const aliasMap = new Map([['P', 'Popover']])
    expect(resolveArgAsComponent(arg, aliasMap)).toBe('Popover.Root')
  })

  it('resolves plain Identifier', () => {
    const arg = parseFirstArg('f(Popover)')
    const aliasMap = new Map([['Popover', 'Popover']])
    expect(resolveArgAsComponent(arg, aliasMap)).toBe('Popover')
  })

  it('returns null for string literal', () => {
    const arg = parseFirstArg('f("root")')
    const aliasMap = new Map([['Popover', 'Popover']])
    expect(resolveArgAsComponent(arg, aliasMap)).toBeNull()
  })
})

describe('resolveArgAsSelector', () => {
  it('matches selector in member expression source', () => {
    const src = 'f(styles.root)'
    const arg = parseFirstArg(src)
    expect(resolveArgAsSelector(arg, ['root'], src)).toBe('root')
  })

  it('returns null when selector not found', () => {
    const src = 'f(styles.popup)'
    const arg = parseFirstArg(src)
    expect(resolveArgAsSelector(arg, ['root'], src)).toBeNull()
  })

  it('matches selector in string literal', () => {
    const src = 'f("root")'
    const arg = parseFirstArg(src)
    expect(resolveArgAsSelector(arg, ['root'], src)).toBe('root')
  })
})

describe('extractCallMappings', () => {
  function makeAst(src: string): File {
    return parse(src, { plugins: ['typescript'], sourceType: 'module' })
  }

  it('extracts pair from matching call expression', () => {
    const src = `
      import { Popover } from '@base-ui/react'
      styleComponent(Popover.Root, styles.root)
    `
    const ast = makeAst(src)
    const aliasMap = extractAliasMap(ast)
    const pairs = extractCallMappings(
      ast,
      aliasMap,
      ['root'],
      ['styleComponent'],
      src,
    )
    expect(pairs).toEqual([{ selector: 'root', componentName: 'Popover.Root' }])
  })

  it('returns empty array when resolverNames is empty', () => {
    const src = `
      import { Popover } from '@base-ui/react'
      styleComponent(Popover.Root, styles.root)
    `
    const ast = makeAst(src)
    const aliasMap = extractAliasMap(ast)
    const pairs = extractCallMappings(ast, aliasMap, ['root'], [], src)
    expect(pairs).toEqual([])
  })

  it('skips call with unknown callee name', () => {
    const src = `
      import { Popover } from '@base-ui/react'
      unknownFn(Popover.Root, styles.root)
    `
    const ast = makeAst(src)
    const aliasMap = extractAliasMap(ast)
    const pairs = extractCallMappings(
      ast,
      aliasMap,
      ['root'],
      ['styleComponent'],
      src,
    )
    expect(pairs).toEqual([])
  })

  it('skips call with no recognizable component arg', () => {
    const src = `
      import { Popover } from '@base-ui/react'
      styleComponent("not-a-component", styles.root)
    `
    const ast = makeAst(src)
    const aliasMap = extractAliasMap(ast)
    const pairs = extractCallMappings(
      ast,
      aliasMap,
      ['root'],
      ['styleComponent'],
      src,
    )
    expect(pairs).toEqual([])
  })

  it('skips call with no recognizable selector arg', () => {
    const src = `
      import { Popover } from '@base-ui/react'
      styleComponent(Popover.Root, styles.unknown)
    `
    const ast = makeAst(src)
    const aliasMap = extractAliasMap(ast)
    const pairs = extractCallMappings(
      ast,
      aliasMap,
      ['root'],
      ['styleComponent'],
      src,
    )
    expect(pairs).toEqual([])
  })

  it('de-duplicates identical pairs', () => {
    const src = `
      import { Popover } from '@base-ui/react'
      styleComponent(Popover.Root, styles.root)
      styleComponent(Popover.Root, styles.root)
    `
    const ast = makeAst(src)
    const aliasMap = extractAliasMap(ast)
    const pairs = extractCallMappings(
      ast,
      aliasMap,
      ['root'],
      ['styleComponent'],
      src,
    )
    expect(pairs).toHaveLength(1)
  })
})

describe('buildSelectorIndex with resolverNames', () => {
  it('merges call mappings into the index', () => {
    const src = `
      import { Popover } from '@base-ui/react'
      styleComponent(Popover.Root, styles.root)
    `
    const index = buildSelectorIndex(['root'], [src], ['styleComponent'])
    expect(index.get('root')).toEqual(['Popover.Root'])
  })

  it('behaves identically without resolverNames argument', () => {
    const src = `
      import { Popover } from '@base-ui/react'
      styleComponent(Popover.Root, styles.root)
    `
    const index = buildSelectorIndex(['root'], [src])
    expect(index.get('root')).toBeUndefined()
  })
})
