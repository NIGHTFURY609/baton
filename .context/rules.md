# Rules (source of AGENTS.md)

`baton compile` will regenerate AGENTS.md from this file (Phase 2). Until then, edit both by hand and keep them identical in substance.

## Project rules
<!-- baton: {id: rules-project, kind: rule, verified_at: null, source_paths: [package.json, tsconfig.json, biome.json]} -->

- TypeScript, Node ≥ 22.13 (for `node:sqlite`), ESM. `npm run check` (lint, typecheck, test) must pass before a task is done.
- `src/core/` holds pure logic and small IO wrappers; it never imports from `commands/`, `hooks/` or `mcp/`.
- Every command keeps the exit-code contract: 0 ok, 1 error, 2 check failed/blocked, 3 not implemented.
- Hooks fail open: catch, report on stderr, exit 0. Only structured denies change agent behaviour.
- New harness facts go in docs/research/2026-10-16-implementation-notes.md with a source and a verification status.
- Skills use Agent Skills spec keys only; run `npm run validate:skills`.

## Continuity rules
<!-- baton: {id: rules-continuity, kind: rule, verified_at: null, source_paths: [".context/**"]} -->

- Do not edit `.context/STATE.md` or files in `.context/decisions/` directly; STATE is generated, ADRs are append-only (supersede with a new record).
- Load-bearing choices (dependencies, storage formats, hook semantics) get an ADR before code.
- No markdown TODO lists; work items live in the task store (`baton task ...`). Never edit `.context/tasks.jsonl` or `.context/memories.jsonl` by hand.
