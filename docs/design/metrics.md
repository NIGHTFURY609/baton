# Metrics and the go / no-go rule

baton's pitch is three numbers. If they do not move, the layer is not worth shipping, and the numbers get published either way.

## The five metrics

| Metric | Definition | Source | Computed by |
|---|---|---|---|
| **Tokens at session start** | Context the model saw on its first turn: `input + cache_creation + cache_read` of the first assistant record | Transcript JSONL | `firstTurnContextTokens` (`src/core/transcript.ts`) |
| **Doc tokens per task** | Tokens of `.context/` content read during a task (Read tool calls on `.context/**` plus the injected packet) | Transcript `tool_use` / `tool_result` | `stats` (`src/core/stats.ts`, ADR 0016) |
| **Corrections per session** | User turns that reverse or correct the agent ("no", "we decided", "don't", "that's wrong") | Transcript user records + simple classifier | `stats` (`src/core/stats.ts`, ADR 0016) |
| **Drift caught** | Sections flagged stale/aging before injection that a human later confirms wrong. Report precision (target > 70%) and track recall | `.context/.cache/drift.jsonl` + confirmations | `drift`, `stats` |
| **Time to resume** | Wall clock from session start to first Edit/Write on a continued task | Transcript timestamps | `stats` (`src/core/stats.ts`, ADR 0016) |

Always count baton's own overhead (packet size, hook output, MCP tool definitions) against the savings.

## Method

- **Baseline first (Phase 0):** two weeks on real projects without baton's packet, recording the five metrics from transcripts. Transcripts are deleted after 30 days by default, so snapshot them into `.context/.cache/stats/` (or raise `cleanupPeriodDays`).
- Doc tokens and corrections are estimates (characters / 4, and a keyword heuristic). Time to resume is reported as time to first edit in the session, with no check that the session continued an earlier task. See ADR 0016.
- **Paired A/B:** the same task set run with and without the layer, several runs each, with a sign test on output quality so token savings are not bought with worse code (JetBrains' caveman method).
- **Replay eval:** for each injected section, score whether the session used, ignored or contradicted it. Never used in 10 sessions → candidate for on-demand only. Contradicted twice → a freshness bug.

## Decision rule (MVP gate)

After two weeks of dogfooding the MVP: if tokens at session start drop by **less than 30%** and corrections per session **do not fall**, stop. Publish the numbers either way.
