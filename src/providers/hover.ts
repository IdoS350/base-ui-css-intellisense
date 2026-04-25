import * as vscode from 'vscode'
import { findLastUnclosedBracket } from '../util/context'
import { buildHoverDocs } from '../util/hover-docs'
import type { AttributeIndex } from './completion'

const ATTR_NAME_REGEX = /data-[\w-]+/

export class BaseUiHoverProvider implements vscode.HoverProvider {
  constructor(private readonly attributeByName: Map<string, AttributeIndex>) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    const range = document.getWordRangeAtPosition(position, ATTR_NAME_REGEX)
    if (!range) return undefined

    const word = document.getText(range)
    const entry = this.attributeByName.get(word)
    if (!entry) return undefined

    if (!this.isInsideAttributeSelector(document, position)) return undefined

    return new vscode.Hover(
      new vscode.MarkdownString(buildHoverDocs(entry)),
      range,
    )
  }

  private isInsideAttributeSelector(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): boolean {
    const currentPrefix = document
      .lineAt(position)
      .text.slice(0, position.character)
    const startLine = Math.max(0, position.line - 5)
    const lookbackLines: string[] = []
    for (let i = startLine; i < position.line; i++) {
      lookbackLines.push(document.lineAt(i).text)
    }
    lookbackLines.push(currentPrefix)
    const combined = lookbackLines.join('\n')
    return findLastUnclosedBracket(combined) !== -1
  }
}
