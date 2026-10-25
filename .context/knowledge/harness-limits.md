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
- Exec-form hooks run unchanged on Windows with `${CLAUDE_PLUGIN_ROOT}` expanded to a mixed-separator path, with or without spaces (simulated by scripts/hook-smoke.mjs, not yet seen in a live session). Phase 2 medians (2026-10-25): pre-tool-use on ordinary Bash about 125 ms, but about 270 to 290 ms on any path that loads the config (in-repo Edit, deny, preflight), and session-start about 450 ms; the config load is the cost that misses the 150 ms budget (bt-u75).
- PreToolUse `deny` reasons reach the model; `ask` reasons reach only the user. Deny, never ask, when the model must change course.
- Stop: `decision: "block"` keeps Claude working. Skip when `stop_hook_active` is true; Claude Code ends the turn after 8 blocks in a row anyway.
- Windows sessions have a `PowerShell` tool as well as `Bash`; guard both.
- The shell guard (`src/hooks/guards.ts`, ADR 0026) reads the command text; it tracks quotes and escapes on the raw text only to find the code a command runs inline. Known gaps it leaves open, most likely first for a cooperative agent:
  - a `cd .context` in an earlier call, then a relative `rm STATE.md` (the shell's cwd persists between calls);
  - formatters given explicit paths (`prettier --write ".context/**/*.md"`);
  - `find .context/.cache -delete`;
  - over-deny: a `sed` regex such as `.c[…]` reads as a glob mention, and so does a mention of another repo's `.context/`;
  - over-deny, by choice: a substitution outside single quotes turns the write-API scan on for its whole segment, so a double-quoted message such as `git commit -m "scan $(…) for writeFileSync" -- .context/tasks.jsonl` is denied (bash runs that substitution); single quotes, `\$(`, or the message heredoc `git commit|tag / gh / echo / printf … "$(cat <<'EOF' … EOF)"` keep it allowed. Any other quoted heredoc body is read as code, so `cat <<'EOF'` or `git commit -F - <<'EOF'` with a body that quotes `` `rm .context/STATE.md` `` is denied. A command over 16 KB, or one whose scan passes the 64 KiB work budget, is denied when it mentions a protected path, and so is protected text more than 4 substitution levels deep next to a write command (bt-2a8);
  - over-deny: a multi-line double-quoted `-m` message is split into segments at its newlines, so a body line that starts with a write command or names a write API next to a protected path reads as a command (`git commit -m "fix: x⏎⏎rm .context/STATE.md is now denied." -- .context/tasks.jsonl`); PowerShell here-string messages (`git commit -m @'⏎…⏎'@`, or `$msg = @'…'@` then `-m $msg`) behave the same; the message heredoc form above avoids it;
  - fail-open on machine-built input: the raw-text heredoc and here-string scanner is outside the 64 KiB work budget and has no depth cap, so about 22 nested unquoted heredocs (`rm .context/STATE.md; echo $(cat <<A⏎…`, about 250 chars) take over 5 s or exhaust memory, and about 2000 nested `<<'A'` or 4250 PowerShell `@'` here-strings throw a RangeError; each lets the command run (bt-6yv);
  - a `;` inside a `node -e` or `php -r` script splits the path from the write call (`node -e "const p='.context/STATE.md'; fs.writeFileSync(p,'x')"`);
  - bash 5.3 `${ …; }` command substitution;
  - paths read from stdin or a file list: `cat <<'EOF' | xargs rm`, `xargs rm < list.txt`;
  - `>|`, `patch X < d`, `cp -t .context/ x`, `cp -r backup/.context .`, `git stash push -- …` and `git apply`;
  - script APIs it does not name: pathlib `write_text`, `WriteAllTextAsync`, `[IO.File]::Create`, `os.removedirs`;
  - code git or sed runs from elsewhere: an alias set earlier with `git config alias.x '!…'`, `git -c core.pager|core.editor|core.sshCommand|diff.external=…`, `git filter-branch --tree-filter`, `git difftool --extcmd`, `find -exec`, and the `sed` `e` command (`rebase --exec`, `bisect run`, `submodule foreach`, `-c alias.*=!…` and `rg --pre` are guarded);
  - path spellings: MSYS `/n/...`, 8.3 short names (`CONTEX~1`), UNC admin shares;
  - quote splicing and globs: `.con""text`, `rm -rf .*`, `.?ontext`, `.[c]ontext`, `*context`.
  Formatters are the likeliest real-world hit: excluding `.context/` from `.prettierignore` and the Biome ignores (a candidate for `baton init` to add) closes that gap.
