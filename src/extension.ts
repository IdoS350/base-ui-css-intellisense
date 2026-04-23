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

  console.log(
    `[base-ui-intellisense] Activated. Loaded ${data.attributes.length} attributes and ${data.cssVariables.length} CSS variables from Base UI ${data.version}.`,
  )
}

export function deactivate(): void {}
