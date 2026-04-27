import { parse } from '@babel/parser'
import type { File, JSXOpeningElement, StringLiteral } from '@babel/types'
import { extractCallMappings } from './custom-resolver'

export type SelectorIndex = Map<string, string[]>

export function extractAliasMap(ast: File): Map<string, string> {
  const map = new Map<string, string>()
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') continue
    if (node.source.value !== '@base-ui/react') continue
    for (const specifier of node.specifiers) {
      if (specifier.type === 'ImportSpecifier') {
        const imported =
          specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : specifier.imported.value
        map.set(specifier.local.name, imported)
      } else if (specifier.type === 'ImportNamespaceSpecifier') {
        map.set(specifier.local.name, '')
      }
    }
  }
  return map
}

export function resolveJsxName(
  openingElement: JSXOpeningElement,
  aliasMap: Map<string, string>,
): string | null {
  const name = openingElement.name
  if (name.type === 'JSXIdentifier') {
    const mapped = aliasMap.get(name.name)
    return mapped !== undefined ? mapped : null
  }
  if (name.type === 'JSXMemberExpression') {
    const obj = name.object
    const prop = name.property.name
    if (obj.type !== 'JSXIdentifier') return null
    const mapped = aliasMap.get(obj.name)
    if (mapped === undefined) return null
    return mapped === '' ? prop : `${mapped}.${prop}`
  }
  return null
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function classNameContainsSelector(
  rawClassNameText: string,
  selector: string,
): boolean {
  const boundary = '[^a-zA-Z0-9_-]'
  const re = new RegExp(
    `(?<=${boundary}|^)${escapeRegex(selector)}(?=${boundary}|$)`,
  )
  return re.test(rawClassNameText)
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

export function buildSelectorIndex(
  cssSelectors: string[],
  bridgeFileContents: string[],
  resolverNames?: string[],
): SelectorIndex {
  const indexSets = new Map<string, Set<string>>()

  const addPair = (selector: string, componentName: string) => {
    let set = indexSets.get(selector)
    if (!set) {
      set = new Set()
      indexSets.set(selector, set)
    }
    set.add(componentName)
  }

  for (const content of bridgeFileContents) {
    let ast: File
    try {
      ast = parse(content, {
        plugins: ['typescript', 'jsx'],
        sourceType: 'module',
      })
    } catch {
      continue
    }

    const aliasMap = extractAliasMap(ast)
    if (aliasMap.size === 0) continue

    walk(ast, (node) => {
      const n = node as Record<string, unknown>
      if (n['type'] !== 'JSXOpeningElement') return

      const opening = node as JSXOpeningElement
      const componentName = resolveJsxName(opening, aliasMap)
      if (componentName === null) return

      const classNameAttr = opening.attributes.find(
        (attr) =>
          attr.type === 'JSXAttribute' &&
          attr.name.type === 'JSXIdentifier' &&
          attr.name.name === 'className',
      )
      if (!classNameAttr || classNameAttr.type !== 'JSXAttribute') return

      const val = classNameAttr.value
      if (!val) return

      let rawText: string
      if (val.type === 'StringLiteral') {
        rawText = (val as StringLiteral).value
      } else if (val.type === 'JSXExpressionContainer') {
        rawText = content.slice(val.start ?? 0, val.end ?? 0)
      } else {
        return
      }

      for (const selector of cssSelectors) {
        if (classNameContainsSelector(rawText, selector)) {
          addPair(selector, componentName)
        }
      }
    })

    if (resolverNames?.length) {
      for (const pair of extractCallMappings(
        ast,
        aliasMap,
        cssSelectors,
        resolverNames,
        content,
      )) {
        addPair(pair.selector, pair.componentName)
      }
    }
  }

  const result: SelectorIndex = new Map()
  for (const [selector, set] of indexSets) {
    result.set(selector, Array.from(set))
  }
  return result
}
