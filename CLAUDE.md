# CLAUDE.md

## Quality gate

Run this after every change before moving on:

```bash
pnpm typecheck && pnpm format && pnpm test
```

All must pass. Fix failures immediately — never defer.

## Tests

Test files live next to the code they test (`*.test.ts`). Vitest picks up all `*.test.ts` files recursively — add new test files alongside the source files they cover. Every new function or behaviour needs a corresponding test.
