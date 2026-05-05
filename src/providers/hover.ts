import * as vscode from 'vscode'
import { IndexManager } from '../component-detection/index-manager'
import { detectContext, findLastUnclosedBracket } from '../util/context'
import { buildCssVarHoverDocs, buildHoverDocs } from '../util/hover-docs'
import type { AttributeIndex, CssVarIndex } from './completion'

const ATTR_NAME_REGEX = /data-[\w-]+/
const CSS_VAR_REGEX = /--[\w-]+/

export class BaseUiHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly attributeByName: Map<string, AttributeIndex>,
    private readonly cssVarByName: Map<string, CssVarIndex>,
    private readonly indexManager: IndexManager,
  ) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | undefined> {
    let scopeComponents: string[] = []
    const ctx = detectContext(document, position)
    const selectorScope = ctx.kind !== 'none' ? ctx.selectorScope : null

    if (
      selectorScope !== null &&
      /\.(css|scss|less)$/.test(document.uri.fsPath)
    ) {
      const index = await this.indexManager.getIndex(document.uri, token)
      scopeComponents = index.get(selectorScope) ?? []
    }

    return (
      this.tryAttrHover(document, position, scopeComponents) ??
      this.tryCssVarHover(document, position, scopeComponents)
    )
  }

  private tryAttrHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    scopeComponents: string[],
  ): vscode.Hover | undefined {
    const range = document.getWordRangeAtPosition(position, ATTR_NAME_REGEX)
    if (!range) return undefined

    const word = document.getText(range)
    const entry = this.attributeByName.get(word)
    if (!entry) return undefined

    if (!this.isInsideAttributeSelector(document, position)) return undefined

    const filteredEntry = this.withScopeFilter(entry, scopeComponents)
    return new vscode.Hover(
      new vscode.MarkdownString(buildHoverDocs(filteredEntry)),
      range,
    )
  }

  private tryCssVarHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    scopeComponents: string[],
  ): vscode.Hover | undefined {
    const range = document.getWordRangeAtPosition(position, CSS_VAR_REGEX)
    if (!range) return undefined

    const word = document.getText(range)
    const entry = this.cssVarByName.get(word)
    if (!entry) return undefined

    const filteredEntry = this.withScopeFilter(entry, scopeComponents)
    return new vscode.Hover(
      new vscode.MarkdownString(buildCssVarHoverDocs(filteredEntry)),
      range,
    )
  }

  private withScopeFilter<T extends { components: string[] }>(
    entry: T,
    scopeComponents: string[],
  ): T {
    if (scopeComponents.length === 0) return entry
    const filtered = entry.components.filter((c) => scopeComponents.includes(c))
    return filtered.length > 0 ? { ...entry, components: filtered } : entry
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
