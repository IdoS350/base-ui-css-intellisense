# Phase 6.1 — Bridge Finder (Link Phase)

Implement the dependency discovery step: given the URI of the CSS file currently being edited, return the set of JS/TS files ("bridge files") that import both that CSS file and `@base-ui/react`.

---

## New file

`src/component-detection/bridge-finder.ts`

---

## Public API

```ts
export async function findBridgeFiles(
  cssUri: vscode.Uri,
  token: vscode.CancellationToken,
): Promise<vscode.Uri[]>
```

Called by the completion and hover providers whenever the active document is a CSS/SCSS file. Returns the URIs of all bridge files, or `[]` if none are found or the token is cancelled.

---

## Implementation steps

### 1. Extract basename

```ts
const basename = path.basename(cssUri.fsPath) // e.g. "button.css"
```

### 2. Search for files importing the CSS file

Use `vscode.workspace.findTextInFiles` with a regex that matches the basename inside a quote pair:

```ts
const pattern = new vscode.RelativePattern(
  vscode.workspace.getWorkspaceFolder(cssUri) ?? '',
  '**/*.{ts,tsx,js,jsx}',
)

const results: vscode.Uri[] = []

await vscode.workspace.findTextInFiles(
  { pattern: `['"][^'"]*${escapeRegex(basename)}['"]` },
  { include: pattern, previewOptions: { matchLines: 1, charsPerLine: 200 } },
  () => {
    /* collect URIs — see step 3 */
  },
  token,
)
```

`escapeRegex` escapes any regex-special characters in the basename (e.g. a filename with `.` or `+`).

### 3. Filter to files that also import `@base-ui/react`

The `findTextInFiles` callback receives a `TextSearchMatch`. Collect unique URIs, then for each one read the document text and check for the `@base-ui/react` import. Keep only files that pass both checks.

Separate this filter into a pure helper so it is testable without VS Code:

```ts
// Pure — no vscode imports
export function importsBaseUi(fileContent: string): boolean {
  return fileContent.includes('@base-ui/react')
}
```

Use `vscode.workspace.fs.readFile` (not `openTextDocument`) to avoid touching the editor state.

### 4. Return

Return the filtered `vscode.Uri[]`. If `token.isCancellationRequested` at any point, return `[]` immediately.

---

## Debounce / caching (stub for now)

Phase 6.1 does **not** implement caching or debouncing — those are wired up in a later integration phase. This module is a pure async function: call it, await the result, use it. The caller is responsible for debouncing.

---

## File structure

```
src/
  component-detection/
    bridge-finder.ts       ← new
    bridge-finder.test.ts  ← new
```

---

## Tests (`bridge-finder.test.ts`)

Test the pure helper `importsBaseUi` directly (no mocking needed):

| Case                 | Input                                      | Expected                                                                  |
| :------------------- | :----------------------------------------- | :------------------------------------------------------------------------ |
| Has named import     | `import { Popover } from '@base-ui/react'` | `true`                                                                    |
| Has namespace import | `import * as BaseUI from '@base-ui/react'` | `true`                                                                    |
| Not present          | `import React from 'react'`                | `false`                                                                   |
| Commented out        | `// import { X } from '@base-ui/react'`    | `true` (acceptable false-positive — cost is low, avoids regex complexity) |

The `findBridgeFiles` function itself calls VS Code APIs and is tested via integration/manual testing in the extension host, not in the unit test suite.

---

## Acceptance criteria

- `importsBaseUi` passes all table cases above.
- `findBridgeFiles` is called with a real CSS URI in the dev extension host and correctly returns only files that import both the CSS basename and `@base-ui/react`.
- Passing a cancelled token returns `[]` without throwing.
- `pnpm typecheck && pnpm format && pnpm test` all pass.
