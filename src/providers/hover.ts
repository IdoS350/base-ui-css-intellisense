import * as vscode from 'vscode'
import { findLastUnclosedBracket } from '../util/context'
import { buildCssVarHoverDocs, buildHoverDocs } from '../util/hover-docs'
import type { AttributeIndex, CssVarIndex } from './completion'

const ATTR_NAME_REGEX = /data-[\w-]+/
const CSS_VAR_REGEX = /--[\w-]+/

export class BaseUiHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly attributeByName: Map<string, AttributeIndex>,
    private readonly cssVarByName: Map<string, CssVarIndex>,
  ) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    return (
      this.tryAttrHover(document, position) ??
      this.tryCssVarHover(document, position)
    )
  }

  private tryAttrHover(
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

  private tryCssVarHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    const range = document.getWordRangeAtPosition(position, CSS_VAR_REGEX)
    if (!range) return undefined

    const word = document.getText(range)
    const entry = this.cssVarByName.get(word)
    if (!entry) return undefined

    return new vscode.Hover(
      new vscode.MarkdownString(buildCssVarHoverDocs(entry)),
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
