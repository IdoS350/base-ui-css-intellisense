import * as path from 'path'
import * as vscode from 'vscode'
import { IndexManager } from './component-detection/index-manager'
import { WorkerClient } from './component-detection/worker-client'
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
  const config = vscode.workspace.getConfiguration('baseUiIntelliSense')

  if (!config.get<boolean>('enable', true)) {
    return
  }

  const resolverNames = config.get<string[]>('customResolvers', [])
  const packageName = config.get<string>('packageName', '@base-ui/react')
  const excludePatterns = config.get<string[]>('excludePatterns', [
    '**/node_modules/**',
    '**/dist/**',
    '**/out/**',
    '**/releases/**',
  ])
  const configLanguages = config.get<string[]>('languages', [
    ...CSS_LIKE_LANGUAGES,
    ...SCSS_LESS_LANGUAGES,
  ])

  const workerPath = path.join(
    context.extensionPath,
    'dist',
    'parser-worker.js',
  )
  const workerClient = new WorkerClient(workerPath)
  context.subscriptions.push(workerClient)

  const indexManager = new IndexManager(
    resolverNames,
    workerClient,
    packageName,
    excludePatterns,
  )
  indexManager.register(context)
  context.subscriptions.push(indexManager)

  const data = loadData(context)
  const completionProvider = new BaseUiCompletionProvider(data, indexManager)
  const hoverProvider = new BaseUiHoverProvider(
    completionProvider.attributeByName,
    completionProvider.cssVarByName,
    indexManager,
  )

  const cssLikeConfigured = configLanguages.filter((l) =>
    CSS_LIKE_LANGUAGES.includes(l),
  )
  const otherConfigured = configLanguages.filter(
    (l) => !CSS_LIKE_LANGUAGES.includes(l),
  )

  if (cssLikeConfigured.length > 0) {
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        cssLikeConfigured.map((language) => ({ language })),
        completionProvider,
        ...TRIGGER_CHARACTERS_CSS,
      ),
    )
  }

  if (otherConfigured.length > 0) {
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        otherConfigured.map((language) => ({ language })),
        completionProvider,
        ...TRIGGER_CHARACTERS,
      ),
    )
  }

  if (configLanguages.length > 0) {
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(
        configLanguages.map((language) => ({ language })),
        hoverProvider,
      ),
    )
  }

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
