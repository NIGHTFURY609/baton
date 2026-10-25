---
id: adr-0023
kind: decision
status: "superseded by ADR-0024"
date: 2026-10-25
decision-makers: [NIGHTFURY609]
verified_at: "5ddb64b22419"
source_paths: ["src/core/handoff.ts", "src/hooks/**", "src/cli.ts", "plugin/hooks/hooks.json"]
supersedes: "0015"
spec_sections: [handoff, hooks]
---
# STATE.md shell tool-call summaries keep command names only

## Context and Problem Statement

ADR 0015 fixes what the generated STATE.md holds and how the Phase 1 hooks behave. Its "Secrets" rule keeps up to 80 characters of every shell command's arguments and relies on a secret redactor. Each review of that redactor found another argument shape it missed (`mysql -pW@ter123`, `curl -u user:pass`, `ConvertTo-SecureString` literals, `zip -P`), and STATE.md is committed, so a miss reaches git history. On 2026-10-25 the maintainer decided that shell summaries keep command names only. This record carries ADR 0015 forward unchanged except for that rule.

## Considered Options

* Command names only: the command name, an allowlisted subcommand word and an argument count
* Keep arguments and extend the redactor for each new shape

## Decision Outcome

Chosen option: "Command names only: the command name, an allowlisted subcommand word and an argument count", because an argument that is never written cannot leak, while a redactor of free-form arguments is only as good as its last missed shape.

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
* **Secrets.** STATE.md is committed, so a shell tool call (`Bash`, `PowerShell`, Gemini's `run_shell_command`) is summarised by command names only. Each simple command of the first line shows its name, plus the first subcommand word for an allowlist (`git <sub>`, `npm run <script>`, `baton <sub> [task-id]`), plus `(+N args)`; its arguments are never written. Environment assignments show as `(assignment)` and anything that is not a plain command name, such as a quoted string or a PowerShell expression, as `(expression)`. The remaining free text (file paths, search patterns, sub-agent descriptions) is still cut to 80 characters and passed through the secret redactor as defence in depth. Absolute paths outside the repo are shortened to `…/<file name>`, so home-folder paths do not reach git.
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
* Bad, because a shell summary no longer says which files or values a command touched: shell arguments never reach STATE.md, so the next session sees `git commit (+4 args)`, not the message.

## More Information

Preflight at creation (baton decide): 5 constraining, 4 related, 1 possibly related.

* constrains: ADR 0005 (accepted) "Write the full handoff at PreCompact; SessionEnd does a fast write" (path: src/hooks/**; spec: handoff)
* constrains: ADR 0008 (accepted) "Hooks run as exec-form node, fail open, and guard the shell too" (path: src/hooks/**; spec: hooks; keyword: shell)
* constrains: ADR 0019 (accepted) "verify closes a task on passing checks and a non-empty diff; opt-in Stop gate" (path: src/hooks/**)
* constrains: ADR 0020 (accepted) "PreToolUse guards: structured denies on protected state, preflight as context" (path: src/hooks/**; spec: hooks; keyword: state)
* constrains: ADR 0021 (accepted) "Uncommitted source changes age sections; PostToolUse notices touched sections" (path: src/hooks/**; spec: hooks)
* related: ADR 0015 (accepted) "Generated STATE.md and the Phase 1 hook handlers" (path: src/core/handoff.ts; spec: handoff, hooks; keyword: state; replaced by this decision)
* related: spec handoff "Handoff" (path: src/core/handoff.ts; spec: handoff)
* related: spec hooks "Hooks" (path: src/hooks/**; spec: hooks)
* related: knowledge knowledge-harness-limits "Harness limits that bite" (path: src/hooks/**)
* possibly related: ADR 0011 (accepted) "Skills call a globally installed baton" (keyword: call)
