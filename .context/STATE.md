---
id: state
kind: state
verified_at: "fb07680b5429"
source_paths: []
generated_by: baton handoff
generated_at: 2026-11-16T18:26:22.083Z
reason: "manual"
---
# State

Last handoff: 2026-11-16T18:26:22.083Z (manual) at commit fb07680b5429 on branch transcript-snapshots.

## Summary

- Open epics: bt-kmz Phase 0 · Dogfood: capture the baseline; bt-s9g Phase 1 · MVP: freshness, mission packet, hook-made handoff, stats; bt-vyr Phase 2 · Gates: decide, verify, PreToolUse denies, compile (+1 more)
- Recently closed: bt-u75 PreToolUse config load misses the 150 ms budget: ordinary Edit 270 ms vs Bash 123 ms (2026-11-16); bt-kmz.3 Snapshot Claude Code transcripts weekly (30-day deletion) (2026-11-16); bt-w2a Observe bare /baton resolution in Claude Code (manual, interactive) (2026-11-05) (+2 more)
- Blocked: 1 (bt-jx6 by bt-vyr)
- Working tree: 9 changed path(s); 8 files changed, 71 insertions(+), 21 deletions(-)
- Last tool calls: PowerShell: npx (+5 args) | Select-Object (+2 args); npm run check (+1 args) | Select-Object…; PowerShell: npm (+3 args) | Select-String (+2 args); (expression); git status (+1 args) | Se…; PowerShell: baton handoff; git add (+2 args); git commit (+3 args); (expression)

## In progress

- none

## Ready next

- bt-kmz.2 P1 Record baseline: tokens at session start, corrections, time to resume
- bt-kmz.5 P2 Settle stale thresholds per kind and whether the packet needs spec sections
- bt-vyr.18 P2 Measure the Phase 2 gate: no direct state edits in 10 sessions
- bt-kmz.4 P3 Try ActiveMemory ctx + a PreCompact handoff recipe on one project for comparison
- bt-f3t P3 drift: orphan knowledge topics, oversized rules, stale tasks

## Recently closed

- bt-u75 PreToolUse config load misses the 150 ms budget: ordinary Edit 270 ms vs Bash 123 ms (closed 2026-11-16: Under budget on an idle CPU after ADR 0027: in-repo Edit 92 ms, deny 85-98, preflight 98-104 vs 150 (hook-smoke --strict-timing, 2026-11-16). post-tool-use on this repo is 141 ms, the tightest row.)
- bt-kmz.3 Snapshot Claude Code transcripts weekly (30-day deletion) (closed 2026-11-16: verified: npm run check)
- bt-w2a Observe bare /baton resolution in Claude Code (manual, interactive) (closed 2026-11-05: Observed 2026-11-06 (Claude Code 2.1.310, --plugin-dir, Windows): /baton task ready ran the plugin skill, recorded as /baton:baton with args task ready; baton task ready exit 0. Recorded in implementation notes section 2.)
- bt-795 Observe the exec-form SessionStart hook in a live Claude Code session on Windows (closed 2026-11-05: Live session 2026-11-06 (Claude Code 2.1.310, --plugin-dir, Windows 11, project roblox): SessionStart exec form exit 0 with the brief injected; Edit of .context/STATE.md denied twice, one guard.jsonl deny line; SessionEnd regenerated STATE.md. Recorded in implementation notes section 1.)
- bt-bra Observe smoke:hooks green on ubuntu-latest CI (closed 2026-10-30: Observed: npm run smoke:hooks green on ubuntu-latest and windows-latest in CI run 41084815009 (2026-10-30); recorded in implementation notes section 1.)

## Blocked

- bt-jx6 Phase 3 · Reach: MCP adapter, Codex/Gemini hooks, publish, A/B benchmark (blocked by bt-vyr)

## Working tree

```text
 M .claude-plugin/marketplace.json
 M .context/tasks.jsonl
 M .gitignore
 M README.md
 M docs/roadmap.md
 M package.json
 M plugin/.claude-plugin/plugin.json
 M src/commands/init.ts
?? plugin/dist/
```

## Diff stat

```text
 .claude-plugin/marketplace.json   |  9 +++++----
 .context/tasks.jsonl              |  4 ++--
 .gitignore                        |  5 +++--
 README.md                         | 40 ++++++++++++++++++++++++++++++++++------
 docs/roadmap.md                   |  2 +-
 package.json                      | 21 +++++++++++++++++++--
 plugin/.claude-plugin/plugin.json |  9 ++++++---
 src/commands/init.ts              |  2 +-
 8 files changed, 71 insertions(+), 21 deletions(-)
```

## Recent tool calls

From session ab759184-52b5-4f12-bd04-675f81cd5fca (oldest first):

- Edit .gitignore
- Edit docs/roadmap.md
- Edit README.md
- Edit README.md
- Edit README.md
- PowerShell: npm run build (+1 args) | Select-Object (+2 args); baton (+1 args); baton (+1 ar…
- PowerShell: npx (+4 args) | Select-String (+2 args) | ForEach-Object (+1 args) | Group-Objec… (failed)
- PowerShell: npx (+5 args) | Select-Object (+2 args); npm run check (+1 args) | Select-Object…
- PowerShell: npm (+3 args) | Select-String (+2 args); (expression); git status (+1 args) | Se…
- PowerShell: baton handoff; git add (+2 args); git commit (+3 args); (expression)
