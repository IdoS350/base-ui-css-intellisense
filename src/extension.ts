import * as vscode from 'vscode'
import { loadData } from './data/loader.js'
import { BaseUiCompletionProvider } from './providers/completion.js'

const CSS_LANGUAGES = ['css', 'scss', 'less']
const TRIGGER_CHARACTERS = ['[', '-', '(', '"', "'"]

export function activate(context: vscode.ExtensionContext): void {
  const data = loadData(context)

  const completionProvider = new BaseUiCompletionProvider(data)

  const disposable = vscode.languages.registerCompletionItemProvider(
    CSS_LANGUAGES.map((language) => ({ language })),
    completionProvider,
    ...TRIGGER_CHARACTERS,
  )

  context.subscriptions.push(disposable)

  const components = Object.values(data.components)
  const attrCount = components.reduce((n, c) => n + c.attributes.length, 0)
  const cssVarCount = components.reduce((n, c) => n + c.cssVariables.length, 0)
  console.log(
    `[base-ui-intellisense] Activated. Loaded ${attrCount} attributes and ${cssVarCount} CSS variables across ${components.length} components from Base UI ${data.version}.`,
  )
}

export function deactivate(): void {}
