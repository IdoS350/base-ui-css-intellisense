import { Worker } from 'worker_threads'
import type { SelectorIndex } from './ast-analyzer'
import type { WorkerRequest, WorkerResponse } from './parser-worker'

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

      const req: WorkerRequest = {
        cssSelectors,
        bridgeFileContents,
        resolverNames,
      }
      this.worker.postMessage(req)
    })
  }

  dispose(): void {
    this.worker.terminate()
  }
}
