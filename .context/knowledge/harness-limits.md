---
id: knowledge-harness-limits
kind: knowledge
verified_at: "428730e2882f"
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
- Exec-form hooks run unchanged on Windows with `${CLAUDE_PLUGIN_ROOT}` expanded to a mixed-separator path, with or without spaces (simulated by scripts/hook-smoke.mjs, not yet seen in a live session); medians were about 90 to 115 ms for pre-tool-use and 360 to 475 ms for session-start.
- PreToolUse `deny` reasons reach the model; `ask` reasons reach only the user. Deny, never ask, when the model must change course.
- Stop: `decision: "block"` keeps Claude working. Skip when `stop_hook_active` is true; Claude Code ends the turn after 8 blocks in a row anyway.
- Windows sessions have a `PowerShell` tool as well as `Bash`; guard both.
- The shell guard (`src/hooks/guards.ts`) reads the command text and does not parse quotes. Known gaps it leaves open, most likely first for a cooperative agent:
  - a `cd .context` in an earlier call, then a relative `rm STATE.md` (the shell's cwd persists between calls);
  - formatters given explicit paths (`prettier --write ".context/**/*.md"`);
  - `find .context/.cache -delete`;
  - over-deny: a `sed` regex such as `.c[…]` reads as a glob mention, and so does a mention of another repo's `.context/`;
  - `>|`, `patch X < d`, `cp -t .context/ x`, `cp -r backup/.context .`, `git stash push -- …` and `git apply`;
  - script APIs it does not name: pathlib `write_text`, `WriteAllTextAsync`, `[IO.File]::Create`, `os.removedirs`;
  - path spellings: MSYS `/n/...`, 8.3 short names (`CONTEX~1`), UNC admin shares;
  - quote splicing and globs: `.con""text`, `rm -rf .*`, `.?ontext`, `.[c]ontext`, `*context`.
  Formatters are the likeliest real-world hit: excluding `.context/` from `.prettierignore` and the Biome ignores (a candidate for `baton init` to add) closes that gap.
