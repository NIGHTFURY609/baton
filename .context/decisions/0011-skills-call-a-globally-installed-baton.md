---
id: adr-0011
kind: decision
status: accepted
date: 2026-10-20
decision-makers: [maintainer]
verified_at: null
source_paths: [plugin/skills/**]
spec_sections: [skills]
---
# Skills call a globally installed `baton`

## Context and Problem Statement

Skills run the CLI, so they need a reliable way to reach it. Roadmap open question 5 asked how: a global install, `npx baton-ctx`, or a plugin `bin/` shim. `/checkpoint` and `/decide` already call bare `baton`.

## Considered Options

* Global install: `npm install -g baton-ctx`, skills call bare `baton`.
* `npx baton-ctx` in every skill.
* A plugin `bin/` shim that puts `baton` on the Bash tool's PATH.

## Decision Outcome

Chosen option: global install, and every skill calls bare `baton`.

* Plugin variables such as `CLAUDE_PLUGIN_ROOT` are not set inside the Bash tool, so a skill cannot locate the bundled `dist/baton.mjs` through them (implementation notes §1).
* A plugin that ships `bin/` is not installed by claude.ai/Cowork (implementation notes §2), which rules out the shim.
* `npx` adds a network round trip and install latency to every skill call, and fails offline.
* The MCP config can also start `baton mcp` through the same global binary.

### Consequences

* Good, because skills stay one line long, behave the same in a terminal and an agent, and do not depend on plugin internals.
* Bad, because this works for outside users only after the Phase 3 npm publish of `baton-ctx`. Until then dogfooding uses `npm link`, which puts the local build on PATH as `baton`.
