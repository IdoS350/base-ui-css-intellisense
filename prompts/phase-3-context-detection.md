# Phase 3 — Context Detection & Correct Completions

> **Goal:** Replace the naive line-prefix heuristic from Phase 1 with precise cursor context detection, wire in enum value completions, and use VS Code's CSS Custom Data format for `var()` completions — leaving only attribute selector completions in the programmatic provider.

---

## Key discovery: two different mechanisms for two different completion types

After researching VS Code's CSS extension APIs, Phase 3 splits into two distinct tracks:

| Completion type                    | Mechanism                                                  | Why                                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `var(--anchor-width)`              | **VS Code CSS Custom Data** (`contributes.css.customData`) | Free hover + completion with zero context detection code. VS Code handles all of it.                                                                                          |
| `[data-open]`, `[data-side="top"]` | **`CompletionItemProvider`** with `detectContext()`        | Custom Data has no attribute selector support — `properties`, `pseudoClasses`, `pseudoElements`, and `atDirectives` are the only four options. Must be done programmatically. |

This means the `CompletionItemProvider` gets **simpler**, not more complex — it only handles attribute selectors now. The `var()` path moves entirely to a declarative JSON file.

---

## Types (current — as of this phase)

```ts
export interface DataAttributeValue {
  value: string
  description?: string
}

export interface DataAttribute {
  name: string // e.g. "data-open"
  description?: string
  values?: DataAttributeValue[]
}

export interface CssVariable {
  name: string // e.g. "--anchor-width"
  description?: string
}

export interface ComponentData {
  attributes: DataAttribute[]
  cssVariables: CssVariable[]
  attributesSourceFile?: string // relative path to *DataAttributes.ts
  cssVarsSourceFile?: string // relative path to *CssVars.ts
}

export interface BaseUiData {
  version: string
  components: Record<string, ComponentData> // key = component name, e.g. "ComboboxPopup"
}
```

Everything downstream works off `Object.entries(data.components)`. Component name and source file paths are on `ComponentData`, not on individual attributes.

---

## Track A — CSS Custom Data for `var()` completions

### What it is

VS Code has a built-in extension point (`contributes.css.customData`) that lets extensions declare custom CSS properties. When registered, VS Code's own language server handles completions, hover, and validation automatically — no provider code required.

The custom data format:

```json
{
  "version": 1.1,
  "properties": [
    {
      "name": "--anchor-width",
      "description": "The width of the anchor element.\n\n**Used by:** ComboboxPopup\n\n[View source on GitHub](...)"
    }
  ]
}
```

### 1. Add a generator step: `generateCssCustomData()`

Add a new step to `scripts/generate.ts` that outputs a second file alongside `base-ui-attributes.json`.

**Output:** `data/base-ui.css-data.json`

The same CSS variable may appear in multiple components (e.g. `--available-height` on several popup components). Deduplicate by variable name and collect all component names that use it:

```ts
interface CssVarEntry {
  description?: string
  components: string[]
  sourceFile?: string
}

function generateCssCustomData(data: BaseUiData): object {
  // Collect all CSS vars across components, merging duplicates by name
  const varMap = new Map<string, CssVarEntry>()

  for (const [componentName, componentData] of Object.entries(
    data.components,
  )) {
    for (const cssVar of componentData.cssVariables) {
      const existing = varMap.get(cssVar.name)
      if (existing) {
        existing.components.push(componentName)
      } else {
        varMap.set(cssVar.name, {
          description: cssVar.description,
          components: [componentName],
          sourceFile: componentData.cssVarsSourceFile,
        })
      }
    }
  }

  const properties = [...varMap.entries()].map(([name, entry]) => ({
    name,
    description: buildCssVarDescription(name, entry),
  }))

  return { version: 1.1, properties }
}

const BASE_UI_GITHUB = 'https://github.com/mui/base-ui/blob/master'

function buildCssVarDescription(_name: string, entry: CssVarEntry): string {
  const parts: string[] = []
  if (entry.description) parts.push(entry.description)
  parts.push(`**Used by:** ${entry.components.join(', ')}`)
  if (entry.sourceFile) {
    parts.push(`[View source on GitHub](${BASE_UI_GITHUB}/${entry.sourceFile})`)
  }
  return parts.join('\n\n')
}
```

Commit `data/base-ui.css-data.json` alongside `data/base-ui-attributes.json`.

### 2. Register in `package.json`

```json
{
  "contributes": {
    "css": { "customData": ["./data/base-ui.css-data.json"] },
    "scss": { "customData": ["./data/base-ui.css-data.json"] },
    "less": { "customData": ["./data/base-ui.css-data.json"] }
  }
}
```

This is entirely declarative — no changes to `extension.ts`.

### 3. Remove `var()` completions from the programmatic provider

Delete `varCompletions()` and `'('` from the trigger characters in `completion.ts`. The `CompletionItemProvider` now only handles attribute selectors.

CSS variables are consumed statically by VS Code at startup — `loader.ts` no longer needs to expose them at runtime. The `cssVariables` field can remain in the loaded data (it's harmless) or be stripped from the loader return value — either is fine.

---

## Track B — `detectContext()` for attribute selector completions

The `CompletionItemProvider` now has one job: fire the right completions inside `[...]` attribute selectors. The cursor can be in three sub-states:

```
[data-          →  attribute-name:  suggest all data-* attribute names
[data-side=     →  attribute-value: suggest enum values for data-side
[data-side="top →  attribute-value: suggest enum values (already mid-value)
```

### The context type

```ts
// src/util/context.ts

export type CompletionContext =
  | { kind: 'attribute-name'; prefix: string }
  | { kind: 'attribute-value'; attribute: string; prefix: string }
  | { kind: 'none' }
```

### The detection algorithm

Scan the line text backwards from the cursor. Do not attempt to parse the full CSS file — line-prefix scanning handles all realistic patterns.

```ts
export function detectFromPrefix(prefix: string): CompletionContext {
  // Find the last unclosed `[` scanning backwards
  const lastOpenBracket = findLastUnclosedBracket(prefix)
  if (lastOpenBracket === -1) return { kind: 'none' }

  const insideBracket = prefix.slice(lastOpenBracket + 1)

  // Are we past an `=` sign? If so we're in value position.
  const eqIndex = insideBracket.indexOf('=')
  if (eqIndex !== -1) {
    return detectValueContext(insideBracket, eqIndex)
  }

  // No `=` yet — still typing the attribute name.
  return { kind: 'attribute-name', prefix: insideBracket }
}
```

#### `findLastUnclosedBracket()`

```ts
function findLastUnclosedBracket(prefix: string): number {
  let depth = 0
  for (let i = prefix.length - 1; i >= 0; i--) {
    if (prefix[i] === ']') depth++
    if (prefix[i] === '[') {
      if (depth === 0) return i
      depth--
    }
  }
  return -1
}
```

#### `detectValueContext()`

```ts
function detectValueContext(
  insideBracket: string,
  eqIndex: number,
): CompletionContext {
  const attribute = insideBracket.slice(0, eqIndex).trim()

  // Only fire for data-* attributes
  if (!attribute.startsWith('data-')) return { kind: 'none' }

  const afterEq = insideBracket.slice(eqIndex + 1)

  // Strip leading quote if present
  const quoteMatch = afterEq.match(/^(['"]?)(.*)/)
  const valuePrefix = quoteMatch ? quoteMatch[2] : afterEq

  return { kind: 'attribute-value', attribute, prefix: valuePrefix }
}
```

#### `detectContext()` — with multiline lookback

The most common multiline pattern is a selector split across lines:

```css
.foo[
  data-side="top"
]
```

The cursor on line 2 needs context from the `[` on line 1. Scan backwards through up to 5 previous lines:

```ts
export function detectContext(
  document: vscode.TextDocument,
  position: vscode.Position,
): CompletionContext {
  const currentPrefix = document
    .lineAt(position)
    .text.slice(0, position.character)

  const lookbackLines: string[] = [currentPrefix]
  const startLine = Math.max(0, position.line - 5)
  for (let i = position.line - 1; i >= startLine; i--) {
    lookbackLines.push(document.lineAt(i).text)
  }

  // Join into a single string — newlines don't affect the bracket scanner
  return detectFromPrefix(lookbackLines.join('\n'))
}
```

### Edge cases

| Input prefix            | Expected result                                           |
| ----------------------- | --------------------------------------------------------- |
| `.foo[data-`            | `attribute-name`, prefix `"data-"`                        |
| `.foo[data-side`        | `attribute-name`, prefix `"data-side"`                    |
| `.foo[data-side=`       | `attribute-value`, attribute `"data-side"`, prefix `""`   |
| `.foo[data-side="`      | `attribute-value`, attribute `"data-side"`, prefix `""`   |
| `.foo[data-side="to`    | `attribute-value`, attribute `"data-side"`, prefix `"to"` |
| `.foo[data-side='top']` | `none` — bracket is closed                                |
| `.foo:not([data-`       | `attribute-name` — nested in `:not()`                     |
| `[data-open][data-`     | `attribute-name` — chained selectors                      |
| `[aria-`                | `none` — not a data-\* attribute                          |
| `background: var(--`    | `none` — handled by Custom Data                           |
| `[\n  data-side="to`    | `attribute-value`, attribute `"data-side"`, prefix `"to"` |

---

## Completion provider

### Flattening the new data shape

The provider needs a flat view across all components for `attribute-name` completions, and a per-attribute lookup for `attribute-value` completions. Build these indexes once at construction time — not on every keypress.

Since the same attribute (e.g. `data-open`) appears on many components, deduplicate by name and keep a list of all components that use it, for richer `detail` text:

```ts
interface AttributeIndex {
  attribute: DataAttribute
  components: string[] // all components that have this attribute
  sourceFile?: string // attributesSourceFile from the first component seen
}

export class BaseUiCompletionProvider implements vscode.CompletionItemProvider {
  private readonly attributeIndex: AttributeIndex[]
  private readonly attributeByName: Map<string, AttributeIndex>

  constructor(private readonly data: BaseUiData) {
    const seen = new Map<string, AttributeIndex>()

    for (const [componentName, componentData] of Object.entries(
      data.components,
    )) {
      for (const attribute of componentData.attributes) {
        const existing = seen.get(attribute.name)
        if (existing) {
          // Attribute seen before — just add this component to the list
          existing.components.push(componentName)
        } else {
          seen.set(attribute.name, {
            attribute,
            components: [componentName],
            sourceFile: componentData.attributesSourceFile,
          })
        }
      }
    }

    this.attributeIndex = [...seen.values()]
    this.attributeByName = seen
  }

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] | undefined {
    const ctx = detectContext(document, position)

    switch (ctx.kind) {
      case 'attribute-name':
        return this.attributeNameCompletions(ctx.prefix)
      case 'attribute-value':
        return this.attributeValueCompletions(ctx.attribute, ctx.prefix)
      case 'none':
        return undefined
    }
  }

  private attributeNameCompletions(prefix: string): vscode.CompletionItem[] {
    return this.attributeIndex
      .filter((entry) => entry.attribute.name.startsWith(prefix))
      .map((entry) => {
        const item = new vscode.CompletionItem(
          entry.attribute.name,
          vscode.CompletionItemKind.Property,
        )
        item.detail = `Base UI · ${entry.components.join(', ')}`
        item.documentation = this.buildDocs(entry)
        item.sortText = `0_${entry.attribute.name}`
        // Prevent VS Code from inserting a duplicate prefix (e.g. "data-data-open")
        item.filterText = entry.attribute.name
        return item
      })
  }

  private attributeValueCompletions(
    attribute: string,
    prefix: string,
  ): vscode.CompletionItem[] | undefined {
    const entry = this.attributeByName.get(attribute)
    if (!entry?.attribute.values?.length) return undefined

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
        return item
      })
  }

  private buildDocs(entry: AttributeIndex): vscode.MarkdownString {
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
}
```

### Trigger characters

Remove `(` (was for `var(`). Keep `[`, `-`, `"`, `'`:

```ts
const TRIGGER_CHARACTERS = ['[', '-', '"', "'"]
```

---

## Updated `extension.ts`

```ts
const TRIGGER_CHARACTERS = ['[', '-', '"', "'"]

export function activate(context: vscode.ExtensionContext): void {
  const data = loadData(context)
  const provider = new BaseUiCompletionProvider(data)

  const disposable = vscode.languages.registerCompletionItemProvider(
    CSS_LANGUAGES.map((language) => ({ language })),
    provider,
    ...TRIGGER_CHARACTERS,
  )

  context.subscriptions.push(disposable)

  const componentCount = Object.keys(data.components).length
  const attrCount = Object.values(data.components).reduce(
    (n, c) => n + c.attributes.length,
    0,
  )

  console.log(
    `[base-ui-intellisense] Activated. ` +
      `${attrCount} attributes across ${componentCount} components. ` +
      `CSS variables served via Custom Data.`,
  )
}
```

---

## Unit tests for `detectFromPrefix()`

`detectFromPrefix` is pure with no VS Code dependencies — test it in isolation. Create `src/util/context.test.ts` using vitest or node's built-in test runner.

```ts
import { detectFromPrefix } from './context'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('detectFromPrefix', () => {
  // Attribute name
  it('empty bracket', () =>
    assert.deepEqual(detectFromPrefix('.foo['), {
      kind: 'attribute-name',
      prefix: '',
    }))
  it('partial data-', () =>
    assert.deepEqual(detectFromPrefix('.foo[data-'), {
      kind: 'attribute-name',
      prefix: 'data-',
    }))
  it('full attr name', () =>
    assert.deepEqual(detectFromPrefix('.foo[data-side'), {
      kind: 'attribute-name',
      prefix: 'data-side',
    }))

  // Attribute value — double quotes
  it('value, no quote', () =>
    assert.deepEqual(detectFromPrefix('[data-side='), {
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: '',
    }))
  it('value, open double quote', () =>
    assert.deepEqual(detectFromPrefix('[data-side="'), {
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: '',
    }))
  it('value, partial double quote', () =>
    assert.deepEqual(detectFromPrefix('[data-side="to'), {
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: 'to',
    }))

  // Attribute value — single quotes
  it('value, open single quote', () =>
    assert.deepEqual(detectFromPrefix("[data-side='"), {
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: '',
    }))
  it('value, partial single quote', () =>
    assert.deepEqual(detectFromPrefix("[data-side='to"), {
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: 'to',
    }))

  // None cases
  it('closed bracket', () =>
    assert.deepEqual(detectFromPrefix('[data-side="top"]'), { kind: 'none' }))
  it('non-data attribute', () =>
    assert.deepEqual(detectFromPrefix('[aria-'), { kind: 'none' }))
  it('var() — handled by Custom Data', () =>
    assert.deepEqual(detectFromPrefix('color: var(--'), { kind: 'none' }))

  // Structural
  it('chained selectors', () =>
    assert.deepEqual(detectFromPrefix('[data-open][data-'), {
      kind: 'attribute-name',
      prefix: 'data-',
    }))
  it(':not() wrapping', () =>
    assert.deepEqual(detectFromPrefix(':not([data-'), {
      kind: 'attribute-name',
      prefix: 'data-',
    }))

  // Multiline (joined with newline as detectContext does)
  it('bracket on previous line', () =>
    assert.deepEqual(detectFromPrefix('[\n  data-side="to'), {
      kind: 'attribute-value',
      attribute: 'data-side',
      prefix: 'to',
    }))
})
```

Add test script to `package.json`:

```json
"test": "node --test --require tsx/cjs src/util/context.test.ts"
```

---

## File changes summary

| File                          | Change                                                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/generate.ts`         | Add `generateCssCustomData()` — iterates `Object.entries(data.components)`, deduplicates CSS vars, writes `data/base-ui.css-data.json`                                             |
| `data/base-ui.css-data.json`  | New generated file, committed                                                                                                                                                      |
| `package.json`                | Add `contributes.css/scss/less.customData`; add `"test"` script                                                                                                                    |
| `src/util/context.ts`         | New — `detectContext()`, `detectFromPrefix()`, helpers                                                                                                                             |
| `src/util/context.test.ts`    | New — unit tests for `detectFromPrefix()`                                                                                                                                          |
| `src/providers/completion.ts` | New implementation: builds `attributeIndex` / `attributeByName` from `data.components` in constructor; replaces naive heuristic with `detectContext()`; removes `varCompletions()` |
| `src/extension.ts`            | Updated activation log; remove `(` from trigger characters                                                                                                                         |

---

## Manual verification checklist

1. **CSS variable completions via Custom Data:**
   - Type `color: var(--` in a `.css` file. Confirm Base UI variable suggestions appear.
   - Hover over a typed `var(--anchor-width)`. Confirm description and "Used by" info appear — free from Custom Data.
   - Repeat in `.scss` and `.less`.

2. **Attribute name completions:**
   - Type `[data-`. Confirm suggestions appear.
   - Type `[data-si`. Confirm list filters correctly.
   - Type `[aria-`. Confirm **no** Base UI suggestions appear.
   - Type `color: red`. Confirm no Base UI suggestions appear.

3. **Attribute value completions:**
   - Type `[data-side=`. Confirm `top`, `bottom`, `left`, `right`, `inline-start`, `inline-end` appear.
   - Type `[data-side="t`. Confirm list filters to `top`.
   - Type `[data-open=`. Confirm **no** value suggestions (boolean attribute has no `values[]`).

4. **Structural selectors:**
   - Type `[data-open][data-`. Confirm attribute suggestions appear.
   - Type `:not([data-`. Confirm attribute suggestions appear.

5. **Multiline selector:**
   - Put `[` on one line, continue typing `data-side="` on the next. Confirm value suggestions appear.

6. **Unit tests:** `pnpm test` exits 0.

7. **No pollution:** typing normal CSS (`color: re`, `display: fl`) produces no Base UI suggestions.

**All 7 checks passing = Phase 3 complete.**

---

## What this does NOT do yet

- **Phase 4 (hover provider):** Hovering over a typed `[data-open]` in a selector shows its description. CSS vars already get hover for free from Custom Data — this phase adds the equivalent for attribute selectors.
- **Phase 5 (packaging):** README, icon, VSIX, marketplace publish.
