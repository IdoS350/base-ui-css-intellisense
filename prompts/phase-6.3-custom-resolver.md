# Phase 6.3 — Custom Resolver (CallExpression Hook)

Extend the AST analyzer with a config-driven handler for HOC/factory patterns such as `styleComponent(Popover.Root, styles.root)`. This phase is entirely pure — no `vscode.*` calls.

---

## New files

```
src/component-detection/
  custom-resolver.ts        ← new
  custom-resolver.test.ts   ← new
```

---

## VS Code contribution point

Add to the `contributes.configuration` section in `package.json`:

```json
{
  "title": "Base UI CSS IntelliSense",
  "properties": {
    "baseUiIntelliSense.customResolvers": {
      "type": "array",
      "items": { "type": "string" },
      "default": [],
      "description": "Function names whose call-site arguments are analyzed for Base UI component + className pairs (e.g. \"styleComponent\", \"withStyles\")."
    }
  }
}
```

---

## Public API (`custom-resolver.ts`)

```ts
export interface ResolvedPair {
  selector: string
  componentName: string
}

export function extractCallMappings(
  ast: import('@babel/types').File,
  aliasMap: Map<string, string>,
  cssSelectors: string[],
  resolverNames: string[],
  fileContent: string,
): ResolvedPair[]
```

`extractCallMappings` is the single entry point. Returns all `(selector, componentName)` pairs inferred from matching call expressions. Returns `[]` when `resolverNames` is empty.

---

## Internal helpers (all pure, all exported for testing)

### `resolveCalleeLocalName`

```ts
export function resolveCalleeLocalName(
  callee:
    | import('@babel/types').Expression
    | import('@babel/types').V8IntrinsicIdentifier,
): string | null
```

Extract the local name from a callee node:

- `Identifier` (e.g. `styleComponent`) → return `node.name`
- `MemberExpression` with `Identifier` property (e.g. `styles.styleComponent`) → return `node.property.name`
- Anything else → return `null`

---

### `resolveArgAsComponent`

```ts
export function resolveArgAsComponent(
  arg: import('@babel/types').Node,
  aliasMap: Map<string, string>,
): string | null
```

Given a call argument node, determine whether it refers to a known Base UI component:

- `Identifier` → look up `arg.name` in `aliasMap`; if found, return the mapped value.
- `MemberExpression` with both `Identifier` object and `Identifier` property → look up the object name in `aliasMap`; if found, return `"${mapped}.${property}"` (same logic as `resolveJsxName` for member expressions, including the empty-string namespace case).
- Anything else → return `null`.

---

### `resolveArgAsSelector`

```ts
export function resolveArgAsSelector(
  arg: import('@babel/types').Node,
  cssSelectors: string[],
  fileContent: string,
): string | null
```

Get the raw source text of the argument (`fileContent.slice(arg.start, arg.end)`) and test each selector against it using the same `classNameContainsSelector` word-boundary logic from `ast-analyzer.ts`. Return the first matching selector, or `null` if none match.

Import `classNameContainsSelector` from `./ast-analyzer`.

---

## `extractCallMappings` algorithm

```
if resolverNames is empty → return []

walk the AST for CallExpression nodes:
  1. resolveCalleeLocalName(node.callee) → localName or null
     – if null or not in resolverNames: skip
  2. scan node.arguments:
     – componentName = first arg for which resolveArgAsComponent returns non-null
     – selector     = first arg for which resolveArgAsSelector  returns non-null
  3. if both found: push { selector, componentName }

return collected pairs (de-duplicated by Set on `${selector}::${componentName}`)
```

Use the same minimal recursive `walk` from `ast-analyzer.ts` — do not re-implement it; import it if it is exported, otherwise copy the five-line helper locally.

---

## Integration into `buildSelectorIndex`

Add an optional `resolverNames` parameter to `buildSelectorIndex` in `ast-analyzer.ts`:

```ts
export function buildSelectorIndex(
  cssSelectors: string[],
  bridgeFileContents: string[],
  resolverNames?: string[],
): SelectorIndex
```

After the JSX walk for each bridge file, if `resolverNames?.length`, call `extractCallMappings` and merge its pairs into the same `indexSets` map (same de-duplication via `Set`).

---

## Tests (`custom-resolver.test.ts`)

No mocking needed — all helpers are pure functions over AST nodes / strings.

### `resolveCalleeLocalName`

Parse call expressions, extract callee node, assert:

| Callee source     | Expected           |
| :---------------- | :----------------- |
| `styleComponent(` | `"styleComponent"` |
| `lib.withStyles(` | `"withStyles"`     |
| `(fn)()`          | `null`             |

### `resolveArgAsComponent`

Build small alias maps and pass AST argument nodes:

| Arg source     | aliasMap                | Expected         |
| :------------- | :---------------------- | :--------------- |
| `Popover.Root` | `{ Popover → Popover }` | `"Popover.Root"` |
| `P.Root`       | `{ P → Popover }`       | `"Popover.Root"` |
| `Popover`      | `{ Popover → Popover }` | `"Popover"`      |
| `"root"`       | `{ Popover → Popover }` | `null`           |

### `resolveArgAsSelector`

| Arg source     | selectors  | Expected |
| :------------- | :--------- | :------- |
| `styles.root`  | `["root"]` | `"root"` |
| `styles.popup` | `["root"]` | `null`   |
| `"root"`       | `["root"]` | `"root"` |

### `extractCallMappings` (integration)

```ts
const src = `
  import { Popover } from '@base-ui/react'
  styleComponent(Popover.Root, styles.root)
`
const ast = parse(src, { plugins: ['typescript'], sourceType: 'module' })
const aliasMap = extractAliasMap(ast)
const pairs = extractCallMappings(
  ast,
  aliasMap,
  ['root'],
  ['styleComponent'],
  src,
)
expect(pairs).toEqual([{ selector: 'root', componentName: 'Popover.Root' }])
```

Also cover: unknown callee name → empty result; missing component arg → skipped; missing selector arg → skipped.

### `buildSelectorIndex` with `resolverNames`

```ts
const src = `
  import { Popover } from '@base-ui/react'
  styleComponent(Popover.Root, styles.root)
`
const index = buildSelectorIndex(['root'], [src], ['styleComponent'])
expect(index.get('root')).toEqual(['Popover.Root'])
```

---

## Acceptance criteria

- All table cases above pass.
- `buildSelectorIndex` with no `resolverNames` argument behaves identically to phase 6.2 (no regression).
- No `vscode.*` import anywhere in the new files.
- `pnpm typecheck && pnpm format && pnpm test` all pass.
