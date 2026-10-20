# baton — spec

The North Star. Intent and boundaries only; mechanics live in `docs/design/`. Each section carries provenance (ADR 0003). A change to a section marked load-bearing needs an ADR (`baton decide`).

## Purpose
<!-- baton: {id: purpose, kind: intent, verified_at: null, source_paths: []} -->

Keep coding agents continuous across sessions: every session starts with the smallest fresh brief, nothing stale reaches the model, and nothing decided is forgotten. baton addresses **amnesia and drift**, not hallucination; it does not claim to improve correctness by itself.

Success is measured, not asserted: ≥ 30% fewer tokens at session start and fewer corrections per session versus baseline (docs/design/metrics.md). If the MVP misses that, the project stops and publishes the numbers.

## Scope and non-goals
<!-- baton: {id: scope, kind: intent, verified_at: null, source_paths: []} -->

In scope: section-level freshness, the budgeted mission packet, hook-generated handoffs, lifecycle rules for state docs, honest stats, on-demand explanations of one project element in a chosen voice (`explain`, ADR 0010).

Not in scope (load-bearing): spec or plan authoring beyond `/init-spec` (superpowers and Spec Kit are upstream); a full project tracker (no Dolt, sync server, UI, molecules or gates; baton ships only the minimal task store of ADR 0009); rules-file sync engines (rulesync-class tools); always-on output-style compression (caveman-style token savers; on-demand explain voices are in scope, ADR 0010); a server that owns state; a hand-maintained mindmap.

## Context format
<!-- baton: {id: context-format, kind: intent, verified_at: null, source_paths: ["src/core/frontmatter.ts", "src/core/paths.ts", "templates/**"]} -->

Six documents: rules (→ AGENTS.md), spec, decisions, task store, STATE, knowledge. Files in git are the truth. Structured where mutable, prose where stable. Every section has `id`, `kind`, `verified_at`, `source_paths`. Full format: docs/design/context-format.md.

## Freshness
<!-- baton: {id: freshness, kind: intent, verified_at: null, source_paths: ["src/core/freshness.ts", "src/core/git.ts", "src/commands/drift.ts"]} -->

Sections are fresh, aging, stale, superseded or unverified, computed from commits touching their `source_paths` since `verified_at`, and from dead references. Stale, superseded and unverified sections are never injected; they are listed so someone re-verifies them. Re-verifying must be one cheap command.

## Mission packet
<!-- baton: {id: mission-packet, kind: intent, verified_at: null, source_paths: ["src/core/budget.ts", "src/commands/mission.ts"]} -->

One packet per session: STATE head, ready tasks, the spec sections and ADRs tagged to them, freshness notices. Character-budgeted (≤ 10,000, ADR 0004), blocks kept or dropped whole, phrased as facts. Nothing else loads by default.

## Handoff
<!-- baton: {id: handoff, kind: intent, verified_at: null, source_paths: ["src/commands/handoff.ts", "src/hooks/dispatch.ts"]} -->

STATE.md is generated from structured state (task store, git status, diff --stat, recent tool calls), never from the model's recollection, and is overwritten, never appended. Written at PreCompact and SessionEnd by hooks (ADR 0005); `/handoff` is the human-reviewed form.

## Hooks
<!-- baton: {id: hooks, kind: intent, verified_at: null, source_paths: ["src/hooks/**", "plugin/hooks/**"]} -->

Hooks are the enforcement layer; the MCP is only an adapter. Hooks fail open, use exec-form `node`, and guard both edit tools and the shell (ADR 0008). Claude Code first; Codex and Gemini CLI equivalents in Phase 3.

## Skills
<!-- baton: {id: skills, kind: intent, verified_at: null, source_paths: ["plugin/skills/**"]} -->

Thin procedures that call the CLI and carry the taxonomy and lifecycle rules: `/init-spec`, `/checkpoint`, `/handoff`, `/decide`, `/doc-audit`, `/baton` (routes `/baton <args>` to the CLI or to the matching skill, ADR 0010). Spec-only frontmatter so they load in every Agent Skills harness.

## Tasks
<!-- baton: {id: tasks, kind: intent, verified_at: null, source_paths: ["src/core/tasks/**", "src/commands/task.ts"]} -->

Work items live in a structured task store: by default baton's own, ported from Beads (ADR 0009), stored in `.context/tasks.jsonl` with a SQLite cache, changed only through `baton task`. Tasks have hash ids, dependencies, child tasks, comments, an atomic claim and a ready queue. They link to spec sections with `spec:<id>` labels and to their check with `check:<command>`. A task is done only when `baton verify` runs its check and it passes; no proof string from the model is accepted. Short project facts live alongside as memories (`baton remember`).

## Decisions
<!-- baton: {id: decisions, kind: intent, verified_at: null, source_paths: ["src/core/decisions.ts", "src/commands/decide.ts"]} -->

MADR 4.0 records in `.context/decisions/`, append-only, superseded never edited (ADR 0001). `decide --preflight` checks a proposed change against accepted decisions and the spec before it lands.

## Measurement
<!-- baton: {id: measurement, kind: intent, verified_at: null, source_paths: ["src/core/transcript.ts", "src/commands/stats.ts"]} -->

`baton stats` reports tokens at session start, doc tokens per task, corrections, drift caught and time to resume from the session log, and counts baton's own overhead against its savings.
