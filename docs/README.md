# Developer Documentation

This directory contains developer-facing documentation for the Base UI CSS IntelliSense extension.

## Contents

| File                                               | What it covers                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| [architecture.md](./architecture.md)               | Overall structure, file map, startup sequence, data flow          |
| [data-generation.md](./data-generation.md)         | How to regenerate `data/base-ui-attributes.json` from source      |
| [component-detection.md](./component-detection.md) | The pipeline that maps CSS selectors to Base UI components        |
| [context-detection.md](./context-detection.md)     | How the extension decides what completions to offer at the cursor |

## Quick orientation

The extension has two distinct concerns:

1. **What to suggest** — a static JSON bundle of every Base UI data attribute and CSS variable, generated offline from the Base UI source repo (`scripts/generate/`).
2. **When to suggest it** — runtime logic that figures out (a) where the cursor is and what kind of completion is appropriate, and (b) which Base UI components are relevant to the CSS file being edited.

Start with [architecture.md](./architecture.md) for the full picture, then read the other files as needed.
