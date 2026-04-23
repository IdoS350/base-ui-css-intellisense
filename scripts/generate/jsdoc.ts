export function extractJsDocDescription(fullText: string): string | undefined {
  const match = fullText.match(/\/\*\*([\s\S]*?)\*\//)
  if (!match) return undefined

  const result = match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter((line) => !line.startsWith('@'))
    .filter(Boolean)
    .join(' ')
    .trim()

  return result || undefined
}

export function extractJsDocType(fullText: string): string | undefined {
  const match = fullText.match(/@type\s+\{([^}]+)\}/)
  return match?.[1].trim()
}
