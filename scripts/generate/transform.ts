import type {
  ComponentData,
  CssVariable,
  DataAttribute,
} from '../../src/data/types'
import type { ParsedMember } from './types'

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

function toAttribute(item: ParsedMember): DataAttribute {
  return {
    name: item.value,
    description: item.description,
    values: parseTypeUnion(item.rawType),
  }
}

function toCssVar(item: ParsedMember): CssVariable {
  return {
    name: item.value,
    description: item.description,
    type: item.rawType,
  }
}

export function groupByComponent(
  rawAttrs: ParsedMember[],
  rawCssVars: ParsedMember[],
): Record<string, ComponentData> {
  const components: Record<string, ComponentData> = {}

  for (const item of rawAttrs) {
    if (!components[item.component]) {
      components[item.component] = {
        attributes: [],
        cssVariables: [],
        attributesSourceFile: item.sourceFile,
      }
    }
    components[item.component].attributes.push(toAttribute(item))
  }

  for (const item of rawCssVars) {
    if (!components[item.component]) {
      components[item.component] = { attributes: [], cssVariables: [] }
    }
    components[item.component].cssVarsSourceFile = item.sourceFile
    components[item.component].cssVariables.push(toCssVar(item))
  }

  return components
}
