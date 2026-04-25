import * as fs from 'fs'
import * as path from 'path'
import type { BaseUiData } from '../../src/data/types'
import { parseCssVarFiles, parseDataAttrFiles, parseSharedEnums } from './parse'
import { readVersion, validateRepo } from './repo'
import { groupByComponent } from './transform'

const BASE_UI_GITHUB = 'https://github.com/mui/base-ui/blob/master'

interface CssVarEntry {
  description?: string
  type?: string
  components: string[]
  sourceFile?: string
}

function generateCssCustomData(data: BaseUiData): object {
  const varMap = new Map<string, CssVarEntry>()

  for (const [componentName, componentData] of Object.entries(
    data.components,
  )) {
    for (const cssVar of componentData.cssVariables) {
      const existing = varMap.get(cssVar.name)
      if (existing) {
        existing.components.push(componentName)
      } else {
        varMap.set(cssVar.name, {
          description: cssVar.description,
          type: cssVar.type,
          components: [componentName],
          sourceFile: componentData.cssVarsSourceFile,
        })
      }
    }
  }

  const properties = [...varMap.entries()].map(([name, entry]) => ({
    name,
    description: buildCssVarDescription(entry),
  }))

  return { version: 1.1, properties }
}

function buildCssVarDescription(entry: CssVarEntry): string {
  const parts: string[] = []
  if (entry.description) parts.push(entry.description)
  if (entry.type) parts.push(`**Type:** \`${entry.type}\``)
  parts.push(`**Used by:** ${entry.components.join(', ')}`)
  if (entry.sourceFile) {
    parts.push(`[View source on GitHub](${BASE_UI_GITHUB}/${entry.sourceFile})`)
  }
  return parts.join('\n\n')
}

function parseArgs(): { repoPath: string; outputPath: string } {
  const raw = process.argv[2]
  if (!raw) {
    console.error('Usage: pnpm generate <path-to-base-ui-repo>')
    process.exit(1)
  }
  return {
    repoPath: path.resolve(raw),
    outputPath: path.resolve('./data/base-ui-attributes.json'),
  }
}

async function main() {
  const { repoPath, outputPath } = parseArgs()

  if (!validateRepo(repoPath)) {
    console.error(
      `Error: "${repoPath}" does not look like the base-ui repo.\n` +
        `Expected to find:\n  ${path.join(repoPath, 'packages/react/src')}\n  ${path.join(repoPath, 'package.json')}`,
    )
    process.exit(1)
  }

  console.log(`Generating from: ${repoPath}`)

  const version = readVersion(repoPath)
  console.log(`Base UI version: ${version}`)

  const sharedValues = await parseSharedEnums(repoPath)
  console.log(`✓ Parsed ${sharedValues.size} shared enum members`)

  const rawAttrs = await parseDataAttrFiles(repoPath, sharedValues)
  const rawCssVars = await parseCssVarFiles(repoPath, sharedValues)

  const attrFiles = new Set(rawAttrs.map((r) => r.sourceFile)).size
  const cssVarFiles = new Set(rawCssVars.map((r) => r.sourceFile)).size
  console.log(
    `✓ Parsed ${attrFiles} *DataAttributes.ts files → ${rawAttrs.length} members`,
  )
  console.log(
    `✓ Parsed ${cssVarFiles} *CssVars.ts files → ${rawCssVars.length} members`,
  )

  const components = groupByComponent(rawAttrs, rawCssVars)
  const componentCount = Object.keys(components).length
  const attrCount = Object.values(components).reduce(
    (n, c) => n + c.attributes.length,
    0,
  )
  const cssVarCount = Object.values(components).reduce(
    (n, c) => n + c.cssVariables.length,
    0,
  )

  console.log(
    `✓ ${componentCount} components, ${attrCount} data attributes, ${cssVarCount} CSS variables`,
  )

  const output: BaseUiData = { version, components }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8')
  console.log(`✓ Output → ${outputPath}`)

  const cssDataPath = path.resolve('./data/base-ui.css-data.json')
  const cssData = generateCssCustomData(output)
  fs.writeFileSync(cssDataPath, JSON.stringify(cssData, null, 2), 'utf-8')
  console.log(`✓ Output → ${cssDataPath}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
