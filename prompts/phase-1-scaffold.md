# Phase 1 — Extension Scaffold & Hello World Completion

> **Goal:** Get a working VS Code extension that fires a `CompletionItemProvider` on `.css`, `.scss`, and `.less` files. No real data yet — just prove the plumbing works end to end.

---

## 1. Project setup

Initialize the project:

```bash
mkdir base-ui-css-intellisense && cd base-ui-css-intellisense
git init
pnpm init -y
```

Install dependencies:

```bash
# Dev dependencies
pnpm add -D typescript tsx esbuild @vscode/vsce
pnpm add -D @types/vscode@1.85.0 @types/node

# No runtime dependencies in v1
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "outDir": "./out",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Create `.gitignore`:

```
node_modules/
dist/
out/
*.vsix
```

---

## 2. `package.json` — extension manifest

Replace the contents of `package.json` with:

```json
{
  "name": "base-ui-css-intellisense",
  "displayName": "Base UI CSS IntelliSense",
  "description": "Autocomplete and hover docs for Base UI data attributes and CSS variables",
  "version": "0.0.1",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "activationEvents": ["onLanguage:css", "onLanguage:scss", "onLanguage:less"],
  "main": "./dist/extension.js",
  "contributes": {},
  "scripts": {
    "build": "node scripts/build.mjs",
    "watch": "node scripts/build.mjs --watch",
    "package": "vsce package",
    "generate": "tsx scripts/generate.ts"
  },
  "devDependencies": {}
}
```

> Fill in `devDependencies` from the install step above after running it.

---

## 3. Build script

Create `scripts/build.mjs`:

```js
import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'], // vscode is provided by the host, never bundle it
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
})

if (watch) {
  await ctx.watch()
  console.log('Watching...')
} else {
  await ctx.rebuild()
  await ctx.dispose()
  console.log('Build complete.')
}
```

---

## 4. Data types

Create `src/data/types.ts`:

```ts
export interface DataAttributeValue {
  value: string
  description?: string
}

export interface DataAttribute {
  /** Full attribute name, e.g. "data-open" */
  name: string
  description?: string
  values?: DataAttributeValue[]
  /** Component this belongs to, e.g. "ComboboxPopup". Unused in v1, stored for v2. */
  component: string
  /** Relative path in the base-ui repo, used to build GitHub links */
  sourceFile: string
}

export interface CssVariable {
  /** Full variable name, e.g. "--anchor-width" */
  name: string
  description?: string
  component: string
  sourceFile: string
}

export interface BaseUiData {
  /** Base UI version this data was generated from */
  version: string
  attributes: DataAttribute[]
  cssVariables: CssVariable[]
}
```

---

## 5. Data loader

Create `src/data/loader.ts`:

```ts
import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import type { BaseUiData } from './types'

let cached: BaseUiData | null = null

export function loadData(context: vscode.ExtensionContext): BaseUiData {
  if (cached) return cached

  const jsonPath = context.asAbsolutePath(
    path.join('data', 'base-ui-attributes.json'),
  )

  if (!fs.existsSync(jsonPath)) {
    // Return empty data before the generator has been run
    console.warn(
      '[base-ui-intellisense] base-ui-attributes.json not found. Run `pnpm run generate` first.',
    )
    cached = { version: 'unknown', attributes: [], cssVariables: [] }
    return cached
  }

  const raw = fs.readFileSync(jsonPath, 'utf-8')
  cached = JSON.parse(raw) as BaseUiData
  return cached
}
```

---

## 6. Stub data file

Create `data/base-ui-attributes.json` with a small hardcoded stub so the extension works before the generator is built. This will be replaced in Phase 2.

```json
{
  "version": "stub",
  "attributes": [
    {
      "name": "data-open",
      "description": "Present when the element is open.",
      "values": [],
      "component": "ComboboxPopup",
      "sourceFile": "packages/react/src/combobox/popup/ComboboxPopupDataAttributes.ts"
    },
    {
      "name": "data-side",
      "description": "Indicates which side the popup is anchored to.",
      "values": [
        { "value": "top" },
        { "value": "bottom" },
        { "value": "left" },
        { "value": "right" }
      ],
      "component": "ComboboxPopup",
      "sourceFile": "packages/react/src/combobox/popup/ComboboxPopupDataAttributes.ts"
    }
  ],
  "cssVariables": [
    {
      "name": "--anchor-width",
      "description": "The width of the anchor element.",
      "component": "ComboboxPopup",
      "sourceFile": "packages/react/src/combobox/popup/ComboboxPopupCssVars.ts"
    }
  ]
}
```

---

## 7. Completion provider

Create `src/providers/completion.ts`:

```ts
import * as vscode from 'vscode'
import type { BaseUiData } from '../data/types'

const BASE_UI_GITHUB = 'https://github.com/mui/base-ui/blob/master'

/**
 * Naive v1 provider: suggests all Base UI attrs/vars everywhere
 * inside attribute selectors and var() — no context detection yet.
 *
 * Context detection will be added in Phase 4.
 */
export class BaseUiCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly data: BaseUiData) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    const linePrefix = document
      .lineAt(position)
      .text.slice(0, position.character)

    const inAttributeSelector = /\[[\w-]*$/.test(linePrefix)
    const inVarCall = /var\([\w-]*$/.test(linePrefix)

    if (inAttributeSelector) {
      return this.attributeCompletions()
    }

    if (inVarCall) {
      return this.varCompletions()
    }

    return []
  }

  private attributeCompletions(): vscode.CompletionItem[] {
    return this.data.attributes.map((attr) => {
      const item = new vscode.CompletionItem(
        attr.name,
        vscode.CompletionItemKind.Property,
      )
      item.detail = `Base UI · ${attr.component}`
      item.documentation = this.buildDocs(
        attr.description,
        attr.component,
        attr.sourceFile,
      )
      item.sortText = `0_${attr.name}`
      return item
    })
  }

  private varCompletions(): vscode.CompletionItem[] {
    return this.data.cssVariables.map((v) => {
      const item = new vscode.CompletionItem(
        v.name,
        vscode.CompletionItemKind.Variable,
      )
      item.detail = `Base UI · ${v.component}`
      item.documentation = this.buildDocs(
        v.description,
        v.component,
        v.sourceFile,
      )
      item.sortText = `0_${v.name}`
      return item
    })
  }

  private buildDocs(
    description: string | undefined,
    component: string,
    sourceFile: string,
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString()
    if (description) {
      md.appendMarkdown(`${description}\n\n`)
    }
    md.appendMarkdown(`**Component:** ${component}\n\n`)
    md.appendMarkdown(
      `[View source on GitHub](${BASE_UI_GITHUB}/${sourceFile})`,
    )
    return md
  }
}
```

---

## 8. Entry point

Create `src/extension.ts`:

```ts
import * as vscode from 'vscode'
import { loadData } from './data/loader'
import { BaseUiCompletionProvider } from './providers/completion'

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
```

---

## 9. Manual test checklist

After running `pnpm run build` and launching the Extension Development Host (`F5` in VS Code):

1. Open or create a `.css` file.
2. Type `[data-` — confirm `data-open` and `data-side` appear in the completion list.
3. Select `data-side` — confirm the detail reads `Base UI · ComboboxPopup` and the docs show the description and a GitHub link.
4. Type `var(--` — confirm `--anchor-width` appears.
5. Type elsewhere (e.g. `color: re`) — confirm no Base UI completions appear.
6. Repeat steps 2–5 in a `.scss` and `.less` file.
7. Check the Output panel (select "Extension Host") for the activation log line.

**All six steps passing = Phase 1 complete.**

---

## What this does NOT do yet (next phases)

- **Phase 2:** Generator script that produces `base-ui-attributes.json` from the real Base UI source.
- **Phase 3:** Full context detection (`detectContext`) so completions only fire in precisely the right position.
- **Phase 4:** Enumerated value completions (e.g. `[data-side="top|bottom|..."]`).
- **Phase 5:** Hover provider.
