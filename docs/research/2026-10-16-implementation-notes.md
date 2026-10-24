# Implementation notes: platform facts baton depends on

Follow-up research pass (2026-10-16) to the [research report](2026-10-15-research-report.md). The report decided *what* to build; this file records the concrete harness facts the code relies on, with how well each one is verified. When a fact here changes, update the code that cites it and the ADR that depends on it.

**Status key:** ✅ official docs · 🟡 community source, issue tracker or observed behaviour · ❓ unverified, check before relying on it

## Five findings that changed the design

| Finding | Status | Consequence | Recorded in |
|---|---|---|---|
| Claude Code caps SessionStart `additionalContext` (and plain stdout) at **10,000 characters**. Over the cap, the text is saved to a file and the model sees only a path plus a 2,000-char preview, without being told to read it. | ✅ | Packet budget is in **characters**, default 9,000, hard max 10,000. | ADR 0004, `src/core/config.ts` |
| SessionEnd hooks share a **1.5 s** budget in Claude Code (raised by a per-hook `timeout`, max 60 s); Codex gives SessionEnd **1 s by default, 3 s max**. | ✅ | The full handoff runs at **PreCompact**; SessionEnd does a fast deterministic write with an explicit timeout. | ADR 0005 |
| PostCompact output is only shown on screen, not to the model. | ✅ | Re-inject the packet with the SessionStart **`compact`** matcher. | `plugin/hooks/hooks.json` |
| Claude Code reads `AGENTS.md` natively (v2.1.277+), **but only when no CLAUDE.md exists** in the cwd or above. | ✅ | Keep a one-line `CLAUDE.md` containing `@AGENTS.md` so both files load. | ADR 0006 |
| An edit-only PreToolUse guard is bypassed by `sed -i` or `>` through the shell tool. | ✅ | Guards cover `Bash` / `run_shell_command` with a heuristic as well. | `src/hooks/guards.ts` |

## 1. Claude Code hooks

Sources: [hooks reference](https://code.claude.com/docs/en/hooks) (the English page truncated in fetch; later sections read from the [zh-CN mirror](https://code.claude.com/docs/zh-CN/hooks)).

- **Events baton uses:** SessionStart, PreCompact, SessionEnd, PreToolUse, PostToolUse, Stop. ✅ (33 events exist in total, including TaskCreated/TaskCompleted, which are a cleaner way to observe native Tasks than reading their files.)
- **Matchers:** SessionStart `startup | resume | clear | compact | fork`; PreCompact `manual | auto`; SessionEnd `clear | resume | logout | prompt_input_exit | other`; tool events match tool names. ✅
- **Matcher syntax gotcha:** a string made only of letters, digits, `_ - , |` and spaces is an exact list; anything else is an **unanchored** JS regex, so `Edit.*` also matches `NotebookEdit`. Use plain lists. ✅
- **Common stdin:** `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `permission_mode`, plus `agent_id`/`agent_type` inside subagents. `transcript_path` is written asynchronously and can lag; on Stop prefer `last_assistant_message`. ✅
- **Per event:** SessionStart `source` (+ `context_tokens` etc. on resume) ✅; PreToolUse `tool_name`, `tool_input`, `tool_use_id` ✅; PreCompact `trigger`, `custom_instructions` 🟡; SessionEnd `reason` ✅; Stop `last_assistant_message` ✅, `stop_hook_active` ✅ (true while Claude Code is already continuing because of a stop hook).
- **Exit codes:** `0` success (stdout parsed as JSON only if it is one JSON object; plain stdout becomes context only for SessionStart/UserPromptSubmit); `2` blocks (stderr is the reason) for PreToolUse, UserPromptSubmit, Stop, PreCompact; **any other code is a non-blocking error**, so exit 1 never blocks. ✅ baton's dispatcher fails open (exit 0) on its own errors.
- **JSON output:** `hookSpecificOutput.{hookEventName, additionalContext, permissionDecision: allow|deny|ask|defer, permissionDecisionReason, updatedInput}`, top-level `decision: "block"`, `reason`, `systemMessage`, `continue`. ✅
- **PreToolUse decisions:** `permissionDecisionReason` is shown to Claude for `deny`; to the user for `ask` (Claude reads it only in a `-p` run, where nobody can answer the prompt); and only written to the debug log for `allow` and `defer`. `hookSpecificOutput.additionalContext` is added to Claude's context alongside the tool result (ignored with `defer`). ✅ An `additionalContext` with no `permissionDecision` leaves the normal permission flow unchanged: 🟡 inferred from the reference, not yet observed. → ADR 0020
- **Tool inputs:** `tool_input.file_path` is always absolute for the file tools. Write carries `content`; Edit carries `old_string`, `new_string` and `replace_all`. ✅ MultiEdit (`edits[]`) and NotebookEdit fields are not in the reference ❓; baton reads `edits[].old_string`/`new_string` and `notebook_path` when they are present.
- **PowerShell tool:** Claude Code on Windows has a `PowerShell` tool whose `tool_input` matches Bash (`command`, `description`, `timeout`, `run_in_background`). The reference's matcher example is `Bash|PowerShell`. ✅ It also appeared in the Claude Code tool list of the planning session on the Windows build machine, 2026-10-21 🟡. → PreToolUse matches `Bash|PowerShell` (ADR 0020)
- **PostToolUse:** runs after a tool succeeded. Its input carries `tool_input` and `tool_response`. `hookSpecificOutput.additionalContext` reaches Claude next to the tool result; `decision: "block"` adds `reason` beside the result. ✅ → ADR 0021
- **Stop:** the input adds `stop_hook_active`, `last_assistant_message`, `background_tasks` and `session_crons`. `decision: "block"` with a required `reason` keeps Claude working. After 8 consecutive continuations Claude Code overrides the next block and ends the turn (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`). Stop has no matcher support. ✅ → ADR 0019
- **SessionStart context** is wrapped in a system reminder; docs advise **factual statements, not imperative commands**, because command-style text can trip prompt-injection defences. ✅ The packet is written as facts ("Active task: …", "Section X is aging: …").
- **Execution:** all matching hooks run in parallel; default command timeout 600 s; `args` gives exec form without a shell. ✅
- Exec form `node ${CLAUDE_PLUGIN_ROOT}/dist/baton.mjs hook <event>`, with the variable expanded to a Windows path (mixed separators, `N:\...\plugin/dist/baton.mjs`) and to a path containing spaces (`...\baton smoke xxxx\plugin root/dist/baton.mjs`): all five hooks pass the functional checks (`scripts/hook-smoke.mjs`, `npm run smoke:hooks`). PreCompact and SessionEnd are each checked for their own write: before every run the script restores the post-init `STATE.md` (which lacks `generated_by: baton handoff`) and then asserts the marker is back. Measured medians of 5 runs, repo path / spaced path, in ms: SessionStart 462 / 475, PreCompact 405 / 446, SessionEnd 391 / 425, PreToolUse 110 / 114 (budget 150), PostToolUse 113 / 111 (budget 150); `baton mission` on this repo 527 and `baton handoff --dry-run` 368 (budget 1000 each). Every budget was met under `--strict-timing`. An earlier run on a quieter machine measured PreToolUse 86 / 91 and SessionStart 358, so expect about 25% run-to-run spread. 🟡 simulated (variable expanded by the script), 2026-10-24, Windows 11 10.0.26200, Node v22.16.0. Not yet observed in a live Claude Code session (follow-up task; `node scripts/hook-smoke.mjs --inspect-transcript <file>` reads the result from a transcript).
- `claude plugin validate ./plugin`: ✅ "Validation passed" (headless, no API call). One non-blocking directory warning: ICON_MISSING (no plugin icon).
- Linux: CI runs `npm run smoke:hooks` on `ubuntu-latest` and `windows-latest` (timing warn-only). 🟡 until a CI run is observed. WSL not available as a Linux check on the build machine: its Node is v18.19.1 (< 22.13), so the smoke script was not run there. (Had it run, WSL would not follow this worktree's `.git` file, which points at an `N:/` path, so `mission`/`handoff` timings would have measured the no-git path.)
- **Env:** `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT` (changes on every plugin update — never write state there), `CLAUDE_PLUGIN_DATA` (persists), `CLAUDE_ENV_FILE` (SessionStart). Plugin vars are **not** set inside the Bash tool. ✅
- Windows PowerShell 5.1 prefixes a UTF-8 BOM when it pipes a string into a native command's stdin, so hook stdin parsing strips a leading BOM. 🟡 observed 2026-10-20 (Windows 11, PowerShell 5.1).
- Process start on Windows 11 (Node 22.16), median of 7 runs: bare `node -e 0` 53 ms; `node dist/baton.mjs --version` 142 ms; the no-op `hook pre-tool-use` 144 ms; one `git log` about 55 ms. The 150 ms pre-tool-use budget has almost no headroom while the full CLI loads, hence the hook fast path (ADR 0015). 🟡 observed 2026-10-20.
- Phase 2 hooks, exec form, both plugin roots (simulated `${CLAUDE_PLUGIN_ROOT}`), median of 5 runs, medians identical within noise across the two roots: PreToolUse deny Edit 354 ms, deny Bash 364 ms, deny PowerShell 363 ms, preflight 406 ms, ordinary-file Edit 354 ms, ordinary Bash 194 ms; PostToolUse notice 274 ms; Stop no-op 345 ms; on this repo, PreToolUse 371 ms and PostToolUse 401 ms. All functional checks pass, but every PreToolUse/PostToolUse case misses the 150 ms budget on this run (task bt-u75). The machine was slow during the run: bare `node -e 0` took 120 ms and `node dist/baton.mjs --version` 360 ms, against 53 and 142 ms in the Phase 1 measurement above, so the numbers are roughly 2.5x Phase 1 and the ratio, not the absolute figure, is the signal. 🟡 observed 2026-10-24, Windows 11 10.0.26200, Node v22.16.0; not yet observed in a live Claude Code session.

## 2. Claude Code plugins

Sources: [manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference), [marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference).

- Layout: `.claude-plugin/plugin.json` (only `name` required, kebab-case), `skills/<name>/SKILL.md`, `hooks/hooks.json` (same shape as the settings `hooks` object), `.mcp.json`, `bin/` (added to the Bash tool's PATH; claude.ai/Cowork will not install plugins that ship `bin/`). ✅
- A `CLAUDE.md` at the plugin root is **not** loaded. ✅
- Plugin skills are invoked as `/plugin-name:skill-name`. A plugin skill whose frontmatter `name` is set is also invocable bare unless another command uses that name ([skills docs](https://code.claude.com/docs/en/skills)). ✅ Bare `/baton` for a skill whose `name` equals its folder name: 🟡 not yet observed — the 2026-10-21 build ran headless; confirm with `claude --plugin-dir ./plugin` then `/baton explain commander --as caveman` (fallback `/baton:baton …`). Tracked as `bt-w2a`.
- Marketplace: `.claude-plugin/marketplace.json` with `name`, `owner`, `plugins[{name, source: "./plugin"}]`. ✅
- Local testing: `claude --plugin-dir ./plugin`, `claude plugin validate ./plugin [--strict]`, or `/plugin marketplace add ./` then `/plugin install baton@baton-dev`. ✅

## 3. Agent Skills (SKILL.md)

Sources: [agentskills.io spec](https://agentskills.io/specification), [Claude Code skills](https://code.claude.com/docs/en/skills), [Codex skills](https://learn.chatgpt.com/docs/build-skills), [Gemini CLI skills](https://geminicli.com/docs/cli/skills/).

- `name`: 1–64 chars, `[a-z0-9-]`, no leading/trailing/double hyphen, **must equal the folder name**. `description`: 1–1024 chars. Optional spec keys: `license`, `compatibility`, `metadata`, `allowed-tools`. ✅ Enforced by `npm run validate:skills`.
- Body under ~500 lines / 5k tokens; references one level deep. ✅
- Non-spec keys (Claude Code extras like `when_to_use`) are a **hard error** outside Claude Code, so baton's skills use spec keys only. ✅
- Discovery: Claude Code `.claude/skills` and plugin `skills/`; Codex `.agents/skills` (walks up to repo root) and `~/.agents/skills`; Gemini CLI `.gemini/skills` or `.agents/skills`. ✅ Cursor ❓.

## 4. Claude Code session transcript (for `baton stats`)

Sources: [.claude directory](https://code.claude.com/docs/en/claude-directory), a live v2.1.300 transcript, [ccusage](https://www.mintlify.com/ryoppippi/ccusage).

- Path: `~/.claude/projects/<cwd with every non-alphanumeric char replaced by "-">/<session-id>.jsonl`; subagents under `<session-id>/subagents/`. Deleted after `cleanupPeriodDays` (default 30) — **stats must snapshot what it needs into `.context/.cache/`**. ✅ Honour `CLAUDE_CONFIG_DIR` 🟡.
- Usage lives on `assistant` records at `message.usage.{input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens}`. ✅ (observed)
- **De-duplicate on `(message.id, requestId)`**: one API response is written as several lines (one per content block) repeating the same usage. ✅ (observed; ccusage does the same) — implemented in `src/core/transcript.ts`.
- `tool_use` blocks live in assistant content; `tool_result` blocks in **user** records. ✅
- Compaction: `type: "system", subtype: "compact_boundary"` with `compactMetadata`, and a user message with `isCompactSummary: true`. 🟡 Parse unknown types leniently.
- Hook activity is written as `type: "attachment"` records. `attachment.type` is one of: `hook_additional_context` (`hookEvent`, plus `content: string[]` holding the additionalContext verbatim); `hook_success` (`hookName` such as `SessionStart:startup`, `command`, `stdout`, `stderr`, `exitCode`, `durationMs`); or `hook_non_blocking_error` (the same fields, for a non-zero exit). 🟡 observed in v2.1.301 transcripts, 2026-10-20.
- The project folder name is the encoded cwd, with the drive-letter case of the session that created it. The main checkout's folder here is `n--coding-projects-a-skills` (created from VS Code, cwd `n:\…`), although a CLI cwd encodes as `N--coding-projects-a-skills`. NTFS is case-insensitive, so a project has one folder, but its case may differ from `encodeProjectDir(cwd)`. Record `cwd` fields vary in the same way. `stats` and `handoff` match the folder case-insensitively on Windows. 🟡 observed 2026-10-20.
- `Read` tool calls carry `input.file_path` as an absolute native path (backslashes on Windows). 🟡 observed.

## 5. Codex CLI and Gemini CLI

- **Codex hooks** ([docs](https://learn.chatgpt.com/docs/hooks.md)) ✅: on by default; `~/.codex/hooks.json`, `<repo>/.codex/hooks.json` or `config.toml [hooks]`; same JSON shape as Claude Code. Events include SessionStart (`startup|resume|clear|compact|fork`), PreToolUse (shell as `Bash`, `apply_patch`, MCP tools), PreCompact, Stop, SessionEnd. Project hooks run only in trusted projects and are trusted by hash after `/hooks` review.
- **Gemini CLI hooks** ([reference](https://geminicli.com/docs/hooks/reference/)) ✅: `.gemini/settings.json`; events SessionStart, SessionEnd, BeforeTool, AfterTool, AfterAgent, PreCompress; timeouts in **milliseconds**; deny with top-level `decision: "deny"`; SessionStart context via `hookSpecificOutput.additionalContext`. Edit tools: `write_file`, `replace`; shell: `run_shell_command`. Whether hooks need an enable flag ❓.
- **AGENTS.md:** Codex concatenates root→cwd, capped at 32 KiB by default ✅; Gemini reads GEMINI.md and can be pointed at AGENTS.md via `context.fileName` ✅.

## 6. MCP

- Spec **2026-07-28** is current (stateless core; JSON Schema 2020-12 tool schemas). 🟡
- TypeScript SDK v2: `@modelcontextprotocol/server` 2.3.x — `new McpServer(...)`, `server.registerTool(name, {description, inputSchema: z.object(...)}, handler)`, `serveStdio(factory)` from `@modelcontextprotocol/server/stdio`. ✅ verified against the installed package; `src/mcp/server.ts` answers `initialize` and `tools/list`.

## 7. Task stores

**Decision (ADR 0009):** baton ports the needed subset of Beads into its own TypeScript store instead of requiring `bd`. Source studied: gastownhall/beads at `b911ed28c`; Beads is Dolt-only since 0.51/0.58, having dropped its original SQLite + JSONL-sync design. baton keeps JSONL as the only truth and SQLite as a rebuildable cache, so there is no two-way sync. Verified locally: 40 concurrent `task create` processes → 40 unique ids, no lost writes; 20 concurrent claims of one task → exactly one winner; 20 concurrent `ready --claim` → no duplicates; hand-edited JSONL and a deleted cache are picked up. `node:sqlite` works unflagged on Node ≥ 22.13 but prints an ExperimentalWarning, which baton suppresses. ✅

Notes on Beads itself, kept for the optional `beads` backend:


- **Beads** ([repo](https://github.com/steveyegge/beads)) ✅: `npm install -g @beads/bd` (1.3.x) or brew; `bd init`, `bd create "Title" -p 1 -t task`, `bd ready --json`, `bd update <id> --claim`, `bd close <id> "reason"`, `bd prime`, `bd setup claude`. Storage is Dolt (`.beads/`); `issues.jsonl` is an export. Exact `bd ready --json` shape ❓ — the adapter accepts a bare array or `{issues: [...]}` and both `type`/`issue_type`.
- **Claude Code Tasks** 🟡: `~/.claude/tasks/<list-id>/<n>.json`, format undocumented; `CLAUDE_CODE_TASK_LIST_ID` is undocumented and overwritten by interactive sessions (closed as not planned). Treat as read-only, best effort; prefer TaskCreated/TaskCompleted hooks. → ADR 0007 (proposed).

## 8. MADR 4.0

Source: [adr.github.io/madr](https://adr.github.io/madr/) ✅. Frontmatter `status`, `date`, `decision-makers`, `consulted`, `informed`; sections Context and Problem Statement → Decision Drivers → Considered Options → Decision Outcome (Consequences, Confirmation) → Pros and Cons → More Information. Files `NNNN-title-with-dashes.md`. **No `supersedes` field** — supersession is the status string; baton adds `supersedes` and `spec_sections` as its own extension (ADR 0001).

## 9. Landscape re-check (Oct 2026)

The gap the report identified still looks open: nothing found combines section-level `verified_at` SHA + `source_paths`, a hook-injected character-budgeted packet, and handoffs generated from task store + git.

| Tool | Closest overlap | Differs from baton |
|---|---|---|
| ActiveMemory ctx | `ctx agent --budget`, `.context/`, PreToolUse hook | No per-section SHA provenance found |
| **Agents Remember** (3.0.0rc) | Notes checked against source commits, path scopes or fingerprints | Per-file mirror notes, not spec sections; no budgeted packet — **the one to differentiate against** ([listing](https://mcpservers.org/es/servers/foxfire1st/agents-remember)) |
| ctxharness, driftlint | Commit-churn freshness scores | File-level only, no injection policy |
| GSD | STATE.md, `/gsd:resume-work` | Percentage targets, no SHA freshness |
| Conductor | Spec/plan tracks | No freshness or handoff |

Not re-verified: drift-ai and bettermemory did not resolve to identifiable current projects in this pass; the report's citations stand as of 2026-10-15.

## 10. Node and git behaviour that verify relies on

- `child_process.spawn(command, { shell: true })` runs `cmd.exe /d /s /c` on Windows and `/bin/sh -c` elsewhere, so a `check:` label runs in the platform shell. ✅ [Node child_process docs](https://nodejs.org/api/child_process.html#shell-requirements). → ADR 0019
- `git log --since=<n>` reads a number of 9 or more digits as Unix seconds (git `date.c`, `match_digit`). baton passes whole seconds and keeps only commits whose `%ct` is strictly greater than the start second. 🟡 observed: the `changedFilesSince` test in `test/verify-core.test.ts` passed on 2026-10-24.
