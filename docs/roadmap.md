# Roadmap

Four phases, about 13 weeks, each gated on a measured result. Nothing ships before the dogfood numbers hold.

![roadmap](research/media/roadmap.png)

This file lists phase deliverables and gates only. Work items live in the task store (`baton task ready`): Phase 0 is epic `bt-kmz`, Phase 1 is epic `bt-s9g`. Done so far: scaffold, the native task store (ADR 0009), the Phase 1 MVP and the Phase 2 gates. Both phases' gates are dogfood measurements still to be taken. Still stubbed and exiting 3: `mcp` and `init --harness codex|gemini` (Phase 3).

## Phase 0 · Dogfood (2 weeks) — gate: baseline captured

Uses existing tools only; costs nothing to build. Record tokens at session start, corrections per session and time to resume, by hand or with ccusage until `stats` exists. Tasks: `baton task show bt-kmz`.

## Phase 1 · MVP (3–4 weeks) — gate: ≥ 30% fewer start tokens and corrections down, or stop

| Deliverable | Done when |
|---|---|
| Section index over `.context/` | Parses rules, spec, STATE, knowledge, decisions; duplicate ids across files rejected |
| `drift` + `verify-doc` | Per-section commit counts and dead refs; text and JSON output; `--fail-on` exits 2 |
| `mission --budget` | Packet ≤ `maxChars`, stale/unverified withheld and listed, factual phrasing; snapshot test on this repo |
| `handoff` | STATE.md rebuilt from task store + `git status` + `diff --stat` + last tool calls; idempotent; < 1 s |
| `stats` | Tokens at session start and doc tokens per task from real transcripts; snapshot to `.context/.cache/stats/` |
| `init` | Scaffolds from `templates/`, writes router + pointer, never overwrites without `--force` |
| Hooks | SessionStart (incl. `compact`), PreCompact, SessionEnd wired to the above; verified on Windows and Linux |
| Skills | `/init-spec`, `/checkpoint` work end to end through the CLI |
| Task store in the packet | Ready tasks + their `spec:` sections in `mission`; `handoff` reads in-progress and recently closed tasks; memories included under budget |

## Phase 2 · Gates (3 weeks) — gate: no direct state edits in 10 sessions

Built: epic `bt-vyr` (plan: [phase 2](superpowers/plans/2026-10-21-phase2-gates.md); ADRs 0018–0022). The gate is measured by hand: `bt-vyr.18`.

- `decide` with MADR records, supersede chains, spec-conflict flags, `--preflight`
- `verify` runs check commands; closes tasks only on exit 0 (+ non-empty diff by default)
- PreToolUse denies on protected state (edit tools and shell); preflight on dependency and migration files
- PostToolUse marks touched sections aging; opt-in Stop verification
- `compile` + `compile --check` in CI

## Phase 3 · Reach (4 weeks) — gate: benchmark published

- MCP adapter: four tools implemented over core
- `init --harness codex|gemini` writes their hook config; skills tested in Codex and Gemini CLI
- Publish to npm as `baton-ctx`; plugin marketplace entry
- Paired A/B benchmark and harness published

## Side track · explain (outside the phase gates)

`baton explain` returns facts and a voice template for one project element, and a `/baton` router skill mirrors the CLI in agents. Spec: [explain design](superpowers/specs/2026-10-20-explain-design.md); epic `bt-8ao` (`baton task show bt-8ao`).

## Open questions

1. What N (commits) marks a section stale, per kind? Defaults are guesses in `config.yaml`.
2. Does the packet need spec sections at all, or do ADR summaries plus task descriptions carry enough intent?
3. Is `search` in the MCP adapter worth its tool-definition tokens, or does Grep on `.context/` suffice?
4. Should `verify` require a non-empty diff by default? Resolved: yes by default; `--no-diff` opts out (ADR 0019).
5. How do skills call the CLI: global install, `npx baton-ctx`, or a plugin `bin/` shim (which claude.ai/Cowork will not install)? Resolved: global install (ADR 0011).
