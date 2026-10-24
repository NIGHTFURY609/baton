---
id: adr-0015
kind: decision
status: accepted
date: 2026-10-20
decision-makers: [maintainer]
verified_at: "428730e2882f"
source_paths: [src/core/handoff.ts, src/hooks/**, src/cli.ts, plugin/hooks/hooks.json]
spec_sections: [handoff, hooks]
---
# Generated STATE.md and the Phase 1 hook handlers

## Context and Problem Statement

ADR 0005 places the handoff at PreCompact and SessionEnd. This record fixes what the handoff writes and how the hooks behave.

## Decision Outcome

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
* **Secrets.** STATE.md is committed, so every tool-call summary is cut to 80 characters of argument and passed through a secret redactor. Absolute paths outside the repo are shortened to `…/<file name>`, so home-folder paths do not reach git.
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
* Bad, because STATE.md is committed, so anything the redactor misses in a tool-call summary reaches git history.
