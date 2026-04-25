# Phase 6.6 — Worker Thread (Non-Blocking Parse)

Offload the CPU-bound Babel AST parsing and walking to a Node.js worker thread so the VS Code extension host UI thread is never blocked during component detection.

All `vscode.*` calls (file search, file reads) remain on the host thread. Only the pure `buildSelectorIndex` computation moves to the worker.

---

## New files

```
src/component-detection/
  parser-worker.ts     ← new  (runs inside the worker thread)
  worker-client.ts     ← new  (host-side wrapper; replaces direct buildSelectorIndex calls)
```

---

## Architecture

```
Extension host thread                    Worker thread
─────────────────────────────────────    ───────────────────────────────
IndexManager.getIndex()
  → read files (vscode.workspace.fs)
  → WorkerClient.run(selectors,
                     contents,
                     resolverNames)  ──→  buildSelectorIndex(...)
                                    ←──  serialized SelectorIndex
  ← SelectorIndex
```

---

## Worker script (`parser-worker.ts`)

```ts
import { parentPort } from 'worker_threads'
import { buildSelectorIndex } from './ast-analyzer'

parentPort!.on('message', (msg: WorkerRequest) => {
  try {
    const index = buildSelectorIndex(
      msg.cssSelectors,
      msg.bridgeFileContents,
      msg.resolverNames,
    )
    // Map is not transferable — serialize to entries
    const entries: [string, string[]][] = Array.from(index.entries())
    parentPort!.postMessage({ ok: true, entries } satisfies WorkerResponse)
  } catch (err) {
    parentPort!.postMessage({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse)
  }
})
```

### Message types

```ts
export interface WorkerRequest {
  cssSelectors: string[]
  bridgeFileContents: string[]
  resolverNames: string[]
}

export type WorkerResponse =
  | { ok: true; entries: [string, string[]][] }
  | { ok: false; error: string }
```

Define both types in `parser-worker.ts` and export them so `worker-client.ts` can import them without creating a circular dependency.

---

## Host client (`worker-client.ts`)

```ts
import { Worker } from 'worker_threads'
import type { WorkerRequest, WorkerResponse } from './parser-worker'
import type { SelectorIndex } from './ast-analyzer'

export class WorkerClient {
  private worker: Worker

  constructor(workerPath: string) {
    this.worker = new Worker(workerPath)
  }

  run(
    cssSelectors: string[],
    bridgeFileContents: string[],
    resolverNames: string[],
    signal: AbortSignal,
  ): Promise<SelectorIndex> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }

      const onAbort = () => {
        this.worker.off('message', onMessage)
        reject(new DOMException('Aborted', 'AbortError'))
      }

      const onMessage = (msg: WorkerResponse) => {
        signal.removeEventListener('abort', onAbort)
        if (msg.ok) {
          resolve(new Map(msg.entries))
        } else {
          reject(new Error(msg.error))
        }
      }

      signal.addEventListener('abort', onAbort, { once: true })
      this.worker.once('message', onMessage)

      const req: WorkerRequest = { cssSelectors, bridgeFileContents, resolverNames }
      this.worker.postMessage(req)
    })
  }

  dispose(): void {
    this.worker.terminate()
  }
}
```

The worker is **long-lived** (created once at extension activation, not per request). One request runs at a time; `IndexManager` serializes calls via the in-flight abort logic already in place from phase 6.4.

---

## Changes to `IndexManager`

Replace the direct `buildSelectorIndex(...)` call in `getIndex` with:

```ts
const index = await this.workerClient.run(
  selectors,
  contents,
  this.resolverNames,
  ac.signal,
)
```

`WorkerClient` is injected in the constructor:

```ts
constructor(resolverNames: string[], workerClient: WorkerClient)
```

---

## Build changes

esbuild must bundle `parser-worker.ts` as a **separate entry point** so it exists as a standalone file the worker thread can `require`. Update `scripts/build.mjs`:

```js
const workerResult = await esbuild.build({
  entryPoints: ['src/component-detection/parser-worker.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/parser-worker.js',
  external: ['vscode'],
})
```

Pass the worker path to `IndexManager` from `activate()`:

```ts
import * as path from 'path'

const workerPath = path.join(context.extensionPath, 'dist', 'parser-worker.js')
const workerClient = new WorkerClient(workerPath)
context.subscriptions.push(workerClient)

const indexManager = new IndexManager(resolverNames, workerClient)
```

---

## Tests

`WorkerClient` and `IndexManager` call VS Code APIs or spawn threads — test in the extension host.

Write a pure unit test for the message serialization round-trip:

```ts
// worker-client.test.ts
it('reconstructs SelectorIndex from entries', () => {
  const entries: [string, string[]][] = [['root', ['Popover.Root']]]
  const map: SelectorIndex = new Map(entries)
  expect(map.get('root')).toEqual(['Popover.Root'])
})
```

Also confirm `parser-worker.ts` compiles without type errors (covered by `pnpm typecheck`).

---

## Acceptance criteria

- Extension activates without errors; `dist/parser-worker.js` exists after `pnpm build`.
- Component detection results are identical before and after the worker refactor (same `SelectorIndex` contents).
- Aborting a pending `WorkerClient.run` call rejects with `AbortError` and does not leave the worker in a stuck state.
- `pnpm typecheck && pnpm format && pnpm test` all pass.
