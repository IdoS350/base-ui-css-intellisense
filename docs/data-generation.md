# Data Generation

The extension ships one pre-generated data file:

| File                           | Purpose                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `data/base-ui-attributes.json` | Data consumed by the completion and hover providers at runtime |

This file is committed to the repository and does not need to be regenerated unless Base UI releases a new version or the data schema changes.

---

## Regenerating the data

```bash
git clone https://github.com/mui/base-ui.git ../base-ui
pnpm generate ../base-ui
```

The script writes `data/base-ui-attributes.json`. After running, verify with:

```bash
node -e "JSON.parse(require('fs').readFileSync('data/base-ui-attributes.json','utf-8'))"
```

Spot-check that `data-open`, `data-side`, and `--nested-dialogs` appear in the output, and that `data-side` has a non-empty `values` array.

---

## How the generator works (`scripts/generate/`)

The generator uses the TypeScript compiler API to parse Base UI's source files — specifically its enum files — and extract structured metadata.

### Pipeline

```
main()
  1. parseArgs()          → repoPath, outputPath
  2. validateRepo()       → checks packages/react/src and package.json exist
  3. readVersion()        → reads Base UI version string
  4. parseSharedEnums()   → Map<"EnumName.member", "data-actual-value">
  5. parseDataAttrFiles() → RawAttribute[] from *DataAttributes.ts files
  6. parseCssVarFiles()   → RawCssVar[] from *CssVars.ts files
  7. transform()          → BaseUiData (grouped by component)
  8. write()              → data/base-ui-attributes.json
```

### Source file shapes

Base UI defines its data attributes and CSS variables as TypeScript enums:

**`*DataAttributes.ts`** — one per component part:

```typescript
export enum ComboboxPopupDataAttributes {
  /**
   * Present when the popup is open.
   */
  open = CommonPopupDataAttributes.open, // reference to shared enum

  /**
   * Indicates which side the popup is positioned relative to the trigger.
   * @type {'top' | 'bottom' | 'left' | 'right' | 'inline-end' | 'inline-start'}
   */
  side = CommonPopupDataAttributes.side, // reference with @type for enum values

  /**
   * Present when the items list is empty.
   */
  empty = 'data-empty', // direct string literal
}
```

**`*CssVars.ts`** — same pattern:

```typescript
export enum DialogPopupCssVars {
  /**
   * Indicates how many dialogs are nested within.
   * @type {number}
   */
  nestedDialogs = '--nested-dialogs',
}
```

### Shared enum resolution (`scripts/generate/parse.ts`)

Many enum members do not contain their own string literal — they delegate to shared enums like `CommonPopupDataAttributes`. The generator first builds a lookup map (`SharedValueMap`) by parsing all files under `packages/react/src/utils/` that contain `export enum`. Then when processing the per-component files, it resolves `EnumName.memberName` references through that map.

The resolution covers two cases:

- **Direct string literal**: `'data-empty'` → used as-is.
- **Property access**: `CommonPopupDataAttributes.open` → looked up in `SharedValueMap` → `'data-open'`.

Members that cannot be resolved are skipped with a warning printed to stdout.

### JSDoc extraction (`scripts/generate/jsdoc.ts`)

JSDoc is extracted from the raw text of each enum member (including its leading comment) using simple string parsing — not the TypeScript compiler's `getJSDocTags()`, which requires a full type-checked program.

- **Description**: everything between `/** ... */` that does not start with `@`.
- **Type** (`@type {…}`): the content of the first `@type` tag. For data attributes this is a union like `'top' | 'bottom'`, which is split into the `values[]` array. For CSS variables it is a primitive descriptor like `number` and is stored as-is in the `type` field.

### Component name derivation

The component name is derived from the filename:

```
ComboboxPopupDataAttributes.ts  →  "ComboboxPopup"
DialogPopupCssVars.ts           →  "DialogPopup"
```

The `sourceFile` field on each entry stores the relative path within the Base UI repo (e.g. `packages/react/src/combobox/popup/ComboboxPopupDataAttributes.ts`). The hover provider uses this to construct `https://github.com/mui/base-ui/blob/master/<sourceFile>` links.

### Output schema

`data/base-ui-attributes.json` follows `BaseUiData` from `src/data/types.ts`:

```json
{
  "version": "1.4.1",
  "components": {
    "ComboboxPopup": {
      "attributes": [
        {
          "name": "data-open",
          "description": "Present when the popup is open."
        },
        {
          "name": "data-side",
          "description": "Indicates which side the popup is positioned relative to the trigger.",
          "values": [
            { "value": "top" },
            { "value": "bottom" },
            { "value": "left" },
            { "value": "right" },
            { "value": "inline-end" },
            { "value": "inline-start" }
          ]
        }
      ],
      "cssVariables": [],
      "attributesSourceFile": "packages/react/src/combobox/popup/ComboboxPopupDataAttributes.ts"
    }
  }
}
```

### Publishing data for a new Base UI version

The extension fetches data per-version at runtime from GitHub release assets, so each supported Base UI version needs a corresponding release. Users on an unsupported version fall back to the bundled data automatically.

1. Check out or pull the new version of the Base UI repo.
2. Run `pnpm generate /path/to/base-ui` — this overwrites `data/base-ui-attributes.json`.
3. Commit the updated file.
4. Push a tag matching `base-ui-v{version}` (e.g. `base-ui-v1.5.0`):
   ```bash
   git tag base-ui-v1.5.0
   git push origin base-ui-v1.5.0
   ```
5. The `Publish Data Release` GitHub Action triggers automatically, creates a GitHub release for that tag, and uploads `data/base-ui-attributes.json` as an asset.
6. Update `CHANGELOG.md` with the new Base UI version number.

The generator prints the version it detected — confirm it matches what you expect before committing.
