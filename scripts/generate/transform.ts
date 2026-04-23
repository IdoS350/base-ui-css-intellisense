import type { CssVariable, DataAttribute } from '../../src/data/types.js'
import type { ParsedMember } from './types.js'

export function parseTypeUnion(rawType?: string): { value: string }[] {
  if (!rawType) return []

  // Skip non-union primitive types like "number", "<length>", etc.
  if (
    !rawType.includes('|') &&
    !rawType.startsWith("'") &&
    !rawType.startsWith('"')
  ) {
    return []
  }

  return rawType
    .split('|')
    .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
    .map((value) => ({ value }))
}

export function transformAttributes(items: ParsedMember[]): DataAttribute[] {
  return items.map((item) => ({
    name: item.value,
    description: item.description,
    values: parseTypeUnion(item.rawType),
    component: item.component,
    sourceFile: item.sourceFile,
  }))
}

export function transformCssVars(items: ParsedMember[]): CssVariable[] {
  return items.map((item) => {
    const description = item.rawType
      ? item.description
        ? `${item.description} (${item.rawType})`
        : item.rawType
      : item.description

    return {
      name: item.value,
      description,
      component: item.component,
      sourceFile: item.sourceFile,
    }
  })
}
