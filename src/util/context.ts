import * as vscode from 'vscode'

export type CompletionContext =
  | { kind: 'attribute-name'; prefix: string; selectorScope: string | null }
  | {
      kind: 'attribute-value'
      attribute: string
      prefix: string
      selectorScope: string | null
    }
  | {
      kind: 'css-variable'
      prefix: string
      selectorScope: string | null
      needsVarWrapper: boolean
    }
  | { kind: 'none' }

export function detectContext(
  document: vscode.TextDocument,
  position: vscode.Position,
): CompletionContext {
  const currentPrefix = document
    .lineAt(position)
    .text.slice(0, position.character)

  // Build oldest→newest so detectFromPrefix (which scans backwards) sees
  // currentPrefix last — i.e. as the "most recent" content.
  const startLine = Math.max(0, position.line - 50)
  const lookbackLines: string[] = []
  for (let i = startLine; i < position.line; i++) {
    lookbackLines.push(document.lineAt(i).text)
  }
  lookbackLines.push(currentPrefix)

  return detectFromPrefix(lookbackLines.join('\n'))
}

export function detectSelectorScope(prefix: string): string | null {
  let depth = 0
  let selectorEnd = -1
  for (let i = prefix.length - 1; i >= 0; i--) {
    if (prefix[i] === '}') {
      depth++
    } else if (prefix[i] === '{') {
      if (depth === 0) {
        selectorEnd = i
        break
      }
      depth--
    }
  }

  // Text after the innermost { (or the whole prefix if no { found)
  const afterBrace = selectorEnd === -1 ? prefix : prefix.slice(selectorEnd + 1)

  // If there's a class selector immediately before a [ with no { between
  // them, the cursor is inside an attribute selector written on the selector
  // itself (e.g. `@layer x { .Input[data-`), not inside a declaration block.
  const lastBracket = afterBrace.lastIndexOf('[')
  if (lastBracket !== -1) {
    const beforeBracket = afterBrace.slice(0, lastBracket)
    if (!beforeBracket.includes('{')) {
      const ms = [...beforeBracket.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)]
      if (ms.length > 0) return ms[ms.length - 1][1]
    }
  }

  if (selectorEnd === -1) return null

  const selectorText = prefix.slice(0, selectorEnd)
  const matches = [...selectorText.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)]
  if (matches.length === 0) return null
  return matches[matches.length - 1][1]
}

export function detectFromPrefix(prefix: string): CompletionContext {
  const selectorScope = detectSelectorScope(prefix)

  // CSS variable: inside an unclosed `var(` call
  const varMatch = prefix.match(/var\(\s*(--[\w-]*)?\s*$/)
  if (varMatch) {
    return {
      kind: 'css-variable',
      prefix: varMatch[1] ?? '',
      selectorScope,
      needsVarWrapper: false,
    }
  }

  // CSS variable: bare -- typed in a value position (e.g. `color: --`)
  const bareVarMatch = prefix.match(/:\s*(--[\w-]*)$/)
  if (bareVarMatch) {
    return {
      kind: 'css-variable',
      prefix: bareVarMatch[1],
      selectorScope,
      needsVarWrapper: true,
    }
  }

  const lastOpenBracket = findLastUnclosedBracket(prefix)
  if (lastOpenBracket === -1) return { kind: 'none' }

  const insideBracket = prefix.slice(lastOpenBracket + 1)

  const eqIndex = insideBracket.indexOf('=')
  if (eqIndex !== -1) {
    return detectValueContext(insideBracket, eqIndex, selectorScope)
  }

  // Only fire for data-* attributes (or a prefix that could still become one).
  if (
    insideBracket.length > 0 &&
    !insideBracket.startsWith('data-') &&
    !'data-'.startsWith(insideBracket)
  ) {
    return { kind: 'none' }
  }

  return { kind: 'attribute-name', prefix: insideBracket, selectorScope }
}

export function findLastUnclosedBracket(prefix: string): number {
  let depth = 0
  for (let i = prefix.length - 1; i >= 0; i--) {
    if (prefix[i] === ']') depth++
    if (prefix[i] === '[') {
      if (depth === 0) return i
      depth--
    }
  }
  return -1
}

function detectValueContext(
  insideBracket: string,
  eqIndex: number,
  selectorScope: string | null,
): CompletionContext {
  const attribute = insideBracket.slice(0, eqIndex).trim()

  if (!attribute.startsWith('data-')) return { kind: 'none' }

  const afterEq = insideBracket.slice(eqIndex + 1)

  const quoteMatch = afterEq.match(/^(['"]?)(.*)/)
  const valuePrefix = quoteMatch ? quoteMatch[2] : afterEq

  return {
    kind: 'attribute-value',
    attribute,
    prefix: valuePrefix,
    selectorScope,
  }
}
