import * as vscode from 'vscode'
import { SelectorIndex } from './ast-analyzer'
import { findBridgeFiles } from './bridge-finder'
import { extractClassSelectors } from './css-extractor'
import { WorkerClient } from './worker-client'

export class IndexManager {
  private readonly cache = new Map<string, SelectorIndex>()
  private readonly pendingAbort = new Map<string, AbortController>()
  private readonly bridgeFilesByCss = new Map<string, string[]>()

  constructor(
    private readonly resolverNames: string[],
    private readonly workerClient: WorkerClient,
    private readonly packageName: string,
    private readonly excludePatterns: string[],
  ) {}

  async getIndex(
    cssUri: vscode.Uri,
    token: vscode.CancellationToken,
  ): Promise<SelectorIndex> {
    const key = cssUri.toString()

    this.pendingAbort.get(key)?.abort()
    const ac = new AbortController()
    this.pendingAbort.set(key, ac)

    if (this.cache.has(key) && !token.isCancellationRequested) {
      return this.cache.get(key)!
    }

    try {
      const bridgeUris = await findBridgeFiles(
        cssUri,
        token,
        this.packageName,
        this.excludePatterns,
      )
      if (token.isCancellationRequested || ac.signal.aborted) {
        return this.cache.get(key) ?? new Map()
      }

      const contents: string[] = []
      for (const uri of bridgeUris) {
        if (token.isCancellationRequested || ac.signal.aborted) {
          return this.cache.get(key) ?? new Map()
        }
        const bytes = await vscode.workspace.fs.readFile(uri)
        contents.push(Buffer.from(bytes).toString('utf8'))
      }

      if (token.isCancellationRequested || ac.signal.aborted) {
        return this.cache.get(key) ?? new Map()
      }

      const cssBytes = await vscode.workspace.fs.readFile(cssUri)
      const cssContent = Buffer.from(cssBytes).toString('utf8')
      const selectors = extractClassSelectors(cssContent)

      if (token.isCancellationRequested || ac.signal.aborted) {
        return this.cache.get(key) ?? new Map()
      }

      const index = await this.workerClient.run(
        selectors,
        contents,
        this.resolverNames,
        ac.signal,
      )

      this.cache.set(key, index)
      this.bridgeFilesByCss.set(
        key,
        bridgeUris.map((u) => u.toString()),
      )
      this.pendingAbort.delete(key)
      return index
    } catch (err) {
      if (
        (err instanceof Error && err.name === 'AbortError') ||
        token.isCancellationRequested
      ) {
        return this.cache.get(key) ?? new Map()
      }
      throw err
    }
  }

  register(context: vscode.ExtensionContext): void {
    const watcher = vscode.workspace.onDidSaveTextDocument((doc) => {
      const savedUri = doc.uri.toString()

      if (this.cache.has(savedUri)) {
        this.cache.delete(savedUri)
        this.bridgeFilesByCss.delete(savedUri)
      }

      for (const [cssKey, bridgeUris] of this.bridgeFilesByCss) {
        if (bridgeUris.includes(savedUri)) {
          this.cache.delete(cssKey)
          this.bridgeFilesByCss.delete(cssKey)
        }
      }
    })
    context.subscriptions.push(watcher)
  }

  dispose(): void {
    for (const ac of this.pendingAbort.values()) ac.abort()
    this.pendingAbort.clear()
    this.cache.clear()
    this.bridgeFilesByCss.clear()
  }
}
