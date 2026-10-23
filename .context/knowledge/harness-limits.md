---
id: knowledge-harness-limits
kind: knowledge
verified_at: null
source_paths: [plugin/hooks/**, src/hooks/**]
---
# Harness limits that bite

Short list for whoever touches hooks. Sources and verification status: docs/research/2026-10-16-implementation-notes.md.

- SessionStart context > 10,000 chars is replaced by a file path + 2,000-char preview. Budget in chars.
- SessionEnd: 1.5 s shared budget in Claude Code unless a hook sets `timeout`; Codex 1 s default, 3 s max.
- PostCompact output never reaches the model; re-inject with the SessionStart `compact` matcher.
- Matchers with regex characters are unanchored regexes (`Edit.*` matches `NotebookEdit`). Use `A|B|C` lists.
- Exit 1 does not block anything; only exit 2 or a structured decision does.
- `CLAUDE_PLUGIN_ROOT` changes on every plugin update and is not set in the Bash tool. Persist state in the repo or `CLAUDE_PLUGIN_DATA`.
- Transcripts are deleted after 30 days by default; snapshot what stats needs.
- One API response appears as several transcript lines with identical usage; de-duplicate on (message.id, requestId).
- Exec-form hooks run unchanged on Windows with `${CLAUDE_PLUGIN_ROOT}` expanded to a mixed-separator path, with or without spaces (simulated by scripts/hook-smoke.mjs, not yet seen in a live session); medians were about 90 ms for pre-tool-use and 360 ms for session-start.
