# Rules (source of AGENTS.md)

`baton compile` regenerates AGENTS.md from the marked sections below; text outside them, like this line, is not compiled. CI runs `baton compile --check`.

## Orientation
<!-- baton: {id: rules-orientation, kind: rule, verified_at: null, source_paths: ["docs/roadmap.md"]} -->

baton is a CLI-first continuity layer for coding agents (TypeScript, Node ≥ 22.13). Read `.context/STATE.md` first, then `docs/roadmap.md` for the current phase.

## Commands
<!-- baton: {id: rules-commands, kind: rule, verified_at: null, source_paths: [package.json]} -->

- `npm run check`: lint (Biome), typecheck, tests (Vitest). Must pass before a task is done.
- `npm run build`: bundle to `dist/baton.mjs` and sync `plugin/dist/`.
- `npm run validate:skills`: Agent Skills spec check for `plugin/skills/`.
- `node dist/baton.mjs --help`: the CLI contract. `node dist/baton.mjs task ready`: what to work on next.
- `node dist/baton.mjs verify <id>`: run a task's check and close it. `node dist/baton.mjs compile`: regenerate AGENTS.md from `.context/rules.md`.
- In this repo, `baton` in any rule or skill means `node dist/baton.mjs` (no global install).

## Project rules
<!-- baton: {id: rules-project, kind: rule, verified_at: "428730e2882f", source_paths: [package.json, tsconfig.json, biome.json]} -->

- TypeScript, Node ≥ 22.13 (for `node:sqlite`), ESM. `npm run check` (lint, typecheck, test) must pass before a task is done.
- `src/core/` holds pure logic and small IO wrappers; it never imports from `commands/`, `hooks/` or `mcp/`.
- Every command keeps the exit-code contract: 0 ok, 1 error, 2 check failed/blocked, 3 not implemented.
- Hooks fail open: catch, report on stderr, exit 0. Only structured denies change agent behaviour.
- New harness facts go in docs/research/2026-10-16-implementation-notes.md with a source and a verification status.
- Skills use Agent Skills spec keys only; run `npm run validate:skills`.

## Continuity rules
<!-- baton: {id: rules-continuity, kind: rule, verified_at: "428730e2882f", source_paths: [".context/**"]} -->

- Do not edit `.context/STATE.md`, `.context/tasks.jsonl` or `.context/memories.jsonl` by hand: use `baton handoff`, `baton task …` and `baton remember`. The PreToolUse hook denies direct edits.
- Decisions go through `baton decide` (MADR, append-only): never edit decision frontmatter or accepted records; fill a proposed record's body. `baton decide --accept` or a superseding record changes a status.
- Load-bearing choices (dependencies, storage formats, hook semantics) get a decision before code; run `baton decide --preflight` first.
- No markdown TODO lists; work items live in the task store (`baton task ready`). Claim before you start (`baton task update <id> --claim`): verify's diff counts from the claim. New work: `baton task create "…" --check "<cmd>"`.
- A task is done when `baton verify <id>` passes its check; `baton task close` refuses a checked task without `--force`.
- Generated files: `AGENTS.md` (`baton compile`) and `.context/STATE.md` (`baton handoff`).

## Where things are
<!-- baton: {id: rules-where, kind: rule, verified_at: null, source_paths: []} -->

- Design: `docs/design/` (architecture, context format, metrics) · Evidence: `docs/research/` · Plans: `docs/superpowers/plans/`
