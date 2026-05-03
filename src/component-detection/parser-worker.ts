import { parentPort } from 'worker_threads'
import { buildSelectorIndex } from './ast-analyzer'

export interface WorkerRequest {
  cssSelectors: string[]
  bridgeFileContents: string[]
  resolverNames: string[]
}

export type WorkerResponse =
  | { ok: true; entries: [string, string[]][] }
  | { ok: false; error: string }

parentPort!.on('message', (msg: WorkerRequest) => {
  try {
    const index = buildSelectorIndex(
      msg.cssSelectors,
      msg.bridgeFileContents,
      msg.resolverNames,
    )
    const entries: [string, string[]][] = Array.from(index.entries())
    parentPort!.postMessage({ ok: true, entries } satisfies WorkerResponse)
  } catch (err) {
    parentPort!.postMessage({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse)
  }
})
