---
id: adr-0024
kind: decision
status: accepted
date: 2026-10-25
decision-makers: [NIGHTFURY609]
verified_at: "510c16911c7b"
source_paths: ["src/core/handoff.ts", "src/core/transcript.ts", "src/hooks/**", "src/cli.ts", "plugin/hooks/hooks.json"]
supersedes: "0023"
spec_sections: [handoff, hooks]
---
# Shell tool-call summaries show only allowlisted words

## Context and Problem Statement

ADR 0023 keeps the shell tool-call summaries in the committed STATE.md to command names only. A review (task bt-bk4) found its text and the code apart in two places: the code shows the action of a `baton task` or `baton hook` call as a second word (`baton task close bt-vyr.2`), where ADR 0023 documents `baton <sub> [task-id]`, and a bare wrapper such as `time` showed as `(assignment)`, which ADR 0023 reserves for environment assignments. The same review found tokenizer gaps that let argument words through: escaped quotes, backtick substitution, unlisted git global options that take a value, and any kebab-case word after any baton subcommand taken as a task id. This record carries ADR 0023 forward unchanged except for its Secrets rule, which now says exactly which words a summary may show.

## Considered Options

* Show a known action of baton's task and hook groups
* Show `baton task (+N args)` only, as ADR 0023's text reads

## Decision Outcome

Chosen option: "Show a known action of baton's task and hook groups", because the action (`close`, `update`, `show`) is what the next session needs from a baton call, and a word taken from a fixed list cannot carry a secret.

* **Frontmatter.** `id`, `kind`, `verified_at`, `source_paths`, `generated_by`, `generated_at` and `reason`.
  * `verified_at` is HEAD (12 characters) at generation time.
  * `source_paths: []`, because STATE does not age by commits. `mission` reports the commits since generation instead.
* **Body layout.** A `# State` title, one "Last handoff" line, then `## Summary`, `## In progress`, `## Ready next`, `## Recently closed`, `## Blocked`, `## Working tree`, `## Diff stat` and `## Recent tool calls`.
* **Sources.**
  * The task store: in progress, 5 ready, the 5 most recently closed, blocked tasks and open epics.
  * `git --no-optional-locks status --porcelain` and `git --no-optional-locks diff HEAD --stat`, both excluding `.context/STATE.md` itself. Without `--no-optional-locks`, a hook could take the index lock from a live session.
  * The last 10 tool calls from the session transcript: the hook's `transcript_path`, else `--transcript`, else the newest transcript of this project.
  * Lists are capped at 30 status lines and 30 stat lines.
* **Idempotent.** When the new text equals the file on disk apart from `generated_at` and the "Last handoff" timestamp, nothing is written.
* **Secrets.** STATE.md is committed, so a shell tool call (`Bash`, `PowerShell`, Gemini's `run_shell_command`) is summarised by command names only; its arguments are never written.
  * Each simple command of the first line shows its name and `(+N args)`. The only other words shown come from fixed lists: `git <sub>` after git's known global options (an unknown global option hides the subcommand), `npm run <script>`, and `baton <command> [<action>] [task-id]`. `<command>` is one of baton's commands, `<action>` one of the actions of the `task` or `hook` group, and a task id is shown only after a command that takes one (`verify`, `task show`, `update`, `close`, `reopen`, `delete`, `comment`) and only when the word has the task id shape.
  * The first line is read up to 1024 characters, with the tool's grammar: Bash, PowerShell, or for `run_shell_command` both, which must agree or the line shows as `(expression)`. Quotes, escaped characters (Bash `\` outside single quotes, PowerShell's backtick) and groups (`( )`, `{ }`, `$( )` also inside double quotes, Bash backticks and `[[ ]]`) are never split; an unclosed one runs to the end of the line, and a comment or PowerShell's `--%` ends the scan. Every doubt keeps more text inside one word, so a summary can only say less.
  * A simple command made only of environment assignments shows as `(assignment)`. Assignments and the wrappers `sudo`, `env`, `command`, `nohup` and `time` before a command name are skipped; a wrapper with no command after it shows its own name. A command word that is not a plain name, such as a quoted string or a PowerShell expression, shows as `(expression)`.
  * The remaining free text (file paths, search patterns, sub-agent descriptions) is still cut to 80 characters and passed through the secret redactor as defence in depth. Absolute paths outside the repo are shortened to `…/<file name>`, so home-folder paths do not reach git.
* **Task lists.** Epics appear only under "Open epics", never among the in-progress or ready tasks.
* **Writing.** Atomic (temp file + rename), with LF line endings.
* **Hooks.**
  * `session-start` (all four matchers, including `compact`) injects the mission packet.
  * `pre-compact` runs the handoff with reason `pre-compact` and a 256 KiB transcript tail.
  * `session-end` runs it with reason `session-end` or `session-end:<reason>`, and a 64 KiB tail, so it fits Codex's 1 s default.
  * All three are no-ops when the project has no `.context/`. `pre-compact` and `session-end` print nothing.
  * Errors fail open (ADR 0008).
* **Fast path.** `src/cli.ts` routes `baton hook <event>` straight to the dispatcher, without building the full CLI program, and handlers load core modules with dynamic `import()`. The reason, measured in implementation notes §1: the full bundle costs about 90 ms over bare node on Windows, against a 150 ms pre-tool-use budget.
* **BOM.** Hook stdin parsing strips a leading UTF-8 BOM.

### Consequences

* Good, because STATE never depends on recollection, and repeated handoffs do not churn git.
* Good, because every word a shell summary shows besides a command name comes from a fixed list or has the task id shape.
* Bad, because a shell summary no longer says which files or values a command touched: shell arguments never reach STATE.md, so the next session sees `git commit (+4 args)`, not the message.
* Bad, because the baton and git word lists in src/core/transcript.ts follow the CLIs by hand; a baton command missing from them shows as `baton (+N args)`, which says less, never more.

## More Information

Preflight at creation (baton decide): 6 constraining, 5 related, 1 possibly related.

* constrains: ADR 0005 (accepted) "Write the full handoff at PreCompact; SessionEnd does a fast write" (path: src/hooks/**; spec: handoff)
* constrains: ADR 0008 (accepted) "Hooks run as exec-form node, fail open, and guard the shell too" (path: src/hooks/**; spec: hooks; keyword: shell)
* constrains: ADR 0016 (accepted) "stats metric definitions and snapshots" (path: src/core/transcript.ts)
* constrains: ADR 0019 (accepted) "verify closes a task on passing checks and a non-empty diff; opt-in Stop gate" (path: src/hooks/**)
* constrains: ADR 0020 (accepted) "PreToolUse guards: structured denies on protected state, preflight as context" (path: src/hooks/**; spec: hooks)
* constrains: ADR 0021 (accepted) "Uncommitted source changes age sections; PostToolUse notices touched sections" (path: src/hooks/**; spec: hooks)
* related: ADR 0023 (accepted) "STATE.md shell tool-call summaries keep command names only" (path: src/core/handoff.ts; spec: handoff, hooks; keyword: shell, tool, call, summaries; replaced by this decision)
* related: spec handoff "Handoff" (path: src/core/handoff.ts; spec: handoff)
* related: spec hooks "Hooks" (path: src/hooks/**; spec: hooks)
* related: spec measurement "Measurement" (path: src/core/transcript.ts)
* related: knowledge knowledge-harness-limits "Harness limits that bite" (path: src/hooks/**)
* possibly related: ADR 0011 (accepted) "Skills call a globally installed baton" (keyword: call)
