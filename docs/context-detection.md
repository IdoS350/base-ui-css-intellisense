# Context Detection

Before offering any completions, the extension needs to determine:

1. **What kind of completion** is appropriate at the cursor (attribute name, attribute value, CSS variable, or nothing).
2. **Which CSS selector scope** the cursor is in, so component detection can be filtered to the right class.

All of this logic lives in `src/util/context.ts` and is purely synchronous — no VS Code APIs, no async. It operates on plain strings and is fully unit-tested.

---

## Entry point

```typescript
export function detectContext(
  document: vscode.TextDocument,
  position: vscode.Position,
): CompletionContext
```

This is called by the completion provider on every trigger. It collects up to 50 lines of lookback (to handle multiline selectors) plus the current line up to the cursor, joins them, and delegates to `detectFromPrefix`.

```typescript
export type CompletionContext =
  | { kind: 'attribute-name'; prefix: string; selectorScope: string | null }
  | {
      kind: 'attribute-value'
      attribute: string
      prefix: string
      selectorScope: string | null
    }
  | {
      kind: 'css-variable'
      prefix: string
      selectorScope: string | null
      needsVarWrapper: boolean
    }
  | { kind: 'none' }
```

---

## Step 1 — Selector scope (`detectSelectorScope`)

Determines which CSS class selector the cursor is currently inside.

**Algorithm:**

Starting from the end of the prefix and scanning backwards, track brace depth to find the innermost `{`. The text before that `{` is the selector list. The function then:

1. Looks for a `[` in the text _after_ the innermost `{`. If one exists (and there is no `{` between the class and the `[`), the cursor may be inside an inline attribute selector on the selector line itself (e.g. `.Input[data-`). Extract the last class name before the `[`.
2. Otherwise, extract the last `.className` before the innermost `{`.

Returns `null` if no class selector is found.

**Examples:**

| CSS context                   | `selectorScope` |
| ----------------------------- | --------------- |
| `.root { color: var(--`       | `"root"`        |
| `.popup .arrow { [data-`      | `"arrow"`       |
| `.Input[data-`                | `"Input"`       |
| `@layer base { .btn { [data-` | `"btn"`         |
| `[data-` (no enclosing class) | `null`          |

---

## Step 2 — Completion kind (`detectFromPrefix`)

Checks patterns in the accumulated prefix string to determine which kind of completion to offer.

### CSS variable inside `var()`

```
var(\s*(--[\w-]*)?\s*$
```

If matched: `kind: 'css-variable'`, `needsVarWrapper: false`. The prefix already has `var(` so the completion item inserts just the variable name.

### CSS variable typed bare after `:`

```
:\s*(--[\w-]*)$
```

If matched: `kind: 'css-variable'`, `needsVarWrapper: true`. The completion item inserts `var(--variable-name)` to wrap the value correctly.

### Inside an attribute selector

If neither CSS variable pattern matched, `findLastUnclosedBracket` scans backwards for the nearest unmatched `[`. If none is found, returns `kind: 'none'`.

The text inside the bracket is then examined:

- If it contains `=`: this is an **attribute value context**. Extracts the attribute name (left of `=`) and the partial value string (right of `=`, stripping leading quote). Returns `kind: 'attribute-value'` only when the attribute starts with `data-`.
- If it does not contain `=`: this is an **attribute name context**. Only triggers if the typed text is a prefix of `data-` (or empty). Returns `kind: 'attribute-name'`.

---

## `findLastUnclosedBracket`

Scans the prefix right-to-left, tracking `[`/`]` nesting depth, and returns the index of the last `[` that has no matching `]`. Returns `-1` if none found.

This correctly handles nested brackets like `[attr][data-` (returns the index of the second `[`).

---

## Trigger characters

The extension registers different trigger characters per language group to avoid conflicts with built-in providers:

| Languages                       | Trigger characters |
| ------------------------------- | ------------------ |
| `scss`, `less`                  | `[`, `-`, `"`, `'` |
| `css`, `tailwindcss`, `postcss` | `-`, `"`, `'`      |

The `[` trigger is omitted for plain CSS because the built-in CSS language server intercepts it. For these languages the provider still activates (via `-`, `"`, `'`), and `findLastUnclosedBracket` locates the opening bracket retroactively.
