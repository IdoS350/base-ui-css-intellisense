# Phase 6.5 — Provider Integration (Context-Aware Filtering)

Wire the component-detection index into the completion and hover providers so that suggestions are narrowed to the Base UI components that actually use the CSS class selector at the cursor position.

---

## Overview

Currently the providers return all matching data attributes and CSS variables regardless of which component is in scope. After this phase, when the cursor is inside a CSS rule whose selector maps to specific Base UI components, only those components' data is returned.

The change is additive and graceful: if the index returns no components for a selector (new file, not yet indexed, or no bridge files found), the providers fall back to returning all results as before.

---

## Step 1 — Selector scope detection

### Extend `CompletionContext`

Add an optional field to every non-`none` variant in `src/util/context.ts`:

```ts
export type CompletionContext =
  | { kind: 'attribute-name'; prefix: string; selectorScope: string | null }
  | { kind: 'attribute-value'; attribute: string; prefix: string; selectorScope: string | null }
  | { kind: 'css-variable'; prefix: string; selectorScope: string | null }
  | { kind: 'none' }
```

`selectorScope` holds the CSS class name (without the leading dot) that encloses the cursor, or `null` if none can be inferred.

---

### Add `detectSelectorScope`

New pure helper in `src/util/context.ts`:

```ts
export function detectSelectorScope(prefix: string): string | null
```

Scan backwards through `prefix` to find the innermost CSS rule's selector:

1. Find the last unmatched `{` — everything before it is the selector text.
2. In the selector text, match the **last** class selector: `/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)(?:\s*[,>+~\s][^{]*)?$/`
3. Return the captured class name, or `null` if no match.

Examples:

| prefix (truncated to selector + `{`)      | Expected scope |
| :---------------------------------------- | :------------- |
| `.root {`                                 | `"root"`       |
| `.popup-root {`                           | `"popup-root"` |
| `.root:hover {`                           | `"root"`       |
| `.root, .popup {`                         | `"popup"`      |
| `.root .child {`                          | `"child"`      |
| `div {`                                   | `null`         |
| (no `{` found)                            | `null`         |

Update `detectFromPrefix` to call `detectSelectorScope` and attach the result to every returned context (except `none`).

---

### Tests

Add cases to `src/util/context.test.ts` for `detectSelectorScope`:

- Each row in the table above.
- Nested `{ }` blocks: cursor inside inner `{ }`, scope is the inner selector's class.

---

## Step 2 — Modify providers

### `BaseUiCompletionProvider`

Add `IndexManager` as a constructor parameter:

```ts
constructor(data: BaseUiData, indexManager: IndexManager)
```

In `provideCompletionItems`:

1. If `ctx.selectorScope` is non-null and the document URI ends in a CSS-like extension, call:
   ```ts
   const index = await indexManager.getIndex(document.uri, token)
   const components = index.get(ctx.selectorScope) ?? []
   ```
2. If `components` is non-empty, filter `attributeIndex` / `cssVarIndex` to entries whose `components` array intersects with `components`.
3. If `components` is empty (no index entry for this scope), return the full unfiltered list as before.

`provideCompletionItems` must be made `async` to await `getIndex`.

---

### `BaseUiHoverProvider`

Add `IndexManager` as a constructor parameter:

```ts
constructor(
  attributeByName: Map<string, AttributeIndex>,
  cssVarByName: Map<string, CssVarIndex>,
  indexManager: IndexManager,
)
```

In `provideHover`:

1. Compute `selectorScope` from the hover position using `detectContext` (the same utility).
2. If scope is non-null, resolve components from the index (same pattern as the completion provider).
3. Filter the hover documentation to mention only matching components; fall back to all if components is empty.

Hover should **not** trigger a debounced re-index — it always uses whatever `getIndex` returns immediately from cache (or starts a fresh lookup if the cache is cold, awaiting the result).

---

## Step 3 — Update `activate`

Pass `indexManager` through to both providers in `src/extension.ts`:

```ts
const completionProvider = new BaseUiCompletionProvider(data, indexManager)
const hoverProvider = new BaseUiHoverProvider(
  completionProvider.attributeByName,
  completionProvider.cssVarByName,
  indexManager,
)
```

---

## Acceptance criteria

- `detectSelectorScope` passes all table cases.
- When cursor is inside `.root { [data-` and `root` maps to `["Popover.Root"]` in the index, completions show only Popover attributes/vars.
- When cursor is inside `.root { [data-` and `root` maps to `[]` (no bridge files), completions show all attributes/vars unchanged.
- Hover response is filtered by the same scope logic.
- Existing `context.test.ts` cases continue to pass (no regression in `detectFromPrefix`).
- `pnpm typecheck && pnpm format && pnpm test` all pass.
