---
id: state
kind: state
verified_at: null
source_paths: []
generated_by: hand (bootstrap; `baton handoff` takes over in Phase 1)
generated_at: 2026-10-16
---
# State

**Phase:** 0 · Dogfood

**Last handoff:** scaffold complete; native task store ported from Beads and working (ADR 0009). The backlog lives in `.context/tasks.jsonl`: run `baton task ready`.

**Next:**
- `git init` and a first commit; then stamp section `verified_at` values with that SHA
- Start recording the baseline (docs/design/metrics.md)
- Phase 1 work is in epic `bt-s9g` (blocked by Phase 0 by design; `baton task dep remove bt-s9g bt-kmz` to start early)

**Blockers:** none.

**Warnings:**
- Every section in `.context/` is `verified_at: null` (no commits yet), so all are *unverified* until stamped.
- Exec-form hook `args` with `${CLAUDE_PLUGIN_ROOT}` is not yet verified on Windows.
- `node:sqlite` is experimental in Node 22 (warning suppressed); needs Node ≥ 22.13.
