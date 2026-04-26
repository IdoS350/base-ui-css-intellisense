const CLASS_RE = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)(?=[^{]*\{)/g

export function extractClassSelectors(cssContent: string): string[] {
  const set = new Set<string>()
  let match: RegExpExecArray | null
  CLASS_RE.lastIndex = 0
  while ((match = CLASS_RE.exec(cssContent)) !== null) {
    set.add(match[1])
  }
  return Array.from(set)
}
