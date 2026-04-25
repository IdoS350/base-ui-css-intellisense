# Phase 5 — Packaging & Publishing

> **Goal:** Polish the extension for public release and publish to both the VS Code Marketplace and Open VSX.

---

## Pre-flight checklist

Before starting this phase, confirm:

- [ ] `pnpm format && pnpm test` passes cleanly
- [ ] Extension activates without errors in the Extension Development Host
- [ ] All manual verification checklists from phases 1–4 pass
- [ ] `data/base-ui-attributes.json` and `data/base-ui.css-data.json` are committed and up to date

---

## 1. Metadata (`package.json`)

Fill in everything that appears on the Marketplace listing:

```json
{
  "displayName": "Base UI CSS IntelliSense",
  "description": "Autocomplete and hover docs for Base UI data attributes and CSS variables in CSS, SCSS, and Less files.",
  "version": "0.1.0",
  "publisher": "<your-publisher-id>",
  "license": "MIT",
  "icon": "assets/icon.png",
  "homepage": "<repo-url>",
  "repository": {
    "type": "git",
    "url": "<repo-url>"
  },
  "bugs": {
    "url": "<repo-url>/issues"
  },
  "keywords": [
    "base-ui",
    "css",
    "autocomplete",
    "intellisense",
    "data-attributes"
  ],
  "categories": ["Other", "Snippets"]
}
```

## 2. Icon

Create `assets/icon.png` — 128×128px PNG. Requirements:

- Must not be the VS Code logo or any other trademarked image
- Transparent background preferred
- Simple and recognizable at small sizes

## 3. `.vscodeignore`

Exclude everything that shouldn't be in the `.vsix`. Create `.vscodeignore`:

```
.vscode/**
src/**
scripts/**
node_modules/**
**/*.test.ts
**/*.map
.gitignore
.prettierrc
tsconfig.json
pnpm-lock.yaml
```

Keep in the package:

- `dist/extension.js`
- `data/base-ui-attributes.json`
- `data/base-ui.css-data.json`
- `assets/icon.png`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`

Verify the final package contents by running `vsce ls` before publishing.

## 4. `README.md`

Must include:

- **What it does** — one paragraph, no jargon
- **Demo GIF** — record with VS Code's built-in screen recorder or any GIF tool. Show: attribute name completion, value completion, hover tooltip, and `var()` completion. Place in `assets/demo.gif` and embed in the README.
- **Supported languages** — CSS, SCSS, Less
- **Base UI version** — which version the bundled data was generated from, e.g. "Currently ships data for Base UI v1.3.0."
- **Contributing / regenerating data** — one-liner: `pnpm generate <path-to-base-ui-repo>`
- **License**

## 5. `CHANGELOG.md`

```md
# Changelog

## 0.1.0

Initial release.

- Autocomplete for Base UI data attributes in CSS attribute selectors (`[data-*]`)
- Autocomplete for enumerated attribute values (e.g. `[data-side="top|bottom|..."]`)
- Hover documentation for data attributes showing description, components, and GitHub source link
- Autocomplete and hover for Base UI CSS variables via VS Code Custom Data
- Supports CSS, SCSS, and Less
```

## 6. `LICENSE`

Add an MIT `LICENSE` file if not already present.

## 7. Attribution

Base UI is MIT licensed. Add a `NOTICE` file or a section in `README.md`:

```
This extension bundles data derived from Base UI source code.
Base UI is copyright MUI and licensed under the MIT License.
https://github.com/mui/base-ui
```

## 8. Build and package

```bash
pnpm build
vsce ls          # verify package contents — check nothing sensitive is included
vsce package     # produces base-ui-css-intellisense-0.1.0.vsix
```

Install locally to do a final end-to-end check:

```bash
code --install-extension base-ui-css-intellisense-0.1.0.vsix
```

Open a fresh CSS file and run through the full manual checklist one more time.

## 9. Publish

### VS Code Marketplace

1. Create a publisher at https://marketplace.visualstudio.com/manage if you don't have one.
2. Generate a Personal Access Token (PAT) in Azure DevOps with **Marketplace → Manage** scope.
3. `vsce login <publisher-id>`
4. `vsce publish`

### Open VSX (Cursor, VSCodium, etc.)

1. Create an account at https://open-vsx.org.
2. Generate a token.
3. `pnpm add -D ovsx`
4. `ovsx publish base-ui-css-intellisense-0.1.0.vsix -p <token>`

## 10. Add a publish script

```json
"scripts": {
  "publish:vsce": "vsce publish",
  "publish:ovsx": "ovsx publish $(ls *.vsix | head -1) -p $OVSX_TOKEN"
}
```

---

## Manual verification checklist

1. `vsce ls` output contains `dist/extension.js`, both `data/*.json` files, `README.md`, `CHANGELOG.md`, `LICENSE`, `assets/icon.png` — and nothing from `src/`, `scripts/`, or `node_modules/`.
2. Install the `.vsix` locally — extension activates without errors (check Output → Extension Host).
3. All completion and hover features work from the installed `.vsix` (not the dev host).
4. Marketplace listing preview looks correct — icon, description, README renders properly.
5. `pnpm format && pnpm test` still passes.

**All 5 checks passing = Phase 5 complete.**
