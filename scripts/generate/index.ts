import * as fs from 'fs'
import * as path from 'path'
import type { BaseUiData } from '../../src/data/types.js'
import { parseCssVarFiles, parseDataAttrFiles, parseSharedEnums } from './parse.js'
import { readVersion, validateRepo } from './repo.js'
import { transformAttributes, transformCssVars } from './transform.js'

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

  const attributes = transformAttributes(rawAttrs)
  const cssVariables = transformCssVars(rawCssVars)

  console.log(`✓ ${attributes.length} data attributes`)
  console.log(`✓ ${cssVariables.length} CSS variables`)

  const output: BaseUiData = { version, attributes, cssVariables }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8')

  console.log(`✓ Output → ${outputPath}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
