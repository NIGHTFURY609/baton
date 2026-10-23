# baton

**A continuity layer for coding agents.** Every session starts with the smallest fresh brief, and nothing stale reaches the model.

> Status: **pre-alpha, Phase 0 (dogfood).** The task store (`baton task`, `baton remember`) and `baton explain` (plain-language explanations of a file, dependency or concept, also as `/baton explain`) work. The continuity commands (`mission`, `handoff`, `drift`, …) are scaffolded with their contract and still exit with code 3 ("not implemented"). See [docs/roadmap.md](docs/roadmap.md).

## Why

Coding agents forget last session's decisions, re-establish patterns and drift. More always-loaded docs make it worse: context rots, and a stale doc is worse than none. baton does five things existing tools don't do together:

1. **Section-level freshness.** Every section of the project's context docs is pinned to the commit it was last verified at and the source paths that could make it wrong. Stale sections are withheld, not injected.
2. **A budgeted mission packet.** One brief per session (state, ready tasks, the spec sections and decisions tagged to them), under a hard character budget, injected by a SessionStart hook.
3. **Hook-generated handoffs.** STATE.md is rebuilt from the task store and git at PreCompact and SessionEnd, not written from the model's memory at 80% context.
4. **A built-in task store.** Structured tasks with dependencies, a ready queue and atomic claims, ported from [Beads](https://github.com/gastownhall/beads) (MIT) and stored as JSONL in git. No extra tool to install.
5. **Honest numbers.** `baton stats` reads the session log and reports tokens at session start, corrections and drift caught. If the numbers don't move, the project stops.

Research and evidence: [docs/research/2026-10-15-research-report.md](docs/research/2026-10-15-research-report.md).

## How it fits together

Skills, hooks and an optional MCP adapter are three entry points into one CLI, which is the only thing that writes state. State lives in `.context/` in git.

```
skills (/baton /init-spec /checkpoint /handoff /decide /doc-audit) ─┐
hooks  (SessionStart · PreCompact · SessionEnd · PreToolUse)       ─┼─▶ baton CLI ─▶ .context/  task store  git  session log
MCP    (mission · decide · verify · search, optional)              ─┘
```

Details: [architecture](docs/design/architecture.md) · [.context/ format](docs/design/context-format.md) · [metrics](docs/design/metrics.md) · [platform facts](docs/research/2026-10-16-implementation-notes.md).

## Development

Requires Node 22.13+ and git.

```bash
npm install
npm run check          # lint + typecheck + tests
npm run build          # dist/baton.mjs, copied into plugin/dist/
node dist/baton.mjs --help
```

Try the plugin in Claude Code (hooks are safe no-ops for now):

```bash
claude --plugin-dir ./plugin
# or: /plugin marketplace add ./   then   /plugin install baton@baton-dev
```

### Tasks

```bash
node dist/baton.mjs task ready                      # what to work on next
node dist/baton.mjs task update bt-xyz --claim      # take it (atomic)
node dist/baton.mjs task create "Fix X" -p 1 --spec freshness --check "npm test"
node dist/baton.mjs task close bt-xyz -r "done"
node dist/baton.mjs remember "Hooks use exec-form node on Windows"
```

Tasks live in `.context/tasks.jsonl` (committed); a SQLite index in `.context/.cache/` rebuilds itself. Format and rules: [context format → task store](docs/design/context-format.md#the-task-store). Importing from Beads: `bd export > beads.jsonl && baton task import beads.jsonl`.

### Repository layout

| Path | What |
|---|---|
| `src/` | CLI (`commands/`), core logic (`core/`), hook dispatcher (`hooks/`), MCP adapter (`mcp/`) |
| `test/` | Vitest unit tests and fixtures |
| `plugin/` | Claude Code plugin: manifest, `hooks/hooks.json`, `skills/`, built `dist/` |
| `templates/` | What `baton init` scaffolds into a project |
| `.context/` | baton's own continuity state (dogfooding): spec, rules, ADRs, STATE, knowledge |
| `docs/` | Research, design docs, roadmap |
| `scripts/` | Build helpers, skill validator |

### First steps after cloning

1. `git init && git add -A && git commit -m "Scaffold baton"`.
2. `npm run build`, then `node dist/baton.mjs task ready` — the Phase 0 and Phase 1 backlog is already in `.context/tasks.jsonl`.
3. Start the Phase 0 baseline in [docs/roadmap.md](docs/roadmap.md).

## License

MIT. Portions adapted from Beads (MIT, Copyright (c) 2025 Beads Contributors); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
