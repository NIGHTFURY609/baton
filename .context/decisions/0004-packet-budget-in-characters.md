---
id: adr-0004
kind: decision
status: accepted
date: 2026-10-16
decision-makers: [maintainer]
verified_at: "428730e2882f"
source_paths: [src/core/budget.ts, src/core/config.ts]
spec_sections: [mission-packet]
---
# Mission packet budget is in characters: default 9,000, max 10,000

## Context and Problem Statement

The research report framed the packet budget in tokens. Claude Code caps SessionStart `additionalContext` at 10,000 characters; over the cap, the text is written to a file and the model sees only a path and a 2,000-character preview, without being told to read it. A token budget above ~2.5k tokens would silently lose most of the packet.

## Decision Outcome

Budget in characters. `packet.maxChars` defaults to 9,000 (headroom for the hook wrapper) and the config schema rejects values above 10,000. Blocks are kept or dropped whole, never truncated mid-block. Token figures are estimates for reporting; `stats` uses real usage from transcripts.

The packet is written as factual statements rather than imperatives, as the hooks docs advise, so it does not read like a prompt injection.

### Consequences

* Good, because the packet can never be silently replaced by a preview.
* Bad, because ~2.2k tokens is tight; this forces the "smallest fresh brief" discipline the design wants anyway.
