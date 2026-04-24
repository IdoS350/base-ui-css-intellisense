import * as vscode from 'vscode'
import type { BaseUiData } from '../data/types.js'

const BASE_UI_GITHUB = 'https://github.com/mui/base-ui/blob/master'

const IN_ATTRIBUTE_SELECTOR_REGEX = /\[[\w-]*$/
const IN_VAR_CALL_REGEX = /var\([\w-]*$/

export class BaseUiCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly data: BaseUiData) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    const linePrefix = document
      .lineAt(position)
      .text.slice(0, position.character)

    if (IN_ATTRIBUTE_SELECTOR_REGEX.test(linePrefix)) {
      return this.attributeCompletions()
    }
    if (IN_VAR_CALL_REGEX.test(linePrefix)) {
      return this.varCompletions()
    }
    return []
  }

  private attributeCompletions(): vscode.CompletionItem[] {
    return Object.entries(this.data.components).flatMap(
      ([component, componentData]) =>
        componentData.attributes.map((attr) => {
          const item = new vscode.CompletionItem(
            attr.name,
            vscode.CompletionItemKind.Property,
          )
          item.detail = `Base UI · ${component}`
          item.documentation = this.buildDocs(
            attr.description,
            component,
            componentData.attributesSourceFile,
          )
          item.sortText = `0_${attr.name}`
          return item
        }),
    )
  }

  private varCompletions(): vscode.CompletionItem[] {
    return Object.entries(this.data.components).flatMap(
      ([component, componentData]) =>
        componentData.cssVariables.map((v) => {
          const item = new vscode.CompletionItem(
            v.name,
            vscode.CompletionItemKind.Variable,
          )
          item.detail = `Base UI · ${component}`
          item.documentation = this.buildDocs(
            v.description,
            component,
            componentData.cssVarsSourceFile,
          )
          item.sortText = `0_${v.name}`
          return item
        }),
    )
  }

  private buildDocs(
    description: string | undefined,
    component: string,
    sourceFile: string | undefined,
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString()
    if (description) {
      md.appendMarkdown(`${description}\n\n`)
    }
    md.appendMarkdown(`**Component:** ${component}\n\n`)
    if (sourceFile) {
      md.appendMarkdown(
        `[View source on GitHub](${BASE_UI_GITHUB}/${sourceFile})`,
      )
    }
    return md
  }
}
