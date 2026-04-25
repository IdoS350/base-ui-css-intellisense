import type { AttributeIndex, CssVarIndex } from '../providers/completion'

const BASE_UI_GITHUB = 'https://github.com/mui/base-ui/blob/master'

export function buildCssVarHoverDocs(entry: CssVarIndex): string {
  const { cssVar, components, sourceFile } = entry

  let md = `### Base UI: \`${cssVar.name}\`\n\n`
  if (cssVar.description) md += `${cssVar.description}\n\n`
  if (cssVar.type) md += `**Type:** \`${cssVar.type}\`\n\n`

  md += '\n#### Used by\n'
  md += `${components.join(', ')}\n\n`

  if (sourceFile) {
    md += `[View source on GitHub](${BASE_UI_GITHUB}/${sourceFile})`
  }
  return md
}

export function buildHoverDocs(entry: AttributeIndex): string {
  const { attribute, components, sourceFile } = entry

  let md = `### Base UI: \`${attribute.name}\`\n\n`
  if (attribute.description) md += `${attribute.description}\n\n`
  if (attribute.values?.length) {
    md += `**Values:** ${attribute.values.map(({ value }) => `\`${value}\``).join(', ')}\n\n`
  }

  md += '\n#### Used by\n'
  md += `${components.join(', ')}\n\n`

  if (sourceFile) {
    md += `[View source on GitHub](${BASE_UI_GITHUB}/${sourceFile})`
  }
  return md
}
