# Extension Architecture: Base UI IntelliSense

This document outlines the high-performance, two-step lookup strategy for inferring Base UI components within a VS Code extension to provide context-aware CSS variables and data attributes. The extension is designed to be generic and project-agnostic, supporting any className pattern in use.

---

## 1. Dependency Discovery (The "Link" Phase)

The goal is to identify which React files consume the CSS file currently being edited.

### Workflow:

1. **Context Identification:** Detect when the user triggers IntelliSense or hovers inside a CSS/SCSS file.
2. **Import Search:** Use `vscode.workspace.findTextInFiles` to search for the CSS file's **basename** across all `.tsx`, `.jsx`, `.ts`, and `.js` files.
   - _Search Pattern:_ `['"]` + basename (e.g. `button.css`) + `['"]`
   - Searching by basename avoids the need to resolve path aliases — the filename appears in the import string regardless of how it is prefixed.
   - Note: `vscode.commands.executeCommand('vscode.executeReferenceProvider', ...)` finds references to a _symbol at a position_ within a document, not to a file. CSS files expose no TypeScript symbols, so this command does not apply. Text search is the correct approach.
3. **Candidate Filtering:** Read each matching file and discard any that do not also contain an import from `@base-ui/react`.
   - **Result:** A refined list of "Bridge Files" that link the CSS to Base UI components.

---

## 2. Structural Inference (The "AST" Phase)

Perform deep analysis only on the "Bridge Files" identified in Phase 1. The lookup direction is **CSS-first**: extract class names from the CSS file and then locate them in the JSX.

### Workflow:

1. **CSS Class Name Extraction:** Parse the active CSS/SCSS file and collect all class selectors, stripping the leading dot (`.root` → `"root"`, `.popup-root` → `"popup-root"`). These strings are the only targets we need to find.

2. **Shallow AST Parsing:** Run `@babel/parser` on each Bridge File with TypeScript and JSX plugins enabled.

3. **Local Alias Resolution:**
   - Map Base UI imports to handle renames: `import { Popover as P } from '@base-ui/react'` → `P` = `Popover`.
   - Track component sub-parts: `P.Root` → `Popover.Root`.

4. **className Presence Check:** For each `JSXOpeningElement` in the AST, retrieve the raw source text of its `className` attribute value. For each target class name from step 1, check whether it appears in that source text as a distinct token (i.e., preceded and followed by a non-alphanumeric character — a word boundary check to prevent `.root` from matching `"another-root"`).

   This single check covers all real-world patterns without special-casing each one:

   | Pattern          | className source text             | Contains `"root"`? |
   | :--------------- | :-------------------------------- | :----------------- |
   | String literal   | `"popup-root"`                    | no (word boundary) |
   | String literal   | `"root"`                          | yes                |
   | CSS Module       | `{styles.root}`                   | yes                |
   | clsx / cn        | `{clsx(styles.root, 'extra')}`    | yes                |
   | Conditional      | `{open ? styles.root : 'closed'}` | yes                |
   | Template literal | ``{`btn-root`}``                  | yes                |

5. **Inverted Index Construction:** Build an in-memory `Map<Selector, BaseUiComponent[]>` (one-to-many, to handle the same selector appearing across multiple bridge files) for the active session.

---

## 3. Custom Resolver (Plugin Hook)

To support Factory/HOC patterns (e.g. `styleComponent(Popover.Root, styles.root)`) the extension exposes a configuration-driven resolver. Users declare the function names to watch:

```json
"baseUiIntelliSense.customResolvers": ["styleComponent", "withStyles"]
```

At parse time, any `CallExpression` whose callee matches a configured name is analyzed heuristically:

- Any argument that resolves to a known Base UI component reference (via the alias map) is treated as the **component**.
- Any argument whose raw source text contains a target class name (same word-boundary check as Phase 2) is treated as the **selector**.

No argument index configuration is required.

---

## 4. Data Integration & Suggestions

Once the component identity is inferred, the extension merges the local discovery with pre-indexed metadata.

### Workflow:

1. **JSON Lookup:** Query the build-time JSON metadata (generated from the Base UI repository) using the inferred component name.
2. **Provider Response:**
   - **CSS Variables:** Suggest component-specific vars (e.g., `--anchor-width`).
   - **Data Attributes:** Suggest state-based attributes (e.g., `[data-open]`).

---

## 5. Performance Optimization Summary

| Optimization              | Method                                                                                                                                                                                             |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lazy Execution**        | Only parse AST for files that explicitly import the active CSS.                                                                                                                                    |
| **CSS-first search**      | Class name extraction from the CSS file bounds the AST scan to only the names that exist in the file.                                                                                              |
| **Simple presence check** | Raw source text matching with word-boundary guards replaces a multi-strategy AST resolver, keeping the inner loop fast and allocation-free.                                                        |
| **Debouncing**            | Wait 150ms after typing before triggering the discovery phase. Hover triggers skip the debounce and use the last valid cache entry.                                                                |
| **Caching**               | Store the `Map<Selector, BaseUiComponent[]>` and invalidate when either the CSS file **or any bridge file** is saved.                                                                              |
| **Worker Threads**        | Offload Babel AST parsing to a background thread. All `vscode.*` API calls (file search, document reads) remain on the extension host thread; only the pure parse + walk step moves to the worker. |
| **CancellationToken**     | Abort pending searches if the user continues typing or moves to a different file.                                                                                                                  |
