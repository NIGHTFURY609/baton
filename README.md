# baton

**A continuity layer for coding agents.** Every session starts with the smallest fresh brief, and nothing stale reaches the model.

> Status: **alpha (0.1.0).** Phases 1–2 are built: mission packet, handoff, drift, stats, init, decide, verify, compile and the hook guards, plus the task store and `baton explain` (also as `/baton explain`). Their dogfood gates are measured on real use after release. Not yet built (exit 3): the MCP adapter and `init --harness codex|gemini`. See [docs/roadmap.md](docs/roadmap.md).

## Install

Requires Node 22.13+ and git.

```bash
npm install -g baton-ctx      # the baton CLI
cd your-project
baton init                    # scaffolds .context/, AGENTS.md and CLAUDE.md
```

Then add the Claude Code plugin (hooks and skills):

```text
/plugin marketplace add NIGHTFURY609/baton
/plugin install baton@baton
```

In a project with a `.context/`, SessionStart injects the mission brief, PreCompact and SessionEnd rewrite `.context/STATE.md`, and PreToolUse blocks direct edits to the state files. In any other folder the hooks do nothing. Everyday use:

```bash
baton task ready          # what to work on next
baton mission             # the brief an agent sees at session start
baton verify <id>         # run a task's check and close it on success
baton stats               # tokens at session start, corrections, drift
```

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

Try a local build of the plugin in Claude Code. In a project that has a `.context/`, SessionStart injects the mission packet, PreCompact and SessionEnd **rewrite `.context/STATE.md`** (the committed handoff), PreToolUse denies direct edits to protected state, PostToolUse marks touched sections aging, and Stop runs the active task's check when `verify.onStop` is set. Anywhere else, including your home folder, the hooks do nothing:

```bash
claude --plugin-dir ./plugin
# or: /plugin marketplace add ./   then   /plugin install baton@baton
```

`plugin/dist/` is committed, because a marketplace install copies only `plugin/`. Run `npm run build` and commit `plugin/dist/` whenever `src/` changes.

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

1. `npm install && npm run build`.
2. `node dist/baton.mjs task ready`: the open backlog is in `.context/tasks.jsonl`.
3. Read [docs/roadmap.md](docs/roadmap.md) for the current phase and its gate.

## License

MIT. Portions adapted from Beads (MIT, Copyright (c) 2025 Beads Contributors); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
