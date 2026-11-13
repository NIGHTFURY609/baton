---
id: state
kind: state
verified_at: "8960b553bc2a"
source_paths: []
generated_by: baton handoff
generated_at: 2026-11-05T21:59:48.999Z
reason: "session-end:other"
---
# State

Last handoff: 2026-11-05T21:59:48.999Z (session-end:other) at commit 8960b553bc2a on branch transcript-snapshots.

## Summary

- Open epics: bt-kmz Phase 0 · Dogfood: capture the baseline; bt-s9g Phase 1 · MVP: freshness, mission packet, hook-made handoff, stats; bt-vyr Phase 2 · Gates: decide, verify, PreToolUse denies, compile (+1 more)
- Recently closed: bt-w2a Observe bare /baton resolution in Claude Code (manual, interactive) (2026-11-05); bt-795 Observe the exec-form SessionStart hook in a live Claude Code session on Windows (2026-11-05); bt-bra Observe smoke:hooks green on ubuntu-latest CI (2026-10-30) (+2 more)
- Blocked: 1 (bt-jx6 by bt-vyr)
- Working tree: 4 changed path(s)
- Last tool calls: none recorded

## In progress

- bt-u75 P1 PreToolUse config load misses the 150 ms budget: ordinary Edit 270 ms vs Bash 123 ms (@NIGHTFURY609)
- bt-kmz.3 P2 Snapshot Claude Code transcripts weekly (30-day deletion) (@NIGHTFURY609)

## Ready next

- bt-kmz.2 P1 Record baseline: tokens at session start, corrections, time to resume
- bt-kmz.5 P2 Settle stale thresholds per kind and whether the packet needs spec sections
- bt-vyr.18 P2 Measure the Phase 2 gate: no direct state edits in 10 sessions
- bt-kmz.4 P3 Try ActiveMemory ctx + a PreCompact handoff recipe on one project for comparison
- bt-f3t P3 drift: orphan knowledge topics, oversized rules, stale tasks

## Recently closed

- bt-w2a Observe bare /baton resolution in Claude Code (manual, interactive) (closed 2026-11-05: Observed 2026-11-06 (Claude Code 2.1.310, --plugin-dir, Windows): /baton task ready ran the plugin skill, recorded as /baton:baton with args task ready; baton task ready exit 0. Recorded in implementation notes section 2.)
- bt-795 Observe the exec-form SessionStart hook in a live Claude Code session on Windows (closed 2026-11-05: Live session 2026-11-06 (Claude Code 2.1.310, --plugin-dir, Windows 11, project roblox): SessionStart exec form exit 0 with the brief injected; Edit of .context/STATE.md denied twice, one guard.jsonl deny line; SessionEnd regenerated STATE.md. Recorded in implementation notes section 1.)
- bt-bra Observe smoke:hooks green on ubuntu-latest CI (closed 2026-10-30: Observed: npm run smoke:hooks green on ubuntu-latest and windows-latest in CI run 41084815009 (2026-10-30); recorded in implementation notes section 1.)
- bt-6yv Guard: charge the heredoc scanner to the work budget and cap its depth (closed 2026-10-30: verified: npm run check)
- bt-9iu Remove the last wall-clock bounds from tests (closed 2026-10-30: verified: npm run check)

## Blocked

- bt-jx6 Phase 3 · Reach: MCP adapter, Codex/Gemini hooks, publish, A/B benchmark (blocked by bt-vyr)

## Working tree

```text
?? .context/decisions/0000-template.md
?? .context/knowledge/README.md
?? rubbish-1.txt
?? rubbish-2.md
```

## Diff stat

- no changes against HEAD

## Recent tool calls

- none recorded
