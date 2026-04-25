import type { AttributeIndex } from '../providers/completion'

const BASE_UI_GITHUB = 'https://github.com/mui/base-ui/blob/master'

export function buildHoverDocs(entry: AttributeIndex): string {
  const { attribute, components, sourceFile } = entry
  let md = ''
  if (attribute.description) md += `${attribute.description}\n\n`
  md += `**Used by:** ${components.join(', ')}\n\n`
  if (sourceFile) {
    md += `[View source on GitHub](${BASE_UI_GITHUB}/${sourceFile})`
  }
  return md
}
