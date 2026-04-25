# Phase 6.2 — AST Analyzer (Structural Inference Phase)

Implement the structural inference step: given a list of CSS class selectors and the text of each bridge file, produce an inverted index mapping each selector to the Base UI component(s) that use it.

Phase 6.1 produced the bridge files. Phase 6.2 is entirely pure (no `vscode.*` calls) — all VS Code I/O was done by the caller before this phase runs.

---

## New files

```
src/component-detection/
  css-extractor.ts        ← new
  css-extractor.test.ts   ← new
  ast-analyzer.ts         ← new
  ast-analyzer.test.ts    ← new
```

---

## New dependency

```bash
pnpm add @babel/parser
pnpm add -D @babel/types
```

`@babel/parser` is a runtime dependency — esbuild bundles it into `dist/extension.js`. `@babel/types` is dev-only (type definitions for AST nodes).

---

## Step 1 — CSS Extractor (`css-extractor.ts`)

### Public API

```ts
export function extractClassSelectors(cssContent: string): string[]
```

Returns de-duplicated class names (no leading dot) found in the CSS source. Order is unimportant.

### Implementation

Use a single regex over the raw CSS text — no full parser needed:

```ts
const CLASS_RE = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)(?=[^{]*\{)/g
```

Strip the leading `.` and collect into a `Set<string>`, then return `Array.from(set)`.

**Edge cases to handle:**

- `.root` inside a `:not(.root)` or `[class~="root"]` — still valid, the regex picks them up correctly.
- Vendor-prefixed identifiers (`.-webkit-foo`) — accepted; Base UI never uses them as class names so they produce no matches downstream.
- Multi-selector rules (`.root, .popup`) — both are captured independently.
- Nested SCSS (`&-root`) — the `&` expands to a non-class character, so the regex skips it cleanly; no action needed.

---

## Step 2 — AST Analyzer (`ast-analyzer.ts`)

### Public API

```ts
export type SelectorIndex = Map<string, string[]>
// key:   CSS class name, e.g. "root"
// value: Base UI component names, e.g. ["Popover.Root", "Dialog.Root"]

export function buildSelectorIndex(
  cssSelectors: string[],
  bridgeFileContents: string[],
): SelectorIndex
```

`buildSelectorIndex` is the single entry point. It calls the internal helpers below and merges results across all bridge files.

---

### Internal helpers (all pure, all exported for testing)

#### 2a. `extractAliasMap`

```ts
export function extractAliasMap(
  ast: import('@babel/types').File,
): Map<string, string>
```

Walk the top-level `ImportDeclaration` nodes only. For each specifier in an import from `'@base-ui/react'`:

| Specifier kind  | Example source                     | Map entry                 |
| :-------------- | :--------------------------------- | :------------------------ |
| Named, no alias | `import { Popover } from '…'`      | `"Popover"` → `"Popover"` |
| Named, aliased  | `import { Popover as P } from '…'` | `"P"` → `"Popover"`       |
| Namespace       | `import * as BaseUI from '…'`      | `"BaseUI"` → `""`         |

For namespace imports, store the local name mapped to the empty string. Sub-part lookup is handled in step 2b.

Return the map. If no `@base-ui/react` import exists, return an empty map.

---

#### 2b. `resolveJsxName`

```ts
export function resolveJsxName(
  openingElement: import('@babel/types').JSXOpeningElement,
  aliasMap: Map<string, string>,
): string | null
```

Given a `JSXOpeningElement`, determine the canonical Base UI component name:

- `JSXIdentifier` (`<Popover>`) — look up the name in `aliasMap`; if found, return the mapped value.
- `JSXMemberExpression` (`<P.Root>` or `<Popover.Root>`) — look up the object part in `aliasMap`; if found, return `"${aliasMap.get(object)}.${property}"` (using the **original** exported name as the prefix, not the alias).
  - For namespace imports (`BaseUI` → `""`): return `"${property}"` only (no dot prefix) since the object holds the full namespace, not a component name.

Return `null` if neither part is in the alias map.

---

#### 2c. `classNameContainsSelector`

```ts
export function classNameContainsSelector(
  rawClassNameText: string,
  selector: string,
): boolean
```

Check whether `selector` appears as a distinct token inside the raw source text of a `className` attribute value. "Distinct" means preceded and followed by a non-alphanumeric, non-hyphen, non-underscore character (i.e., `[^a-zA-Z0-9_-]` word boundary, or start/end of string).

```ts
const boundary = '[^a-zA-Z0-9_-]'
const re = new RegExp(
  `(?<=${boundary}|^)${escapeRegex(selector)}(?=${boundary}|$)`,
)
return re.test(rawClassNameText)
```

This single check covers all real-world className patterns without special-casing them (see the table in the phase-6 overview doc).

---

### `buildSelectorIndex` algorithm

```
for each bridgeFileContent:
  1. parse with @babel/parser (plugins: ['typescript', 'jsx'])
     – on parse error: skip the file silently
  2. extractAliasMap(ast)
     – if map is empty: skip the file (no Base UI imports)
  3. traverse all JSXOpeningElement nodes in the AST:
     a. resolveJsxName(node, aliasMap) → componentName or null
        – if null: skip node
     b. find the `className` JSXAttribute on this node
        – if absent: skip node
     c. get the raw source text of the attribute value using
        ast.program.loc / node positions (or the babel `value` field's
        raw string for StringLiteral; for JSXExpressionContainer stringify
        the source slice using the content string + node.start/end)
     d. for each selector in cssSelectors:
        – classNameContainsSelector(rawText, selector)?
          → index.get(selector).push(componentName)  (de-duplicate)
```

For raw source extraction of `JSXExpressionContainer` values: slice
`bridgeFileContent.slice(node.value.start, node.value.end)` using the
positions that Babel records. For `StringLiteral`, use `node.value.value`
(already the string content).

De-duplicate component names per selector using a `Set` per key, then
convert to arrays in the final map.

---

## Traversal helper

Do not import `@babel/traverse` (large runtime dep). Instead, write a
minimal recursive walk:

```ts
function walk(
  node: object | null | undefined,
  visit: (n: object) => void,
): void {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const val of Object.values(node)) {
    if (Array.isArray(val)) val.forEach((v) => walk(v, visit))
    else walk(val, visit)
  }
}
```

---

## Tests (`css-extractor.test.ts`)

| Case                    | Input                       | Expected            |
| :---------------------- | :-------------------------- | :------------------ |
| Single class            | `.root { color: red; }`     | `["root"]`          |
| Multi-selector          | `.root, .popup { }`         | `["root", "popup"]` |
| De-duplication          | `.root { } .root:hover { }` | `["root"]`          |
| Skips element selectors | `div { } .root { }`         | `["root"]`          |
| Hyphenated class        | `.popup-root { }`           | `["popup-root"]`    |
| No classes              | `div, span { }`             | `[]`                |

---

## Tests (`ast-analyzer.test.ts`)

No mocking needed — all helpers are pure functions over strings / AST objects.

### `extractAliasMap`

Parse a small snippet, call `extractAliasMap`, assert the map contents:

| Scenario            | Source                                             | Expected map                             |
| :------------------ | :------------------------------------------------- | :--------------------------------------- |
| Named, no alias     | `import { Popover } from '@base-ui/react'`         | `{ Popover → Popover }`                  |
| Named, aliased      | `import { Popover as P } from '@base-ui/react'`    | `{ P → Popover }`                        |
| Multiple specifiers | `import { Popover, Dialog } from '@base-ui/react'` | `{ Popover → Popover, Dialog → Dialog }` |
| Namespace import    | `import * as BaseUI from '@base-ui/react'`         | `{ BaseUI → "" }`                        |
| Non-base-ui import  | `import { useState } from 'react'`                 | `{}`                                     |

### `resolveJsxName`

Parse JSX snippets, walk to the first `JSXOpeningElement`, call `resolveJsxName`:

| Scenario           | JSX              | aliasMap                | Expected         |
| :----------------- | :--------------- | :---------------------- | :--------------- |
| Known identifier   | `<Popover>`      | `{ Popover → Popover }` | `"Popover"`      |
| Aliased identifier | `<P>`            | `{ P → Popover }`       | `"Popover"`      |
| Member expression  | `<Popover.Root>` | `{ Popover → Popover }` | `"Popover.Root"` |
| Aliased member     | `<P.Root>`       | `{ P → Popover }`       | `"Popover.Root"` |
| Unknown identifier | `<div>`          | `{ Popover → Popover }` | `null`           |

### `classNameContainsSelector`

| Scenario             | rawText                        | selector | Expected |
| :------------------- | :----------------------------- | :------- | :------- |
| Exact string literal | `"root"`                       | `"root"` | `true`   |
| CSS module           | `{styles.root}`                | `"root"` | `true`   |
| clsx call            | `{clsx(styles.root, 'extra')}` | `"root"` | `true`   |
| Substring, no match  | `"popup-root"`                 | `"root"` | `false`  |
| Template literal     | ``{`btn-root`}``               | `"root"` | `false`  |
| Template literal     | ``{`root`}``                   | `"root"` | `true`   |

### `buildSelectorIndex` (integration)

Construct a minimal bridge file string and a CSS selector list, call
`buildSelectorIndex`, assert the resulting map:

```ts
const css = ['root', 'popup']
const bridge = `
  import { Popover } from '@base-ui/react'
  function Foo() {
    return <Popover.Root className={styles.root} />
  }
`
const index = buildSelectorIndex(css, [bridge])
expect(index.get('root')).toEqual(['Popover.Root'])
expect(index.get('popup')).toBeUndefined() // or empty
```

Cover: aliased imports, multiple bridge files, parse error in one file
(should skip that file and continue), className attribute absent (should
not add to index).

---

## Acceptance criteria

- `extractClassSelectors` passes all table cases.
- `extractAliasMap`, `resolveJsxName`, `classNameContainsSelector` each pass their table cases.
- `buildSelectorIndex` integration cases pass.
- A parse error in one bridge file does not throw — it is skipped silently.
- No `vscode.*` import anywhere in the new files.
- `pnpm typecheck && pnpm format && pnpm test` all pass.
