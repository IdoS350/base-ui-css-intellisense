# Phase 6.4 — Index Manager (Cache, Debounce, Cancellation)

Wrap the full component-detection pipeline in a VS Code-side orchestrator that caches results, debounces re-runs on keystrokes, and respects cancellation tokens. This is the only file in the component-detection pipeline that imports `vscode.*`.

Phases 6.1–6.3 are pure functions. This phase composes them and owns all I/O.

---

## New file

```
src/component-detection/
  index-manager.ts        ← new
```

No new test file — the public class calls VS Code APIs and is validated in the extension host. The internal helpers that are pure should be extracted and exported so a future unit test can cover them.

---

## Public API

```ts
export class IndexManager {
  constructor(resolverNames: string[])

  /**
   * Returns the selector index for the CSS file at `cssUri`.
   * Uses the cache when available. On cache miss, runs the full pipeline.
   * Cancels any in-flight request for the same URI before starting.
   * On token cancellation mid-run, returns the last cached entry or an empty map.
   */
  async getIndex(
    cssUri: vscode.Uri,
    token: vscode.CancellationToken,
  ): Promise<SelectorIndex>

  /**
   * Register VS Code disposables (file-watcher invalidation).
   * Call once from `activate()`.
   */
  register(context: vscode.ExtensionContext): void

  dispose(): void
}
```

`SelectorIndex` is re-exported from `./ast-analyzer`.

---

## Internal state

```ts
private readonly cache = new Map<string, SelectorIndex>()
// key: cssUri.toString()

private readonly pendingAbort = new Map<string, AbortController>()
// one in-flight request per CSS URI

private readonly bridgeFilesByCss = new Map<string, string[]>()
// tracks which bridge file URIs contributed to each cached index
// used to invalidate the cache when a bridge file is saved
```

---

## `getIndex` algorithm

```
key = cssUri.toString()

1. Cancel any in-flight request for this key:
   pendingAbort.get(key)?.abort()
   const ac = new AbortController()
   pendingAbort.set(key, ac)

2. If cache has key and token is not cancelled:
   return cache.get(key)!

3. Run the pipeline (steps 4–8). On any AbortError or token.isCancellationRequested:
   return cache.get(key) ?? new Map()

4. findBridgeFiles(cssUri, token) → bridgeUris[]

5. For each bridgeUri, read the file:
   vscode.workspace.fs.readFile(bridgeUri) → content strings[]

6. extractClassSelectors on the active CSS file:
   const cssBytes = await vscode.workspace.fs.readFile(cssUri)
   const cssContent = Buffer.from(cssBytes).toString('utf8')
   const selectors = extractClassSelectors(cssContent)

7. buildSelectorIndex(selectors, contents, resolverNames) → index

8. cache.set(key, index)
   bridgeFilesByCss.set(key, bridgeUris.map(u => u.toString()))
   pendingAbort.delete(key)
   return index
```

Check `token.isCancellationRequested` between steps 4, 5, and 7. If true at any point, skip remaining work and return `cache.get(key) ?? new Map()`.

---

## Debounce

`getIndex` is **not** debounced internally — the callers (completion and hover providers) are responsible for debouncing. The `IndexManager` only handles in-flight cancellation (step 1 above). This keeps the class simple and testable.

The recommended pattern for callers:

```ts
// In the provider:
private debounceTimer: NodeJS.Timeout | undefined
private latestToken: vscode.CancellationTokenSource | undefined

private scheduleIndex(cssUri: vscode.Uri): void {
  clearTimeout(this.debounceTimer)
  this.latestToken?.cancel()
  this.latestToken = new vscode.CancellationTokenSource()
  this.debounceTimer = setTimeout(() => {
    this.indexManager.getIndex(cssUri, this.latestToken!.token)
  }, 150)
}
```

---

## Cache invalidation

Inside `register(context)`, set up two file watchers:

### 1. CSS file saved

```ts
const cssWatcher = vscode.workspace.onDidSaveTextDocument((doc) => {
  const key = doc.uri.toString()
  if (cache.has(key)) {
    cache.delete(key)
    bridgeFilesByCss.delete(key)
  }
})
context.subscriptions.push(cssWatcher)
```

### 2. Bridge file saved

```ts
const bridgeWatcher = vscode.workspace.onDidSaveTextDocument((doc) => {
  const savedUri = doc.uri.toString()
  for (const [cssKey, bridgeUris] of bridgeFilesByCss) {
    if (bridgeUris.includes(savedUri)) {
      cache.delete(cssKey)
      bridgeFilesByCss.delete(cssKey)
    }
  }
})
context.subscriptions.push(bridgeWatcher)
```

Both watchers are registered together; use a single `onDidSaveTextDocument` subscription that handles both cases in sequence.

---

## `dispose`

Cancel all in-flight requests and clear state:

```ts
dispose(): void {
  for (const ac of this.pendingAbort.values()) ac.abort()
  this.pendingAbort.clear()
  this.cache.clear()
  this.bridgeFilesByCss.clear()
}
```

---

## Wiring into `activate`

In `src/extension.ts`, construct and register the manager:

```ts
const resolverNames = vscode.workspace
  .getConfiguration('baseUiIntelliSense')
  .get<string[]>('customResolvers', [])

const indexManager = new IndexManager(resolverNames)
indexManager.register(context)
context.subscriptions.push(indexManager)
```

Pass `indexManager` to the providers (constructor injection). The providers do not construct or own it.

---

## Acceptance criteria

- Cache hit on second call with same URI (no second file read).
- Cache is cleared when the CSS file is saved.
- Cache is cleared when a contributing bridge file is saved.
- Cancelling the token mid-run returns a cached value (or empty map) and does not throw.
- Aborting an in-flight request for a URI when a new `getIndex` call arrives for the same URI does not leave dangling state.
- `pnpm typecheck && pnpm format && pnpm test` all pass.
