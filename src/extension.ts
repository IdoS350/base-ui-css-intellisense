import * as vscode from 'vscode'
import { loadData } from './data/loader'
import { BaseUiCompletionProvider } from './providers/completion'
import { BaseUiHoverProvider } from './providers/hover'

// `[` triggers completion in scss/less but the built-in CSS language server
// intercepts it in plain .css files. Extensions like Tailwind CSS IntelliSense
// and PostCSS also override the language ID of .css files. Register each group
// separately: scss/less use `[` as a trigger; everything else uses `-` instead.
const CSS_LIKE_LANGUAGES = ['css', 'tailwindcss', 'postcss']
const SCSS_LESS_LANGUAGES = ['scss', 'less']
const TRIGGER_CHARACTERS = ['[', '-', '"', "'"]
const TRIGGER_CHARACTERS_CSS = ['-', '"', "'"]

export function activate(context: vscode.ExtensionContext): void {
  const data = loadData(context)
  const completionProvider = new BaseUiCompletionProvider(data)
  const hoverProvider = new BaseUiHoverProvider(
    completionProvider.attributeByName,
  )

  const allLanguages = [...CSS_LIKE_LANGUAGES, ...SCSS_LESS_LANGUAGES]

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      CSS_LIKE_LANGUAGES.map((language) => ({ language })),
      completionProvider,
      ...TRIGGER_CHARACTERS_CSS,
    ),
    vscode.languages.registerCompletionItemProvider(
      SCSS_LESS_LANGUAGES.map((language) => ({ language })),
      completionProvider,
      ...TRIGGER_CHARACTERS,
    ),
    vscode.languages.registerHoverProvider(
      allLanguages.map((language) => ({ language })),
      hoverProvider,
    ),
  )

  const componentCount = Object.keys(data.components).length
  const attrCount = Object.values(data.components).reduce(
    (n, c) => n + c.attributes.length,
    0,
  )

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      console.log(`[base-ui] text changed in lang=${e.document.languageId}`)
    }),
  )

  console.log(
    `[base-ui-intellisense] v3 Activated. ` +
      `${attrCount} attributes across ${componentCount} components. ` +
      `Registered CSS(${TRIGGER_CHARACTERS_CSS}) SCSS/Less(${TRIGGER_CHARACTERS}).`,
  )
}

export function deactivate(): void {}
