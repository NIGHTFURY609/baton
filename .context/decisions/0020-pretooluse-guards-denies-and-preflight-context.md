---
id: adr-0020
kind: decision
status: accepted
date: 2026-10-21
decision-makers: [maintainer]
verified_at: null
source_paths: [src/hooks/guards.ts, src/hooks/pre-tool-use.ts, plugin/hooks/hooks.json]
spec_sections: [hooks, decisions, tasks]
---
# PreToolUse guards: structured denies on protected state, preflight as context

## Context and Problem Statement

ADR 0008 fixes structured denies, guards on the shell as well as the edit tools, and accepts false positives. `docs/design/context-format.md` lists which files are CLI-owned. Implementation notes §1 record four facts: a deny reason reaches Claude while an ask reason reaches only the user; `additionalContext` sits alongside the tool result; Windows sessions have a `PowerShell` tool; file tools pass absolute paths.

## Decision Outcome

* **Matcher.** `Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell`, a plain list (ADR 0008).
* **Protected targets.**
  * `.context/STATE.md` (`baton handoff`), `.context/tasks.jsonl` and `.context/memories.jsonl` (`baton task`, `baton remember`), `.context/.cache/**`, and `.beads/**`.
  * The `.context/` directory itself, for shell commands only.
  * Decision records `.context/decisions/NNNN-*.md` with N ≥ 1:
    * creating a record file by hand is denied (use `baton decide`);
    * editing a record whose status is not `proposed` is denied;
    * a proposed record may be edited, except its frontmatter. For Write, Edit, `replace` and MultiEdit, the guard applies the edit to the record's current text (honouring `replace_all`) and denies it when the frontmatter block would change. That covers `status`, `supersedes` and `verified_at`. An apply_patch is denied when a changed line touches `status`, `supersedes`, `verified_at`, `id` or `kind`;
    * a shell write to any decision record is denied.
  * For edit tools, `decisions/0000-template.md` and every other file are not protected. Shell mentions are matched as text, so any decision-record path a shell command writes is denied.
* **Paths.** An edit-tool path is resolved against the hook's `cwd`, with `\` changed to `/`, and compared with the project root case-insensitively on Windows. An edit-tool path outside the project is never protected. A shell mention is matched as text wherever it points.
* **The shell heuristic** (`src/hooks/guards.ts`) works segment by segment, after splitting on `&&`, `||`, `;`, `|`, `&` and newlines. A protected path counts as written when it is:
  * the target of a redirection (`>`, `>>`, `&>`; `2>&1` is not a file);
  * an argument of a write command: `rm`, `mv`, the destination of `cp`, `tee`, `sed -i`, `perl -i`, `truncate`, `touch`, `dd`, `ln`, `install`, `rsync`, `unlink`, `shred`; PowerShell `Set-Content`, `Add-Content`, `Out-File`, `Tee-Object`, `New-Item`, `Remove-Item`, `Move-Item`, `Copy-Item` (destination), `Clear-Content` and `Rename-Item`, and their aliases (including `clc`); `cmd` `del`, `erase`, `copy`, `move`, `ren`; and `git checkout|restore|rm|mv`, including with `git -C <dir>`;
  * named in a segment that also calls a file-write API (`writeFileSync`, `open(…, 'w')`, `WriteAllText`, the same cmdlet names inside a nested command);
  * or written by a nested `bash -c`, `sh -c`, `cmd /c` or `powershell -Command` string, one level deep, with the switch matched case-insensitively.

  Reads are allowed. Quoting is not parsed, and false positives are acceptable (ADR 0008).
* **The deny** is `permissionDecision: "deny"`, with a reason that names the CLI command to use instead. Never exit 2. `guards.protectState: false` turns denies off.
* **The deny log.** Each deny appends one line to `.context/.cache/guard.jsonl`: `{v: 1, ts, event: "deny", session, tool, rule, path}`, with no command text, so no secrets. It exists for the Phase 2 gate measurement.
* **Preflight.** These get non-blocking `additionalContext`:
  * an edit-tool target that matches `guards.preflightPaths`;
  * a shell command that adds a dependency, when its manifest matches `guards.preflightPaths`. The commands: `npm install|i|add <pkg>`, `pnpm|yarn|bun add`, `pip install <pkg>`, `uv add` and `poetry add`, `cargo add`, `go get`. `pip install -r <file>` and `pip install -e <path>` install what is already declared, so they do not count.
  * The `guards.preflightPaths` default, in the schema and in both `config.yaml` files, covers every manifest those commands change, plus lockfiles and `**/migrations/**`.

  The context lists the `decide --preflight` path relations for those files, and the `baton decide "<title>" --preflight --paths …` command.
  * It is not `ask`: an ask reason goes to the user, not the model, and it would interrupt every lockfile edit.
  * It is not `deny`: a dependency change is legitimate once it has been decided.
* **Budget.** < 150 ms.
  * A shell command that mentions no protected path and adds no dependency loads nothing beyond the guard module.
  * An edit loads the config.
  * Only preflight loads the section index.
* **Fail open** (ADR 0008): any error, including an invalid `config.yaml`, gives stderr and no deny.

### Consequences

* Good, because state files stay CLI-owned, for Windows paths and in PowerShell too, and a dependency change surfaces the decisions it touches.
* Bad, because the heuristic is bypassable, for example by a script file that writes STATE.md.
* Bad, because the body of a proposed record is still hand-written text.
