---
id: adr-0028
kind: decision
status: accepted
date: 2026-11-06
decision-makers: [NIGHTFURY609]
verified_at: "90e720facfcf"
source_paths: ["src/hooks/dispatch.ts", "src/core/stats.ts"]
spec_sections: [measurement, hooks]
---
# SessionEnd and PreCompact snapshot their own session's stats

## Context and Problem Statement

Claude Code deletes transcripts after `cleanupPeriodDays` (default 30; implementation notes §4). `baton stats` keeps a session's numbers by writing a snapshot (ADR 0016), but only when someone runs it. A project nobody measures within 30 days loses those sessions for good, and the Phase 0 baseline and the Phase 1 gate are both read from them (bt-kmz.3).

## Considered Options

* SessionEnd and PreCompact write the ending session's snapshot from transcript_path
* A scheduled weekly baton stats run (Task Scheduler or cron)
* SessionStart snapshots older transcripts that have none

## Decision Outcome

Chosen option: "SessionEnd and PreCompact write the ending session's snapshot from transcript_path". Every session that ends or compacts is then kept, with no scheduler to install on each machine. The work also lands in hooks that do not hold up the user. A weekly job would need setup per machine and would miss whatever falls between runs. A SessionStart scan would add latency to the one hook the user waits on.

* After the handoff, `hook pre-compact` and `hook session-end` parse the file named by `transcript_path` and write `.context/.cache/stats/<session-id>.json`, the same `SessionMetrics` record `baton stats` writes (ADR 0016). The session id is the file's basename.
* They do this only for the `claude` harness, since `stats` parses Claude Code transcripts only, and only when the project has `.context/`.
* The snapshot runs after `STATE.md` is written, so a slow or failing parse never costs the handoff. Errors fail open (ADR 0008).
* ADR 0005 is unchanged: both hooks stay deterministic. SessionEnd keeps its 10 s timeout, and Codex's 3 s limit does not apply because Codex is skipped.

### Consequences

* Good, because the baseline survives the 30-day cleanup without anyone running `stats`, and snapshots still hold derived numbers only, never transcript text.
* Bad, because SessionEnd now parses the whole transcript: about 0.7 s over process start for the largest one on the build machine (63 MB, measured 2026-11-06 under load).
* Bad, because a session that crashes before it compacts or ends is kept only if `stats` runs within 30 days.

## More Information

Preflight at creation (baton decide): 6 constraining, 4 related, 0 possibly related.

* constrains: ADR 0005 (accepted) "Write the full handoff at PreCompact; SessionEnd does a fast write" (path: src/hooks/dispatch.ts; keyword: sessionend, precompact)
* constrains: ADR 0008 (accepted) "Hooks run as exec-form node, fail open, and guard the shell too" (path: src/hooks/dispatch.ts; spec: hooks)
* constrains: ADR 0016 (accepted) "stats metric definitions and snapshots" (path: src/core/stats.ts; spec: measurement; keyword: stats)
* constrains: ADR 0021 (accepted) "Uncommitted source changes age sections; PostToolUse notices touched sections" (spec: hooks)
* constrains: ADR 0024 (accepted) "Shell tool-call summaries show only allowlisted words" (path: src/hooks/dispatch.ts; spec: hooks)
* constrains: ADR 0027 (accepted) "PreToolUse guards: a guards-only config read and heredoc scanning inside the work budget" (spec: hooks)
* related: spec handoff "Handoff" (path: src/hooks/dispatch.ts)
* related: spec hooks "Hooks" (path: src/hooks/dispatch.ts; spec: hooks)
* related: spec measurement "Measurement" (path: src/core/stats.ts; spec: measurement)
* related: knowledge knowledge-harness-limits "Harness limits that bite" (path: src/hooks/dispatch.ts)
