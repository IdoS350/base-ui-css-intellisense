# Phase 4 — Hover Provider

> **Goal:** Show a documentation tooltip when hovering over a Base UI data attribute name inside a CSS attribute selector. CSS variables already get hover for free from Custom Data (Phase 3) — this phase adds the equivalent for `[data-*]` attribute selectors.

---

## What needs hovering

Only one surface needs a programmatic hover — attribute names inside selectors:

```css
.foo[data-side="top"] { ... }
      ^^^^^^^^^
      hover here → show description, components, GitHub link
```

Attribute values (e.g. `"top"`) and CSS variables are out of scope — values carry no extra docs, and CSS vars are already covered by Custom Data.

---

## The word-range problem

VS Code's default word range uses `getWordRangeAtPosition()`, which splits on non-alphanumeric characters including `-`. That means hovering over `data-side` would only detect `data` or `side` depending on where the cursor lands.

The fix is a custom regex passed to `getWordRangeAtPosition`:

```ts
const ATTR_NAME_REGEX = /data-[\w-]+/
const range = document.getWordRangeAtPosition(position, ATTR_NAME_REGEX)
```

This captures the full `data-*` token in one shot. If the cursor isn't on a `data-*` token, `range` is `undefined` and the provider returns `undefined` — no hover shown.

---

## Reusing the completion provider's index

The completion provider already builds `attributeByName: Map<string, AttributeIndex>` in its constructor. Rather than duplicating this logic, export the index type and pass it into the hover provider at construction time.

```ts
// src/providers/completion.ts — add export
export type { AttributeIndex }
```

Both providers are constructed in `extension.ts` and share the same index — built once, used twice.

---

## Implementation: `src/providers/hover.ts`

```ts
import * as vscode from 'vscode'
import type { AttributeIndex } from './completion'

const ATTR_NAME_REGEX = /data-[\w-]+/
const BASE_UI_GITHUB = 'https://github.com/mui/base-ui/blob/master'

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

    // Confirm the cursor is actually inside an attribute selector `[...]`
    // to avoid showing hovers on e.g. a `data-*` string inside a comment.
    if (!this.isInsideAttributeSelector(document, position)) return undefined

    return new vscode.Hover(this.buildDocs(entry), range)
  }

  private isInsideAttributeSelector(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): boolean {
    // Reuse the same lookback approach as detectContext —
    // check that there is an unclosed `[` before the cursor.
    // Lines must be oldest→newest so findLastUnclosedBracket scans correctly.
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

`findLastUnclosedBracket` is imported from `src/util/context.ts` — export it from there (it's already written, just not exported).

---

## Updates to `extension.ts`

```ts
export function activate(context: vscode.ExtensionContext): void {
  const data = loadData(context)
  const completionProvider = new BaseUiCompletionProvider(data)

  // Share the index rather than rebuilding it
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
}
```

`attributeByName` needs to change from `private` to `readonly` (no `private`) in `completion.ts` so it's accessible here:

```ts
// completion.ts
constructor(private readonly data: BaseUiData) {
  // ...
  this.attributeByName = seen;  // was private, now just readonly
}

readonly attributeByName: Map<string, AttributeIndex>;
```

---

## Tests: `src/util/hover.test.ts`

The test script picks up `scripts/generate/*.test.ts` and `src/util/context.test.ts` by name — a file at `src/providers/hover.test.ts` would be silently ignored. Place the hover tests at `src/util/hover.test.ts` and extend the test script:

```json
"test": "tsx --test scripts/generate/*.test.ts src/util/*.test.ts"
```

The hover provider has a VS Code dependency (`TextDocument`, `Position`) which makes it harder to unit test directly. Focus tests on the pure helper instead.

### Test `isInsideAttributeSelector` logic

Extract the bracket-check logic into a standalone exported function in `context.ts` (it already exists as `findLastUnclosedBracket` — just ensure it's exported). Test via `detectFromPrefix` which already covers it in `context.test.ts` — no new tests needed there.

### Test `buildDocs` output

Extract `buildDocs` as a pure exported function that takes an `AttributeIndex` and returns a `MarkdownString`. Test that:

```ts
// src/util/hover.test.ts
import { buildHoverDocs } from '../providers/hover.js'

// With description and sourceFile
const entry: AttributeIndex = {
  attribute: {
    name: 'data-open',
    description: 'Present when open.',
    values: [],
  },
  components: ['DialogPopup', 'PopoverPopup'],
  sourceFile: 'packages/react/src/dialog/popup/DialogPopupDataAttributes.ts',
}
const md = buildHoverDocs(entry)
assert(md.value.includes('Present when open.'))
assert(md.value.includes('DialogPopup, PopoverPopup'))
assert(md.value.includes('github.com/mui/base-ui'))

// Without optional fields
const minimal: AttributeIndex = {
  attribute: { name: 'data-empty' },
  components: ['ComboboxPopup'],
  sourceFile: undefined,
}
const mdMinimal = buildHoverDocs(minimal)
assert(!mdMinimal.value.includes('undefined'))
assert(mdMinimal.value.includes('ComboboxPopup'))
```

Export `buildHoverDocs` from `hover.ts` for testability:

```ts
// hover.ts — extract from the class so it's purely testable
export function buildHoverDocs(entry: AttributeIndex): vscode.MarkdownString { ... }
```

---

## File changes summary

| File                          | Change                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `src/util/context.ts`         | Export `findLastUnclosedBracket` (was unexported)                                  |
| `src/providers/completion.ts` | Make `attributeByName` `readonly` (remove `private`); export `AttributeIndex` type |
| `src/providers/hover.ts`      | New — `BaseUiHoverProvider`, exported `buildHoverDocs`                             |
| `src/util/hover.test.ts`      | New — tests for `buildHoverDocs`                                                   |
| `package.json`                | Update `test` script glob to `src/util/*.test.ts`                                  |
| `src/extension.ts`            | Construct and register `BaseUiHoverProvider`                                       |

---

## Manual verification checklist

1. Hover over `data-open` in `[data-open]` — tooltip appears with description and "Used by" list.
2. Hover over `data-side` — tooltip appears with correct components.
3. Hover over `data-side` in `[data-side="top"]` — tooltip still appears (cursor on name, not value).
4. Hover over `"top"` (the value) — no tooltip.
5. Hover over a Base UI attribute inside a CSS comment — no tooltip.
6. Hover over `--anchor-width` inside `var(--anchor-width)` — tooltip from Custom Data still works (not broken by this phase).
7. Hover over `color` or any non-Base-UI word — no tooltip.
8. `pnpm format && pnpm test` passes.

**All 8 checks passing = Phase 4 complete.**
