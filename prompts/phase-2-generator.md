# Phase 2 — Generator Script (Revised)

> **Goal:** Build `scripts/generate.ts` — a script that parses Base UI's TypeScript enum source files and writes `data/base-ui-attributes.json`, replacing the Phase 1 stub with real data.

---

## Confirmed source shapes

### `*DataAttributes.ts` — confirmed from live `master`

```ts
// packages/react/src/combobox/popup/ComboboxPopupDataAttributes.ts
import { CommonPopupDataAttributes } from '../../utils/popupStateMapping'

export enum ComboboxPopupDataAttributes {
  /**
   * Present when the popup is open.
   */
  open = CommonPopupDataAttributes.open, // reference to shared enum

  /**
   * Indicates which side the popup is positioned relative to the trigger.
   * @type {'top' | 'bottom' | 'left' | 'right' | 'inline-end' | 'inline-start'}
   */
  side = CommonPopupDataAttributes.side, // reference with @type union

  /**
   * Present when the items list is empty.
   */
  empty = 'data-empty', // direct string literal
}
```

Key facts:

- Always a single exported `enum`.
- Each member has a JSDoc `/** ... */` comment — this is the description.
- Values are either **direct string literals** (`'data-empty'`) or **references** to shared enums (`CommonPopupDataAttributes.open`).
- Enum values with a finite set of options carry a `@type {'a' | 'b' | 'c'}` JSDoc tag — this is the source for `values[]`.

### `*CssVars.ts` — shape inferred from the confirmed JSON output

The old JSON had:

```json
"cssVariables": {
  "--nested-dialogs": {
    "description": "Indicates how many dialogs are nested within.",
    "type": "number"
  }
}
```

The corresponding `.ts` file almost certainly follows the identical enum pattern:

```ts
export enum DialogPopupCssVars {
  /**
   * Indicates how many dialogs are nested within.
   * @type {number}
   */
  nestedDialogs = '--nested-dialogs',
}
```

**First task for Claude Code:** before writing any parsing logic, `cat` one `*CssVars.ts` file to confirm this matches. If the shape differs, adjust accordingly.

### Shared constants — the reference resolution problem

Many `DataAttributes` enum members don't contain their own string literal — they delegate to shared enums:

```ts
// packages/react/src/utils/popupStateMapping.ts (name may vary)
export enum CommonPopupDataAttributes {
  open = 'data-open',
  closed = 'data-closed',
  side = 'data-side',
  // ...
}
```

The generator must **resolve these references** to get the actual `"data-open"` string. This means parsing the shared utility files first.

**First task for Claude Code:** run this from inside the cloned repo to find the shared files:

```bash
grep -rl "CommonPopupDataAttributes" packages/react/src/utils/
grep -rl "export enum Common" packages/react/src/
```

There are likely 2–3 such shared files. Identify all of them before writing the generator.

---

## Setup

### Dependencies

```bash
pnpm add -D typescript fast-glob
```

- `typescript` — for the TS compiler API. Already installed as a dev dep from Phase 1, but confirm it's present.
- `fast-glob` — for file discovery.
- No additional runtime deps needed.

### npm script (already exists from Phase 1)

```json
"generate": "tsx scripts/generate.ts"
```

Usage:

```bash
pnpm generate ../base-ui
# or
pnpm generate /absolute/path/to/base-ui
```

---

## Implementation: `scripts/generate.ts`

### Pipeline overview

```
main()
  ├── 1. parseArgs()
  ├── 2. validateRepo()
  ├── 3. readVersion()
  ├── 4. parseSharedEnums()    → Map<"EnumName.member", "data-actual-value">
  ├── 5. parseDataAttrFiles()  → RawAttribute[]
  ├── 6. parseCssVarFiles()    → RawCssVar[]
  ├── 7. merge()               → deduplicated, components merged
  ├── 8. transform()           → BaseUiData
  └── 9. write() + summary()
```

---

### Step 1 — `parseArgs()`

```ts
interface Args {
  repoPath: string // resolved to absolute
  outputPath: string // default: "./data/base-ui-attributes.json"
}
```

- `process.argv[2]` is the repo path. Exit with usage message if missing.
- Resolve to absolute with `path.resolve()`.

---

### Step 2 — `validateRepo()`

Check that both of these exist, exit with a clear error if not:

- `{repoPath}/packages/react/src`
- `{repoPath}/package.json`

---

### Step 3 — `readVersion()`

```ts
// Try the package-level package.json first
const pkgPath = path.join(repoPath, 'packages/react/package.json')
const fallback = path.join(repoPath, 'package.json')
const pkg = JSON.parse(
  fs.readFileSync(fs.existsSync(pkgPath) ? pkgPath : fallback, 'utf-8'),
)
return pkg.version as string
```

---

### Step 4 — `parseSharedEnums()`

This is the prerequisite for Step 5. It builds a lookup map so that when the generator sees `CommonPopupDataAttributes.open` it can resolve it to `"data-open"`.

```ts
type SharedValueMap = Map<string, string>
// key:   "CommonPopupDataAttributes.open"
// value: "data-open"
```

Implementation:

1. Glob for all files in `packages/react/src/utils/` that contain `export enum`.
2. Also check `packages/react/src/` root level (some shared enums may live there).
3. For each file found, parse with the TS compiler API (see parsing section below).
4. For each enum member with a **string literal** value, add `"EnumName.memberName" → "the-value"` to the map.
5. Ignore members that are themselves references — shared enums should only contain direct string literals.

Log a warning for any shared enum member that can't be resolved to a string literal, as it will block resolution downstream.

---

### Step 5 — `parseDataAttrFiles()`

```ts
async function parseDataAttrFiles(
  repoPath: string,
  sharedValues: SharedValueMap,
): Promise<RawAttribute[]>
```

1. Glob: `packages/react/src/**/*DataAttributes.ts` (exclude `node_modules`, `__tests__`).
2. For each file, call `parseEnumFile(filePath, sharedValues, 'attribute')`.
3. Collect and return all results.

---

### Step 6 — `parseCssVarFiles()`

Same structure as Step 5, but glob is `packages/react/src/**/*CssVars.ts`.

```ts
async function parseCssVarFiles(
  repoPath: string,
  sharedValues: SharedValueMap,
): Promise<RawCssVar[]>
```

---

### Core: `parseEnumFile()`

This is the heart of the generator. It uses the TypeScript compiler API to extract structured data from a single enum file.

```ts
import ts from 'typescript'

interface ParsedMember {
  value: string // e.g. "data-open" or "--nested-dialogs"
  description?: string // from JSDoc
  rawType?: string // from @type tag, e.g. "'top' | 'bottom' | 'left' | 'right'"
  component: string // derived from filename
  sourceFile: string // relative path for GitHub links
}

function parseEnumFile(
  filePath: string,
  repoPath: string,
  sharedValues: SharedValueMap,
): ParsedMember[] {
  const source = fs.readFileSync(filePath, 'utf-8')
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  )

  const component = deriveComponentName(filePath) // e.g. "ComboboxPopup"
  const relativeSourceFile = path
    .relative(repoPath, filePath)
    .replace(/\\/g, '/') // normalize Windows paths

  const results: ParsedMember[] = []

  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isEnumDeclaration(node)) return

    for (const member of node.members) {
      // 1. Resolve the actual string value
      const value = resolveEnumMemberValue(member, node, sharedValues)
      if (!value) {
        console.warn(
          `  ⚠ Could not resolve value for member in ${path.basename(filePath)}`,
        )
        continue
      }

      // 2. Extract JSDoc
      const fullText = member.getFullText(sourceFile)
      const description = extractJsDocDescription(fullText)
      const rawType = extractJsDocType(fullText)

      results.push({
        value,
        description,
        rawType,
        component,
        sourceFile: relativeSourceFile,
      })
    }
  })

  return results
}
```

#### `resolveEnumMemberValue()`

```ts
function resolveEnumMemberValue(
  member: ts.EnumMember,
  parentEnum: ts.EnumDeclaration,
  sharedValues: SharedValueMap,
): string | null {
  const init = member.initializer
  if (!init) return null

  // Case 1: Direct string literal — 'data-empty'
  if (ts.isStringLiteral(init)) {
    return init.text
  }

  // Case 2: Property access — CommonPopupDataAttributes.open
  if (ts.isPropertyAccessExpression(init)) {
    const enumName = init.expression.getText()
    const memberName = init.name.getText()
    const key = `${enumName}.${memberName}`
    return sharedValues.get(key) ?? null
  }

  return null
}
```

#### `deriveComponentName()`

Strip the suffix and the directory path:

```ts
function deriveComponentName(filePath: string): string {
  const base = path.basename(filePath)
  // "ComboboxPopupDataAttributes.ts" → "ComboboxPopup"
  // "DialogPopupCssVars.ts" → "DialogPopup"
  return base.replace('DataAttributes.ts', '').replace('CssVars.ts', '')
}
```

#### `extractJsDocDescription()`

Parse the raw text of the enum member (which includes leading comments) and extract the JSDoc body. Do **not** use `ts.getJSDocTags()` — it requires a full program, not a source file. Simple string parsing is sufficient given the consistent format:

```ts
function extractJsDocDescription(fullText: string): string | undefined {
  const match = fullText.match(/\/\*\*([\s\S]*?)\*\//)
  if (!match) return undefined

  return (
    match[1]
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, '').trim())
      .filter((line) => !line.startsWith('@')) // exclude @type tags
      .filter(Boolean)
      .join(' ')
      .trim() || undefined
  )
}
```

#### `extractJsDocType()`

```ts
function extractJsDocType(fullText: string): string | undefined {
  // Matches: @type {'top' | 'bottom' | 'left' | 'right'}
  const match = fullText.match(/@type\s+\{([^}]+)\}/)
  return match?.[1].trim()
}
```

---

### Step 7 — `merge()`

Combine attributes and CSS variables, deduplicating by `value` (the actual attribute/variable name string). When the same value appears across multiple components, merge the component names into an array.

```ts
function mergeByValue<T extends { value: string; component: string }>(
  items: T[],
): (Omit<T, 'component'> & { components: string[] })[] {
  const map = new Map<string, (typeof items)[0] & { components: string[] }>()

  for (const item of items) {
    if (map.has(item.value)) {
      map.get(item.value)!.components.push(item.component)
    } else {
      map.set(item.value, { ...item, components: [item.component] })
    }
  }

  return [...map.values()]
}
```

---

### Step 8 — `transform()`

Convert to the `BaseUiData` shape from `src/data/types.ts`.

For `DataAttribute.values`, parse the `rawType` string:

```ts
function parseTypeUnion(rawType?: string): DataAttributeValue[] {
  if (!rawType) return []

  return rawType
    .split('|')
    .map((v) => v.trim().replace(/^['"]|['"]$/g, '')) // strip surrounding quotes
    .filter(Boolean)
    .map((value) => ({ value }))
}
```

For CSS variables, `rawType` is a primitive descriptor like `number` or `<length>` — store these as-is in the `description` field or append to it. Don't try to parse them as enum values.

The `sourceFile` on each item should point to the `*DataAttributes.ts` or `*CssVars.ts` file so the hover provider can build a valid GitHub link. Format: `packages/react/src/combobox/popup/ComboboxPopupDataAttributes.ts`.

---

### Step 9 — `write()` and summary

```ts
const output: BaseUiData = { version, attributes, cssVariables }
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8')
```

Print a summary:

```
✓ Base UI v1.3.0
✓ Parsed 12 shared enum members
✓ Parsed 38 *DataAttributes.ts files
✓ Parsed 14 *CssVars.ts files
⚠  2 enum members skipped (unresolved references):
   ComboboxPopupDataAttributes.ts → SomeEnum.unknownMember
✓ 143 data attributes (after deduplication)
✓ 18 CSS variables (after deduplication)
✓ Output → data/base-ui-attributes.json
```

---

## File structure after this phase

```
scripts/
└── generate.ts              ← new
data/
└── base-ui-attributes.json  ← replaced with real data (committed to repo)
```

---

## Edge cases to handle

| Case                                                   | Handling                                          |
| ------------------------------------------------------ | ------------------------------------------------- |
| Enum member with no initializer                        | Skip with warning                                 |
| Reference to unknown shared enum                       | Skip with warning, log the key                    |
| Enum member with no JSDoc                              | `description: undefined` — acceptable             |
| `@type` tag with complex type (e.g. `InteractionType`) | Store raw string, `values` stays `[]`             |
| Windows path separators in `sourceFile`                | Normalize with `.replace(/\\/g, '/')`             |
| Multiple enums in one file                             | Process all — iterate all `EnumDeclaration` nodes |
| `*CssVars.ts` shape differs from assumption            | Adjust after the initial `cat` verification       |

---

## Manual verification checklist

After running `pnpm generate ../base-ui`:

1. `data/base-ui-attributes.json` is valid JSON (run `node -e "JSON.parse(require('fs').readFileSync('data/base-ui-attributes.json','utf-8'))"` — exits 0).
2. `version` matches the version in the cloned repo's `package.json`.
3. `attributes` is non-empty. Spot-check for `data-open`, `data-side`, `data-disabled`, `data-empty`.
4. `data-side` has a non-empty `values` array containing `"top"`, `"bottom"`, `"left"`, `"right"`.
5. `cssVariables` is non-empty. Spot-check for `--nested-dialogs`.
6. Every entry has at least one entry in `components`.
7. No entry has `value: null` or `value: undefined`.
8. Run `pnpm build` — extension still compiles cleanly.
9. Open a `.css` file in the Extension Development Host and confirm completions now show the full real attribute set, not the 2-item stub.

**All 9 checks passing = Phase 2 complete.**

---

## What this does NOT do yet

- **Phase 3:** Full `detectContext` for precise cursor position detection.
- **Phase 4:** Enumerated value completions wired into the provider.
- **Phase 5:** Hover provider.
