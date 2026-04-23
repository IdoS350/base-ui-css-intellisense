import fg from 'fast-glob'
import * as fs from 'fs'
import * as path from 'path'
import ts from 'typescript'
import { extractJsDocDescription, extractJsDocType } from './jsdoc.js'
import type { ParsedMember, SharedValueMap } from './types.js'

export function deriveComponentName(filePath: string): string {
  const base = path.basename(filePath)
  return base.replace('DataAttributes.ts', '').replace('CssVars.ts', '')
}

export function resolveEnumMemberValue(
  member: ts.EnumMember,
  sharedValues: SharedValueMap,
  filePath: string,
): string | null {
  const init = member.initializer
  if (!init) return null

  if (ts.isStringLiteral(init)) {
    return init.text
  }

  if (ts.isPropertyAccessExpression(init)) {
    const enumName = init.expression.getText()
    const memberName = init.name.getText()
    const key = `${enumName}.${memberName}`
    const resolved = sharedValues.get(key)
    if (!resolved) {
      console.warn(
        `  ⚠ Could not resolve "${key}" in ${path.basename(filePath)}`,
      )
    }
    return resolved ?? null
  }

  return null
}

export function parseEnumFile(
  filePath: string,
  repoPath: string,
  sharedValues: SharedValueMap,
): ParsedMember[] {
  const source = fs.readFileSync(filePath, 'utf-8')
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
  )

  const component = deriveComponentName(filePath)
  const relativeSourceFile = path
    .relative(repoPath, filePath)
    .replace(/\\/g, '/')
  const results: ParsedMember[] = []

  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isEnumDeclaration(node)) return

    for (const member of node.members) {
      const value = resolveEnumMemberValue(member, sharedValues, filePath)
      if (!value) continue

      const fullText = member.getFullText(sourceFile)
      results.push({
        value,
        description: extractJsDocDescription(fullText),
        rawType: extractJsDocType(fullText),
        component,
        sourceFile: relativeSourceFile,
      })
    }
  })

  return results
}

export async function parseSharedEnums(
  repoPath: string,
): Promise<SharedValueMap> {
  const map: SharedValueMap = new Map()

  // Include internals/ and all DataAttributes files so cross-component and
  // chained references (e.g. CommonPopupDataAttributes.startingStyle =
  // TransitionStatusDataAttributes.startingStyle) can be resolved.
  const files = await fg(
    [
      'packages/react/src/utils/**/*.ts',
      'packages/react/src/internals/**/*.ts',
      'packages/react/src/*.ts',
      'packages/react/src/**/*DataAttributes.ts',
    ],
    {
      cwd: repoPath,
      absolute: true,
      ignore: ['**/__tests__/**', '**/node_modules/**'],
    },
  )

  const enumFiles = files.filter((f) =>
    fs.readFileSync(f, 'utf-8').includes('export enum'),
  )

  const sourceFiles = enumFiles.map((filePath) =>
    ts.createSourceFile(
      filePath,
      fs.readFileSync(filePath, 'utf-8'),
      ts.ScriptTarget.Latest,
      true,
    ),
  )

  // Pass 1: collect all direct string literals across every enum file
  for (const sourceFile of sourceFiles) {
    ts.forEachChild(sourceFile, (node) => {
      if (!ts.isEnumDeclaration(node)) return
      const enumName = node.name.text

      for (const member of node.members) {
        const init = member.initializer
        if (!init || !ts.isStringLiteral(init)) continue
        const memberName = ts.isIdentifier(member.name)
          ? member.name.text
          : member.name.getText()
        map.set(`${enumName}.${memberName}`, init.text)
      }
    })
  }

  // Pass 2: resolve one level of property-access references (e.g.
  // CommonPopupDataAttributes.startingStyle = TransitionStatusDataAttributes.startingStyle)
  for (const sourceFile of sourceFiles) {
    ts.forEachChild(sourceFile, (node) => {
      if (!ts.isEnumDeclaration(node)) return
      const enumName = node.name.text

      for (const member of node.members) {
        const init = member.initializer
        if (!init || !ts.isPropertyAccessExpression(init)) continue
        const memberName = ts.isIdentifier(member.name)
          ? member.name.text
          : member.name.getText()
        const key = `${enumName}.${memberName}`
        if (map.has(key)) continue

        const refKey = `${init.expression.getText()}.${init.name.getText()}`
        const resolved = map.get(refKey)
        if (resolved) map.set(key, resolved)
      }
    })
  }

  return map
}

export async function parseDataAttrFiles(
  repoPath: string,
  sharedValues: SharedValueMap,
): Promise<ParsedMember[]> {
  const files = await fg('packages/react/src/**/*DataAttributes.ts', {
    cwd: repoPath,
    absolute: true,
    ignore: ['**/__tests__/**', '**/node_modules/**'],
  })

  return files.flatMap((f) => parseEnumFile(f, repoPath, sharedValues))
}

export async function parseCssVarFiles(
  repoPath: string,
  sharedValues: SharedValueMap,
): Promise<ParsedMember[]> {
  const files = await fg('packages/react/src/**/*CssVars.ts', {
    cwd: repoPath,
    absolute: true,
    ignore: ['**/__tests__/**', '**/node_modules/**'],
  })

  return files.flatMap((f) => parseEnumFile(f, repoPath, sharedValues))
}
