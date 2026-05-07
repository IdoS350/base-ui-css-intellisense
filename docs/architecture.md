# Architecture

## What the extension does

Base UI CSS IntelliSense provides autocomplete and hover documentation for:

- **Data attribute selectors** — `[data-open]`, `[data-side="top"]`, etc.
- **CSS custom properties** — `var(--anchor-width)`, `--nested-dialogs`, etc.

Completions are scoped to the CSS class selector that contains the cursor (`.root`, `.popup`), and are further filtered to only show attributes and variables that belong to Base UI components known to use that class. If no component can be inferred, all known attributes/variables are shown as a fallback.

Supported language IDs: `css`, `scss`, `less`, `tailwindcss`, `postcss` by default (configurable via `baseUiIntelliSense.languages`).

---

## Repository layout

```
base-ui-css-intellisense/
├── src/
│   ├── extension.ts                    # Activation entry point
│   ├── data/
│   │   ├── types.ts                    # Data schema types
│   │   └── loader.ts                   # Loads bundled JSON at runtime
│   ├── providers/
│   │   ├── completion.ts               # CompletionItemProvider
│   │   └── hover.ts                    # HoverProvider
│   ├── util/
│   │   ├── context.ts                  # Cursor context detection
│   │   └── hover-docs.ts               # Hover markdown helpers
│   └── component-detection/
│       ├── bridge-finder.ts            # finds bridge files
│       ├── css-extractor.ts            # extracts CSS class names
│       ├── ast-analyzer.ts             # builds SelectorIndex via AST
│       ├── custom-resolver.ts          # HOC/factory pattern support
│       ├── index-manager.ts            # caching & orchestration
│       ├── worker-client.ts            # IPC with worker thread
│       └── parser-worker.ts            # worker thread entry
├── scripts/
│   ├── build.mjs                       # esbuild configuration
│   └── generate/
│       ├── index.ts                    # Generator entry point
│       ├── types.ts                    # Generator-internal types
│       ├── repo.ts                     # Repo validation + version reading
│       ├── parse.ts                    # TypeScript compiler API parsers
│       ├── transform.ts                # Raw → BaseUiData transform
│       ├── jsdoc.ts                    # JSDoc comment extraction
│       └── *.test.ts                   # Unit tests (vitest)
├── data/
│   ├── base-ui-attributes.json         # Programmatic data (generated, committed)
│   └── base-ui.css-data.json           # VS Code custom data (generated, committed)
└── docs/                               # This directory
```

---

## Build outputs

`pnpm build` (via `scripts/build.mjs`, esbuild) produces two bundles:

| Output                  | Entry                                      | Purpose                    |
| ----------------------- | ------------------------------------------ | -------------------------- |
| `dist/extension.js`     | `src/extension.ts`                         | Main extension host bundle |
| `dist/parser-worker.js` | `src/component-detection/parser-worker.ts` | Worker thread bundle       |

The worker is a separate bundle because it runs in a Node.js worker thread and cannot share the extension host's module graph. It has no VS Code API imports.

---

## Data flow

### At activation (`src/extension.ts`)

```
1. Read config: baseUiIntelliSense.enable / customResolvers / packageName / excludePatterns / languages
   └─ if enable is false, return immediately (no providers registered)
2. Spawn WorkerClient (wraps a Node.js Worker pointing at dist/parser-worker.js)
3. Create IndexManager(resolverNames, workerClient, packageName, excludePatterns)
4. IndexManager.register(context)  ← wires up onDidSaveTextDocument listener
5. loadData(context)               ← reads data/base-ui-attributes.json from disk
6. new BaseUiCompletionProvider(data, indexManager)
   └─ builds attributeByName and cssVarByName Maps from data
7. new BaseUiHoverProvider(attributeByName, cssVarByName, indexManager)
8. Split configured languages into CSS-like vs. others (determines trigger characters)
9. Register providers for each non-empty language group
```

### On completion trigger

```
User types [ or - or " or '
  └─ provideCompletionItems(document, position, token)
       ├─ detectContext(document, position)          ← pure, synchronous
       │   ├─ detectSelectorScope(prefix)            ← which .class surrounds cursor
       │   └─ detectFromPrefix(prefix)               ← kind: attribute-name | attribute-value | css-variable | none
       │
       ├─ if selectorScope != null && kind != none:
       │   └─ indexManager.getIndex(document.uri, token)
       │       ├─ check cache (return immediately if hit)
       │       ├─ findBridgeFiles(cssUri, token, packageName, excludePatterns)  ← finds .ts/.tsx that import this CSS + packageName
       │       ├─ read bridge file contents
       │       ├─ extractClassSelectors(cssContent)  ← all .classNames from the CSS
       │       ├─ workerClient.run(selectors, contents, resolverNames, signal)
       │       │   └─ worker: buildSelectorIndex()   ← Babel parse + AST walk
       │       └─ cache result, return SelectorIndex Map<className, ComponentName[]>
       │
       ├─ scopeComponents = index.get(selectorScope) ?? []
       └─ filter suggestions by scopeComponents (or show all if empty)
```

### On save

```
onDidSaveTextDocument
  ├─ if saved file is a cached CSS file → evict that entry
  └─ if saved file is a known bridge file → evict the CSS entry that depended on it
```

---

## Key types

```typescript
// src/data/types.ts
interface BaseUiData {
  version: string
  components: Record<string, ComponentData>
}

interface ComponentData {
  attributes: DataAttribute[]
  cssVariables: CssVariable[]
  attributesSourceFile?: string // relative path in base-ui repo, for GitHub links
  cssVarsSourceFile?: string
}

interface DataAttribute {
  name: string // e.g. "data-open"
  description?: string
  values?: DataAttributeValue[] // e.g. [{value: "top"}, {value: "bottom"}]
}

interface CssVariable {
  name: string // e.g. "--anchor-width"
  description?: string
  type?: string // raw TS type string, e.g. "number"
}

// src/component-detection/ast-analyzer.ts
type SelectorIndex = Map<string, string[]>
// key:   CSS class name, e.g. "root"
// value: Base UI component names, e.g. ["Popover.Root", "Dialog.Root"]
```

---

## Configuration

All settings live under the `baseUiIntelliSense` namespace in `package.json`:

| Setting           | Type     | Default                                         | Description                                                                                                                                 |
| ----------------- | -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `enable`          | boolean  | `true`                                          | Master on/off switch. Requires a window reload.                                                                                             |
| `packageName`     | string   | `"@base-ui/react"`                              | Import identifier used to detect bridge files. Change for forks or monorepo aliases.                                                        |
| `excludePatterns` | string[] | `["**/node_modules/**", ...]`                   | Glob patterns excluded when scanning for bridge files.                                                                                      |
| `languages`       | string[] | `["css","tailwindcss","postcss","scss","less"]` | Language IDs to activate completions and hover for. Languages not in the built-in CSS-like list get `[` as an additional trigger character. |
| `customResolvers` | string[] | `[]`                                            | HOC/factory function names to scan for component + className pairs. See [component-detection.md](./component-detection.md#custom-resolver). |

---

## Testing

Unit tests live next to the code they test (`*.test.ts`). The vitest config picks up:

- `scripts/generate/*.test.ts`
- `src/util/context.test.ts`
- `src/component-detection/*.test.ts`

Run everything with `pnpm test`.

The quality gate before committing:

```bash
pnpm typecheck && pnpm format && pnpm test
```

All three must pass. The extension is not currently covered by integration tests — the component detection pipeline (which calls VS Code APIs) is exercised manually via the Extension Development Host (`F5` in VS Code).
