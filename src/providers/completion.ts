import * as vscode from 'vscode'
import { IndexManager } from '../component-detection/index-manager'
import type { BaseUiData, CssVariable, DataAttribute } from '../data/types'
import { detectContext } from '../util/context'

const BASE_UI_GITHUB = 'https://github.com/mui/base-ui/blob/master'

export interface AttributeIndex {
  attribute: DataAttribute
  components: string[]
  sourceFile?: string
}

export interface CssVarIndex {
  cssVar: CssVariable
  components: string[]
  sourceFile?: string
}

export class BaseUiCompletionProvider implements vscode.CompletionItemProvider {
  private readonly attributeIndex: AttributeIndex[]
  readonly attributeByName: Map<string, AttributeIndex>
  private readonly cssVarIndex: CssVarIndex[]
  readonly cssVarByName: Map<string, CssVarIndex>

  constructor(
    data: BaseUiData,
    private readonly indexManager: IndexManager,
  ) {
    const attrSeen = new Map<string, AttributeIndex>()

    for (const [componentName, componentData] of Object.entries(
      data.components,
    )) {
      for (const attribute of componentData.attributes) {
        const existing = attrSeen.get(attribute.name)
        if (existing) {
          existing.components.push(componentName)
        } else {
          attrSeen.set(attribute.name, {
            attribute,
            components: [componentName],
            sourceFile: componentData.attributesSourceFile,
          })
        }
      }
    }

    this.attributeIndex = [...attrSeen.values()]
    this.attributeByName = attrSeen

    const cssVarSeen = new Map<string, CssVarIndex>()

    for (const [componentName, componentData] of Object.entries(
      data.components,
    )) {
      for (const cssVar of componentData.cssVariables) {
        const existing = cssVarSeen.get(cssVar.name)
        if (existing) {
          existing.components.push(componentName)
        } else {
          cssVarSeen.set(cssVar.name, {
            cssVar,
            components: [componentName],
            sourceFile: componentData.cssVarsSourceFile,
          })
        }
      }
    }

    this.cssVarIndex = [...cssVarSeen.values()]
    this.cssVarByName = cssVarSeen
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.CompletionItem[] | undefined> {
    const ctx = detectContext(document, position)

    console.log(
      `[base-ui] provideCompletionItems lang=${document.languageId} ctx=${JSON.stringify(ctx)}`,
    )

    let scopeComponents: string[] = []
    if (
      ctx.kind !== 'none' &&
      ctx.selectorScope !== null &&
      /\.(css|scss|less)$/.test(document.uri.fsPath)
    ) {
      const index = await this.indexManager.getIndex(document.uri, token)
      scopeComponents = index.get(ctx.selectorScope) ?? []
    }

    switch (ctx.kind) {
      case 'attribute-name':
        return this.attributeNameCompletions(
          ctx.prefix,
          position,
          scopeComponents,
        )
      case 'attribute-value':
        return this.attributeValueCompletions(
          ctx.attribute,
          ctx.prefix,
          position,
        )
      case 'css-variable':
        return this.cssVariableCompletions(
          ctx.prefix,
          position,
          scopeComponents,
          ctx.needsVarWrapper,
        )
      case 'none':
        return undefined
    }
  }

  private prefixRange(prefix: string, position: vscode.Position): vscode.Range {
    // Explicitly tell VS Code which text this completion replaces. Without
    // this, CSS files (which include `[` in their word pattern) would use
    // `[data-` as the filter text, causing our completions to never match.
    return new vscode.Range(position.translate(0, -prefix.length), position)
  }

  private attributeNameCompletions(
    prefix: string,
    position: vscode.Position,
    scopeComponents: string[],
  ): vscode.CompletionItem[] {
    const range = this.prefixRange(prefix, position)
    return this.attributeIndex
      .filter((entry) => entry.attribute.name.startsWith(prefix))
      .filter(
        (entry) =>
          scopeComponents.length === 0 ||
          entry.components.some((c) => scopeComponents.includes(c)),
      )
      .map((entry) => {
        const item = new vscode.CompletionItem(
          entry.attribute.name,
          vscode.CompletionItemKind.Property,
        )
        item.detail = `Base UI · ${entry.components.join(', ')}`
        item.documentation = this.buildAttrDocs(entry)
        item.sortText = `0_${entry.attribute.name}`
        item.filterText = entry.attribute.name
        item.range = range
        return item
      })
  }

  private attributeValueCompletions(
    attribute: string,
    prefix: string,
    position: vscode.Position,
  ): vscode.CompletionItem[] | undefined {
    const entry = this.attributeByName.get(attribute)
    if (!entry?.attribute.values?.length) return undefined

    const range = this.prefixRange(prefix, position)
    return entry.attribute.values
      .filter((v) => v.value.startsWith(prefix))
      .map((v) => {
        const item = new vscode.CompletionItem(
          v.value,
          vscode.CompletionItemKind.EnumMember,
        )
        item.detail = `Base UI · ${attribute}`
        if (v.description) {
          item.documentation = new vscode.MarkdownString(v.description)
        }
        item.sortText = `0_${v.value}`
        item.range = range
        return item
      })
  }

  private cssVariableCompletions(
    prefix: string,
    position: vscode.Position,
    scopeComponents: string[],
    needsVarWrapper: boolean,
  ): vscode.CompletionItem[] {
    const range = this.prefixRange(prefix, position)
    return this.cssVarIndex
      .filter((entry) => entry.cssVar.name.startsWith(prefix))
      .filter(
        (entry) =>
          scopeComponents.length === 0 ||
          entry.components.some((c) => scopeComponents.includes(c)),
      )
      .map((entry) => {
        const item = new vscode.CompletionItem(
          entry.cssVar.name,
          vscode.CompletionItemKind.Variable,
        )
        item.detail = `Base UI · ${entry.components.join(', ')}`
        item.documentation = this.buildCssVarDocs(entry)
        item.sortText = `0_${entry.cssVar.name}`
        item.filterText = entry.cssVar.name
        item.range = range
        if (needsVarWrapper) {
          item.insertText = `var(${entry.cssVar.name})`
        }
        return item
      })
  }

  private buildAttrDocs(entry: AttributeIndex): vscode.MarkdownString {
    const md = new vscode.MarkdownString()
    const { attribute, components, sourceFile } = entry

    if (attribute.description) md.appendMarkdown(`${attribute.description}\n\n`)
    md.appendMarkdown(`**Used by:** ${components.join(', ')}\n\n`)
    if (sourceFile) {
      md.appendMarkdown(
        `[View source on GitHub](${BASE_UI_GITHUB}/${sourceFile})`,
      )
    }
    return md
  }

  private buildCssVarDocs(entry: CssVarIndex): vscode.MarkdownString {
    const md = new vscode.MarkdownString()
    const { cssVar, components, sourceFile } = entry

    if (cssVar.description) md.appendMarkdown(`${cssVar.description}\n\n`)
    if (cssVar.type) md.appendMarkdown(`**Type:** \`${cssVar.type}\`\n\n`)
    md.appendMarkdown(`**Used by:** ${components.join(', ')}\n\n`)
    if (sourceFile) {
      md.appendMarkdown(
        `[View source on GitHub](${BASE_UI_GITHUB}/${sourceFile})`,
      )
    }
    return md
  }
}
