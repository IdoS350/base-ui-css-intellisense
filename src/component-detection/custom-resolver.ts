import type {
  CallExpression,
  Expression,
  File,
  Node,
  V8IntrinsicIdentifier,
} from '@babel/types'
import { classNameContainsSelector } from './ast-analyzer'

export interface ResolvedPair {
  selector: string
  componentName: string
}

export function resolveCalleeLocalName(
  callee: Expression | V8IntrinsicIdentifier,
): string | null {
  if (callee.type === 'Identifier') return callee.name
  if (
    callee.type === 'MemberExpression' &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name
  }
  return null
}

export function resolveArgAsComponent(
  arg: Node,
  aliasMap: Map<string, string>,
): string | null {
  if (arg.type === 'Identifier') {
    const mapped = aliasMap.get(arg.name)
    return mapped !== undefined ? mapped : null
  }
  if (
    arg.type === 'MemberExpression' &&
    arg.object.type === 'Identifier' &&
    arg.property.type === 'Identifier'
  ) {
    const mapped = aliasMap.get(arg.object.name)
    if (mapped === undefined) return null
    return mapped === '' ? arg.property.name : `${mapped}.${arg.property.name}`
  }
  return null
}

export function resolveArgAsSelector(
  arg: Node,
  cssSelectors: string[],
  fileContent: string,
): string | null {
  const rawText = fileContent.slice(
    (arg as Node & { start: number }).start,
    (arg as Node & { end: number }).end,
  )
  for (const selector of cssSelectors) {
    if (classNameContainsSelector(rawText, selector)) return selector
  }
  return null
}

function walk(
  node: object | null | undefined,
  visit: (n: object) => void,
): void {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const val of Object.values(node)) {
    if (Array.isArray(val)) val.forEach((v) => walk(v, visit))
    else walk(val, visit)
  }
}

export function extractCallMappings(
  ast: File,
  aliasMap: Map<string, string>,
  cssSelectors: string[],
  resolverNames: string[],
  fileContent: string,
): ResolvedPair[] {
  if (resolverNames.length === 0) return []

  const seen = new Set<string>()
  const pairs: ResolvedPair[] = []

  walk(ast, (node) => {
    const n = node as Record<string, unknown>
    if (n['type'] !== 'CallExpression') return

    const call = node as CallExpression
    const localName = resolveCalleeLocalName(call.callee)
    if (localName === null || !resolverNames.includes(localName)) return

    let componentName: string | null = null
    let selector: string | null = null

    for (const arg of call.arguments) {
      if (arg.type === 'SpreadElement') continue
      if (componentName === null) {
        const c = resolveArgAsComponent(arg, aliasMap)
        if (c !== null) {
          componentName = c
          continue
        }
      }
      if (selector === null) {
        const s = resolveArgAsSelector(arg, cssSelectors, fileContent)
        if (s !== null) {
          selector = s
          continue
        }
      }
    }

    if (componentName !== null && selector !== null) {
      const key = `${selector}::${componentName}`
      if (!seen.has(key)) {
        seen.add(key)
        pairs.push({ selector, componentName })
      }
    }
  })

  return pairs
}
