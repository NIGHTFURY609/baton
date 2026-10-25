---
id: adr-0019
kind: decision
status: accepted
date: 2026-10-21
decision-makers: [maintainer]
verified_at: "3bbe17408dd2"
source_paths: [src/core/verify.ts, src/commands/verify.ts, src/commands/task.ts, src/hooks/stop.ts, src/core/config.ts]
spec_sections: [tasks]
---
# verify closes a task on passing checks and a non-empty diff; opt-in Stop gate

## Context and Problem Statement

The spec's `tasks` section says a task is done only when `baton verify` runs its check and the check passes, and that no proof string from the model is accepted. Roadmap open question 4 asks whether a non-empty diff is required by default. `.context/config.yaml` already carries `verify.requireDiff: true`.

## Decision Outcome

* **Checks.**
  * Every `check:<command>` label of the task runs, in label order, in the project root.
  * The command runs through Node's `spawn` with `shell: true`: `cmd.exe` on Windows, `/bin/sh` elsewhere. Output is streamed.
  * Every check must exit 0. The first failure stops the run.
  * A task without a `check:` label cannot be verified (exit 1).
* **Open question 4, resolved: yes.** With `verify.requireDiff: true` (the default), the task needs a non-empty diff since it was started (`started_at`, else `created_at`).
  * The diff is the files changed in commits made after the second in which the task was started (git stores whole-second committer times, so a commit in that same second is not counted), plus the files with uncommitted changes now.
  * `.context/tasks.jsonl`, `.context/memories.jsonl`, `.context/STATE.md` and `.context/.cache/**` are ignored, so the claim's own write never counts.
  * `--no-diff`, or `requireDiff: false`, skips the rule, for tasks such as investigations.
  * Why: a check like `npm run check` also passes on an untouched tree, so exit 0 alone would let an agent close a task it never did.
* **Order.** The diff is checked first, because it is cheap; then the checks run.
* **Exit codes.**
  * 0: closed, or already closed (nothing is run).
  * 2: a failed check or an empty diff; the task stays open.
  * 1: an unknown task, no `check:` label, or no git repository while the diff rule is on.
  * 3: a non-native task backend.
* **Closing.** Through the task service, with the reason `verified: <commands joined "; ">`. The close rules (open children, open blockers) still apply, with exit 2.
* **`task close` on a checked task.** `baton task close` refuses (exit 2) a task that has a `check:` label unless `--force` is given. A forced close records its reason as `forced (check not run): <reason>`. Tasks without a `check:` label close as before. Only `verify` closes a checked task without `--force`.
* **stats.** A successful Bash call of `baton verify <id>` counts as a close, like `task close` (extends ADR 0016).
* **Stop gate,** opt-in with `verify.onStop: true` (default `false`).
  * Its "active task" is the most recently started task that is in progress, not an epic, assigned to the current actor, and has a `check:` label.
  * It runs that task's checks with a 540 s timeout. If one fails, it returns `decision: "block"` with the failing command and the last 1,500 characters of its output.
  * It never closes a task: stopping to ask a question is not "done".
  * It does nothing when `stop_hook_active` is true (Claude Code's loop guard), or when the diff rule finds nothing yet.
  * It is wired in `plugin/hooks/hooks.json` with `timeout: 600`. A disabled gate costs one node start per stop.

### Consequences

* Good, because "done" means a command passed on a changed tree, decided by baton, not by the model.
* Bad, because a task whose work landed before it was claimed needs `--no-diff`.
* Bad, because checks run in the platform shell, so a label written for `sh` may fail under `cmd.exe`.
* Bad, because the gate can still be sidestepped by swapping labels (`task update --remove-labels "check:…"`) or by `task close --force`. The native store keeps no change history, so a label swap is visible only in the git history of `.context/tasks.jsonl`. A forced close keeps `forced` in its close reason.
