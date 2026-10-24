---
id: adr-0002
kind: decision
status: accepted
date: 2026-10-16
decision-makers: [maintainer]
verified_at: "428730e2882f"
source_paths: [package.json, tsup.config.ts]
spec_sections: []
---
# TypeScript on Node 22, one package, bundled with tsup

## Context and Problem Statement

The CLI, hooks and MCP adapter must share one implementation (the CLI is the only write path), start fast enough to run on every session start and guarded tool call, and install easily on macOS, Linux and Windows.

## Considered Options

* TypeScript / Node, single package
* Python (uv/pipx, FastMCP)
* Go single binary

## Decision Outcome

Chosen option: "TypeScript / Node, single package", because it matches the MCP TypeScript SDK and the Claude Code plugin ecosystem, installs with npm/npx everywhere, and Node is already present wherever these harnesses run.

* The build bundles everything into `dist/baton.mjs` (tsup, ESM). The MCP SDK sits in a lazily imported chunk so hooks do not parse it (~75 ms no-op hook vs ~170 ms when it was eager).
* The build copies `dist/` into `plugin/dist/` so the plugin runs without a global install.
* npm name: `baton` and `baton-cli` are taken; the package is `baton-ctx`, the binary is `baton`.
* Tooling: Biome (lint + format), Vitest, `tsc --noEmit` for types.

### Consequences

* Good, because one language covers CLI, hooks, MCP and tests.
* Bad, because cold start is slower than a Go binary; the performance budget in docs/design/architecture.md keeps this honest.
