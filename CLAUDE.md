# CLAUDE.md

## Quality gate

Run this after every change before moving on:

```bash
pnpm typecheck && pnpm format && pnpm test
```

All must pass. Fix failures immediately — never defer.

## Tests

Test files live next to the code they test (`*.test.ts`). The test script picks up `scripts/generate/*.test.ts` and `src/util/context.test.ts` — place new test files in those locations accordingly. Every new function or behaviour needs a corresponding test.
