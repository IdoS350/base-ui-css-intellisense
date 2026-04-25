import * as vscode from 'vscode'

export type CompletionContext =
  | { kind: 'attribute-name'; prefix: string }
  | { kind: 'attribute-value'; attribute: string; prefix: string }
  | { kind: 'css-variable'; prefix: string }
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
  const startLine = Math.max(0, position.line - 5)
  const lookbackLines: string[] = []
  for (let i = startLine; i < position.line; i++) {
    lookbackLines.push(document.lineAt(i).text)
  }
  lookbackLines.push(currentPrefix)

  return detectFromPrefix(lookbackLines.join('\n'))
}

export function detectFromPrefix(prefix: string): CompletionContext {
  // CSS variable: inside an unclosed var( call
  const varMatch = prefix.match(/var\(\s*(--[\w-]*)?\s*$/)
  if (varMatch) {
    return { kind: 'css-variable', prefix: varMatch[1] ?? '' }
  }

  const lastOpenBracket = findLastUnclosedBracket(prefix)
  if (lastOpenBracket === -1) return { kind: 'none' }

  const insideBracket = prefix.slice(lastOpenBracket + 1)

  const eqIndex = insideBracket.indexOf('=')
  if (eqIndex !== -1) {
    return detectValueContext(insideBracket, eqIndex)
  }

  // Only fire for data-* attributes (or a prefix that could still become one).
  if (
    insideBracket.length > 0 &&
    !insideBracket.startsWith('data-') &&
    !'data-'.startsWith(insideBracket)
  ) {
    return { kind: 'none' }
  }

  return { kind: 'attribute-name', prefix: insideBracket }
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
): CompletionContext {
  const attribute = insideBracket.slice(0, eqIndex).trim()

  if (!attribute.startsWith('data-')) return { kind: 'none' }

  const afterEq = insideBracket.slice(eqIndex + 1)

  const quoteMatch = afterEq.match(/^(['"]?)(.*)/)
  const valuePrefix = quoteMatch ? quoteMatch[2] : afterEq

  return { kind: 'attribute-value', attribute, prefix: valuePrefix }
}
