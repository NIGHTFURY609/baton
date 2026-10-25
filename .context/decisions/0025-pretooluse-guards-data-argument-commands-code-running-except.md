---
id: adr-0025
kind: decision
status: "superseded by ADR-0026"
date: 2026-10-25
decision-makers: [NIGHTFURY609]
verified_at: "778f90fd5d67"
source_paths: ["src/hooks/guards.ts", "src/hooks/pre-tool-use.ts", "plugin/hooks/hooks.json"]
supersedes: "0020"
spec_sections: [hooks, decisions, tasks]
---
# PreToolUse guards: data-argument commands, code-running exceptions and scan caps

## Context and Problem Statement

ADR 0008 fixes structured denies, guards on the shell as well as the edit tools, and accepts false positives. `docs/design/context-format.md` lists which files are CLI-owned. Implementation notes §1 record four facts: a deny reason reaches Claude while an ask reason reaches only the user; `additionalContext` sits alongside the tool result; Windows sessions have a `PowerShell` tool; file tools pass absolute paths.

ADR 0020 scanned every shell segment for write-API names, which denied commit messages and searches that only name one (`git commit -m "fix writeFile race" -- … .context/tasks.jsonl`, `grep -rn writeFileSync .context/`). The Phase 2 fix stopped that scan in commands whose arguments are data. A review (task bt-2a8) found that the exemption also passed code those commands run: command and process substitution, PowerShell subexpressions, `git rebase --exec`, `git bisect run`, `git submodule foreach`, `git -c alias.x=!…` and `rg --pre`. The review also found that following nested substitutions without a bound let a deep enough command overflow the stack, so the hook failed open. This record carries ADR 0020 forward unchanged except for its shell heuristic bullet.

## Considered Options

* Keep the data-argument exemption, list the code-running exceptions, and cap depth and length so that the guard fails safe
* Scan every command for write-API names again, as ADR 0020 first read

## Decision Outcome

Chosen option: "Keep the data-argument exemption, list the code-running exceptions, and cap depth and length so that the guard fails safe". Commit messages and searches name write APIs every day, and these exceptions are the places where a data-argument command runs code. The caps keep a hostile command from making the guard slow or making it throw.

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
  * an argument of a write command: `rm`, `mv`, the destination of `cp`, `tee`, `sed -i`, `perl -i`, `truncate`, `touch`, `dd`, `ln`, `install`, `rsync`, `unlink`, `shred`; PowerShell `Set-Content`, `Add-Content`, `Out-File`, `Tee-Object`, `New-Item`, `Remove-Item`, `Move-Item`, `Copy-Item` (destination), `Clear-Content` and `Rename-Item`, and their aliases (including `clc`); `cmd` `del`, `erase`, `copy`, `move`, `ren`; and `git checkout|restore|rm|mv`, including with `git -C <dir>`. `git restore` counts only when it writes the working tree, not with `--staged` alone;
  * named in a segment that also calls a file-write API: `writeFileSync`, `open(…, 'w')`, php `file_put_contents` and `fopen(…, 'w')`, `WriteAllText`, and the same cmdlet names inside a nested command. This write-API scan runs in two kinds of command. The first is a script host (`node`, `deno`, `bun`, `python`, `perl`, `ruby`, `php`, `pwsh` …), though not baton's own `node …/baton.mjs`. The second is an unknown command, such as a PowerShell `[IO.File]::…` expression. The scan skips the **data-argument commands**, whose arguments are search patterns, messages or text to print: `git`, `sed`, `grep`, `egrep`, `fgrep`, `rg`, `findstr`, `Select-String`, `echo`, `printf`, `baton`, and the write commands above, whose real writes the other rules cover;
  * named in a data-argument command that runs code anyway. The write-API scan still applies there:
    * a segment holding a substitution outside single quotes: `$(…)`, backticks, process substitution `<(…)` or `>(…)`, PowerShell `@(…)`, or a `( … )` group or subexpression that starts a word;
    * `git rebase --exec|-x <cmd>` (option prefixes such as `--exe` and bundled short flags such as `-ix` included), `git bisect run …`, `git submodule foreach [-q|--quiet|--recursive] …`, and `git -c alias.<name>=!…` in any quoting;
    * `rg --pre <cmd>` / `--pre=<cmd>`, where every protected mention counts as written, because the preprocessor runs on each file searched;
  * or written by code the command runs: a nested `bash -c`, `sh -c`, `cmd /c` or `powershell -Command` string (the switch matched case-insensitively), the body of a substitution or group above, and the command text of a git exec form. Each of these is checked as a command of its own. A `{ … }` group is read through.

  Quoting is honoured only as far as it decides what runs:
  * Nothing inside single quotes is a substitution.
  * A quote after a backslash, or after the `/` a backslash is normalised to, opens nothing.
  * `$'…'` is read as unquoted.
  * For the Bash tool, but not the PowerShell tool, a backslash before `$` or a backtick makes it literal.
  * The body of a quoted heredoc (`<<'X'`, `<<"X"`, `<<\X`, `<<-'X'`) is dropped when its command reads it as data: `cat`, `head`, `tail`, `wc`, `sort`, `less`, `more`, or a data-argument command. A heredoc fed to a script host, a shell or an unknown command is still read as code.
  * Inside double quotes, `$(…)` and backticks are substitutions. So a double-quoted commit message that holds one next to a write-API name and a protected path is denied. This over-deny is deliberate, and single quotes avoid it.

  Two caps bound the cost, and both fail safe:
  * **Depth.** Code is followed at most 4 levels deep. Past that, if the remaining text names a write API, a write command or a redirection, every protected mention in it counts as written.
  * **Length.** A command longer than 16 KB (16 384 characters) is not scanned, and every protected path it mentions counts as written.

  Reads are allowed. False positives are acceptable (ADR 0008). The known gaps are listed in `.context/knowledge/harness-limits.md`.
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
* Good, because commit messages and searches that name a write API pass, while substitutions, git exec forms and `rg --pre` are still checked.
* Good, because no command can make the shell scan throw or run unbounded: the depth and length caps deny instead.
* Bad, because the heuristic is bypassable, for example by a script file that writes STATE.md.
* Bad, because a double-quoted message holding `$(…)` or backticks next to a write-API name and a protected path is denied. So is a PowerShell backtick escape in the same position, and so is any command over 16 KB that mentions a protected path, even one that only reads it.
* Bad, because the body of a proposed record is still hand-written text.

## More Information

Preflight at creation (baton decide): 9 constraining, 5 related, 1 possibly related.

* constrains: ADR 0001 (accepted) "Record decisions as MADR 4.0 in .context/decisions/" (spec: decisions)
* constrains: ADR 0005 (accepted) "Write the full handoff at PreCompact; SessionEnd does a fast write" (path: plugin/hooks/hooks.json)
* constrains: ADR 0008 (accepted) "Hooks run as exec-form node, fail open, and guard the shell too" (path: src/hooks/guards.ts; spec: hooks)
* constrains: ADR 0009 (accepted) "Native task store ported from Beads: JSONL in git, SQLite cache" (spec: tasks)
* constrains: ADR 0014 (accepted) "Mission packet assembly" (spec: tasks)
* constrains: ADR 0018 (accepted) "decide: MADR lifecycle, supersede by status, and preflight" (spec: decisions)
* constrains: ADR 0019 (accepted) "verify closes a task on passing checks and a non-empty diff; opt-in Stop gate" (spec: tasks)
* constrains: ADR 0021 (accepted) "Uncommitted source changes age sections; PostToolUse notices touched sections" (spec: hooks)
* constrains: ADR 0024 (accepted) "Shell tool-call summaries show only allowlisted words" (path: src/hooks/guards.ts; spec: hooks)
* related: ADR 0020 (accepted) "PreToolUse guards: structured denies on protected state, preflight as context" (path: src/hooks/guards.ts; spec: hooks, decisions, tasks; keyword: pretooluse, guards; replaced by this decision)
* related: spec hooks "Hooks" (path: src/hooks/guards.ts; spec: hooks)
* related: spec tasks "Tasks" (spec: tasks)
* related: spec decisions "Decisions" (spec: decisions)
* related: knowledge knowledge-harness-limits "Harness limits that bite" (path: src/hooks/guards.ts)
* possibly related: rule rules-commands "Commands" (keyword: commands)
