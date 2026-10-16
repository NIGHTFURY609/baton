# Rules (source of AGENTS.md)

`baton compile` regenerates AGENTS.md from this file. Keep it short: every line here is loaded in every session.

## Project rules
<!-- baton: {id: rules-project, kind: rule, verified_at: null, source_paths: []} -->

- How to build, test and lint, in one line each.
- The two or three conventions an agent gets wrong most often.

## Continuity rules
<!-- baton: {id: rules-continuity, kind: rule, verified_at: null, source_paths: [".context/**"]} -->

- Do not edit `.context/STATE.md` or `.context/decisions/` directly; use `baton handoff` and `baton decide`.
- Load-bearing choices get a decision record before code (`baton decide --preflight` first).
- No markdown TODO lists; work items live in the task store (`baton task ready`, `baton task create`). Never edit `.context/tasks.jsonl` by hand.
