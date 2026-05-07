# Component Detection Pipeline

When the cursor is inside a CSS selector like `.root { [data-` the extension needs to know which Base UI component corresponds to the `.root` class, so it can filter completions to only that component's data attributes. This is done at runtime by analyzing the project's JS/TS files.

The pipeline runs lazily (on first completion/hover request for a given CSS file) and caches results until the CSS file or a relevant JS/TS file is saved.

---

## Overview

```
CSS file being edited
    │
    ▼
Bridge Finder
    Find all .ts/.tsx files that import both this CSS file and @base-ui/react.
    Result: bridge file URIs
    │
    ▼
CSS Extractor
    Parse the CSS file to extract all class names (.root, .popup, …).
    Result: string[]
    │
    ▼
AST Analyzer  (runs in worker thread)
    For each bridge file:
      - Parse with Babel (TypeScript + JSX plugins)
      - Build alias map: local import name → canonical Base UI name
      - Walk JSX elements; for each one check if className contains a target selector
      - Build inverted index: className → [ComponentName, …]
    Result: SelectorIndex  (Map<string, string[]>)
    │
    ▼
Custom Resolver  (part of worker, optional)
    Also walk CallExpression nodes for user-configured HOC/factory function names.
    Merges pairs into the same SelectorIndex.
    │
    ▼
Index Manager
    Orchestrates the above, manages the cache, and handles cancellation.
    Exposes: getIndex(cssUri, token): Promise<SelectorIndex>
    │
    ▼
Provider Integration
    Providers call getIndex, then filter completions/hovers by the detected scope.
    │
    ▼
Worker Thread
    AST parsing (Babel) runs in a Node.js worker thread.
    All VS Code API calls stay on the extension host thread.
```

---

## Bridge Finder (`src/component-detection/bridge-finder.ts`)

**Goal:** given a CSS file URI, return the JS/TS files that are "bridges" — they import this CSS file and also import from `@base-ui/react`.

**Algorithm:**

1. Extract the CSS file's basename (e.g. `button.css`).
2. Use `vscode.workspace.findFiles` to enumerate all `.ts`, `.tsx`, `.js`, `.jsx` files in the workspace (excluding `node_modules`, `dist`, `out`, `releases`).
3. For each candidate, read the file content and test two conditions:
   - Contains the CSS basename in a quote pair: `/['"][^'"]*button\.css['"]/`
   - Contains `@base-ui/react` anywhere in the file.
4. Return the URIs that pass both checks.

The basename search intentionally avoids resolving path aliases — the literal filename appears in the import string regardless of how the path prefix is configured.

**Public API:**

```typescript
export async function findBridgeFiles(
  cssUri: vscode.Uri,
  token: vscode.CancellationToken,
): Promise<vscode.Uri[]>

// Pure helper, used in unit tests:
export function importsBaseUi(fileContent: string): boolean
```

---

## CSS Extractor (`src/component-detection/css-extractor.ts`)

Extracts all class selectors from the CSS file content using a single regex scan.

```typescript
export function extractClassSelectors(cssContent: string): string[]
```

The regex `/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)(?=[^{]*\{)/g` matches `.className` followed (without an intervening `{`) by a `{`, which avoids matching class selectors in comments or string values. The leading `.` is stripped; the result is unique names only.

Example: for `.root { }` and `.popup-root { }` this returns `["root", "popup-root"]`.

---

## AST Analyzer (`src/component-detection/ast-analyzer.ts`)

Builds the `SelectorIndex` from bridge file contents. This is the CPU-heavy step that runs in the worker thread.

```typescript
export type SelectorIndex = Map<string, string[]>

export function buildSelectorIndex(
  cssSelectors: string[],
  bridgeFileContents: string[],
  resolverNames?: string[],
): SelectorIndex
```

**Per-file algorithm:**

1. Parse the file with `@babel/parser` (plugins: `typescript`, `jsx`, `sourceType: 'module'`). If parsing fails, skip the file silently.
2. Build the **alias map** (`extractAliasMap`): walk `ImportDeclaration` nodes for `@base-ui/react` and record `localName → canonicalName`. Handles:
   - Named imports: `import { Popover } from '@base-ui/react'` → `Popover → "Popover"`
   - Renamed imports: `import { Popover as P } from '@base-ui/react'` → `P → "Popover"`
   - Namespace imports: `import * as BaseUI from '@base-ui/react'` → `BaseUI → ""`
3. Skip the file if the alias map is empty (it uses no Base UI components).
4. Walk all nodes via a generic recursive `walk()` function.
5. For each `JSXOpeningElement`:
   - Resolve the component name via `resolveJsxName()`:
     - `<Popover.Root>` → looks up `Popover` in alias map → `"Popover.Root"`
     - `<P.Root>` (where P aliases Popover) → `"Popover.Root"`
     - `<BaseUI.Root>` (namespace import) → `"Root"`
   - Find the `className` attribute.
   - Get the raw source text of the className value:
     - `StringLiteral`: use `.value` directly.
     - `JSXExpressionContainer`: slice the source bytes from `val.start` to `val.end` — this covers `{styles.root}`, `{clsx(styles.root)}`, template literals, etc.
   - For each CSS selector from the CSS extractor, run `classNameContainsSelector()`.
6. If a match is found, record `selector → componentName` in the index.

**Word-boundary matching (`classNameContainsSelector`):**

```typescript
function classNameContainsSelector(rawText: string, selector: string): boolean {
  const boundary = '[^a-zA-Z0-9_-]'
  const re = new RegExp(
    `(?<=${boundary}|^)${escapeRegex(selector)}(?=${boundary}|$)`,
  )
  return re.test(rawText)
}
```

This prevents `.root` from matching inside `"another-root"` while still matching `{styles.root}`, `"root"`, `{clsx(styles.root, 'extra')}`, etc.

---

## Custom Resolver (`src/component-detection/custom-resolver.ts`)

Handles HOC and factory patterns like `styleComponent(Popover.Root, styles.root)` that do not use a JSX `className` attribute.

Activated when the user sets:

```json
"baseUiIntelliSense.customResolvers": ["styleComponent", "withStyles"]
```

**Algorithm (`extractCallMappings`):**

Walk all `CallExpression` nodes. For each one whose callee name matches a configured resolver:

1. Iterate arguments (skipping spread elements).
2. Try to resolve each argument as a **component**: check if it is an `Identifier` or `MemberExpression` that appears in the alias map.
3. Try to resolve each argument as a **selector**: check if its raw source text contains a CSS class name (same word-boundary check as the AST analyzer).
4. If both a component and a selector are found, record the pair.

No argument-index configuration is needed — the heuristic finds whichever argument satisfies each role first.

---

## Index Manager (`src/component-detection/index-manager.ts`)

Orchestrates the pipeline and manages caching. The providers call only this class.

```typescript
export class IndexManager {
  async getIndex(
    cssUri: vscode.Uri,
    token: vscode.CancellationToken,
  ): Promise<SelectorIndex>
  register(context: vscode.ExtensionContext): void
  dispose(): void
}
```

**Cache:**

- Key: `cssUri.toString()` (the full URI string).
- Value: `SelectorIndex`.
- On cache hit: returned immediately.
- Invalidation:
  - If the saved file is a CSS file that is cached → evict it.
  - If the saved file is a bridge file that was used to build a cached index → evict that CSS file's index.

**Cancellation:**

- `IndexManager` holds a `Map<cssKey, AbortController>`.
- When `getIndex` is called for a URI that already has a pending request, it aborts the previous `AbortController` before starting a new one.
- The `AbortSignal` is threaded through to `WorkerClient.run()`.

**Sequence for a cache miss:**

```
getIndex(cssUri, token)
  1. abort any in-flight request for this URI
  2. findBridgeFiles(cssUri, token)      ← VS Code API, extension host thread
  3. read each bridge file               ← VS Code API, extension host thread
  4. read CSS file                       ← VS Code API, extension host thread
  5. extractClassSelectors(cssContent)   ← synchronous, extension host thread
  6. workerClient.run(...)               ← offloaded to worker thread
  7. cache result + record bridge file URIs
  8. return SelectorIndex
```

---

## Provider Integration

The providers (`src/providers/completion.ts` and `src/providers/hover.ts`) call `indexManager.getIndex()` and use the result to filter suggestions.

**In `BaseUiCompletionProvider.provideCompletionItems`:**

```typescript
let scopeComponents: string[] = []
if (ctx.kind !== 'none' && ctx.selectorScope !== null) {
  const index = await this.indexManager.getIndex(document.uri, token)
  scopeComponents = index.get(ctx.selectorScope) ?? []
}

// Then filter:
.filter(entry =>
  scopeComponents.length === 0 ||
  entry.components.some(c => scopeComponents.includes(c))
)
```

If `scopeComponents` is empty (no component detected for this selector), the filter is bypassed and all suggestions are returned.

---

## Worker Thread (`src/component-detection/parser-worker.ts`, `worker-client.ts`)

Babel parsing is CPU-intensive. Running it on the extension host thread would block UI responsiveness. The worker thread handles all parsing; the extension host thread retains all VS Code API calls (file search, file reads).

**Message protocol:**

```typescript
// Request (host → worker):
interface WorkerRequest {
  cssSelectors: string[]
  bridgeFileContents: string[]
  resolverNames: string[]
}

// Response (worker → host):
type WorkerResponse =
  | { ok: true; entries: [string, string[]][] } // Map serialized as entries
  | { ok: false; error: string }
```

`SelectorIndex` is a `Map` which is not structured-cloneable, so it is serialized as `Array<[key, value]>` and reconstructed on the host side via `new Map(msg.entries)`.

**WorkerClient lifecycle:**

- Created once at extension activation.
- The worker process is long-lived (not spawned per request).
- Requests are sent one at a time; the `AbortSignal` causes the host-side promise to reject early, but does not terminate the worker mid-parse (the worker finishes its current task and the result is discarded).
- `WorkerClient.dispose()` calls `worker.terminate()`, which is registered in `context.subscriptions`.

---

## Adding support for a new import pattern

If Base UI adds a new import path (e.g. `@base-ui/react/unstable`) the only change needed is in `bridge-finder.ts` — add the new string to the `importsBaseUi` check — and `ast-analyzer.ts` — add the new source value to the `ImportDeclaration` filter in `extractAliasMap`.
