---
id: adr-0005
kind: decision
status: accepted
date: 2026-10-16
decision-makers: [maintainer]
verified_at: null
source_paths: [plugin/hooks/hooks.json, src/hooks/dispatch.ts]
spec_sections: [handoff]
---
# Write the full handoff at PreCompact; SessionEnd does a fast write

## Context and Problem Statement

The report put handoff generation at PreCompact and SessionEnd. SessionEnd hooks share a 1.5 s budget in Claude Code (raised only by an explicit per-hook timeout, max 60 s), and Codex gives SessionEnd 1 s by default, 3 s at most.

## Decision Outcome

* PreCompact runs the full deterministic `handoff` (task store + git status + diff --stat + recent tool calls).
* SessionEnd runs the same deterministic path with an explicit `timeout: 10` in Claude Code, and must finish within 3 s for Codex. No LLM summary on either path.
* SessionStart with the `compact` matcher re-injects the packet after compaction (PostCompact output never reaches the model).

### Consequences

* Good, because the handoff never depends on the model's recollection at high context usage.
* Bad, because `handoff` must stay fast; it gets a performance test in Phase 1.
