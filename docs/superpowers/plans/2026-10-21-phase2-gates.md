# Phase 2 · Gates: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Task 1 creates the extra task-store items this plan needs. Every task claims its item first (`node dist/baton.mjs task update <id> --claim`). Tasks 1–6 close their item with `node dist/baton.mjs task close <id>`. From Task 7 on, items close with `node dist/baton.mjs verify <id>`, the command this plan builds. **Controllers:** give each implementer the Global Constraints and Review Focus sections together with its task text. Every task restates the contracts it consumes, so it can be done without reading other tasks.

**Goal:** Build the Phase 2 deliverables from `docs/roadmap.md`:
- `decide`: MADR records, supersede chains, spec-conflict flags, `--preflight` (exit 2 on conflict);
- `verify <task> [--no-diff]`: runs the task's `check:` commands and closes it only on exit 0 and, by default, a non-empty diff;
- PreToolUse denies on protected state (edit tools, Bash and PowerShell), plus preflight on dependency and migration files;
- PostToolUse notices for touched sections, and sections with uncommitted source changes counted as aging;
- opt-in Stop verification;
- `compile` and `compile --check` in CI.

The skills that fall back while `decide` and `verify` exit 3 switch to the real commands. The last task stamps the new sections and regenerates STATE.md with `baton handoff`.

**Architecture:** As in Phase 1, logic lives in `src/core/` as pure functions plus small IO wrappers, and commands stay thin. Hook handlers live in their own `src/hooks/*.ts` modules. `dispatch.ts` loads them with dynamic `import()`, and the Phase 1 hook fast path keeps `pre-tool-use` and `post-tool-use` under 150 ms. Data flow:
- **Decisions:** `decisions.ts` (record format) → `preflight.ts` (pure relations over the Phase 1 section index) → `decide.ts` (IO) → `commands/decide.ts`. The PreToolUse handler calls the same `preflight`.
- **Verify:** `verify.ts` (check runner, diff rule, active task) → `commands/verify.ts` and `hooks/stop.ts`.
- **Guards:** `hooks/guards.ts` (pure classifier) → `hooks/pre-tool-use.ts`.
- **Aging:** `drift.ts` (`evaluateFreshness` also reads `git status`) → `drift`, `mission` and `explain`. `hooks/post-tool-use.ts` sends the in-session notice.
- **Compile:** `compile.ts` → `commands/compile.ts` and CI. It reuses `renderAgentsMd` from Phase 1's `init.ts`.

**Tech Stack:** TypeScript (ESM, Node ≥ 22.13), commander 15, yaml 2, zod 4, the native task store, vitest 5, Biome 2, tsup. No new dependencies.

**Spec:** `.context/spec.md`, sections `decisions`, `tasks`, `hooks`, `freshness`, `context-format` and `skills`. Also `docs/roadmap.md` (Phase 2 bullets: the acceptance bar), `docs/design/architecture.md` (command contract rows `decide`, `verify`, `compile`; hook wiring rows `pre-tool-use`, `post-tool-use`, `stop`; performance budget), `docs/design/context-format.md`, ADRs 0001–0017, and `docs/research/2026-10-16-implementation-notes.md` §1.

**Starting state:** The plans run one after another in this worktree:
1. the explain side track (done);
2. the Phase 1 MVP (`docs/superpowers/plans/2026-10-20-phase1-mvp.md`, Tasks 1–21, ADRs 0012–0017), complete before Task 1 here;
3. this plan;
4. Phase 3.

Every Phase 1 interface used below is cited as "Phase 1 Task N" and restated where it is consumed. Phase 2's starting state is "Phase 1 plan fully implemented as written". Phase 1 Tasks 1–3 had already landed when this plan was reviewed, and their citations here were checked against the code:
- ADRs 0012–0017;
- `src/core/sections.ts` (`loadSectionIndex`, `ContextDoc`, `AdrInfo`, `IndexedSection`, `SectionIndex`, `supersededByFromStatus`; decisions are read through `ADR_FILE_RE`);
- `test/helpers/repo.ts` (`REPO_ROOT`, `CONTEXT_FIXTURE`, `makeTempDir`, `writeFiles`, `runGit`, `commitAll`, `makeRepo`, `stampFixture`).

**Roadmap open questions:**
- Q4, "Should `verify` require a non-empty diff by default?", is resolved here: yes, with `--no-diff` to opt out (ADR 0019, Task 1).
- Q1–Q3 stay open; this plan does not touch them.

**Phase gates:** The user waived the gates for the build.
- Task 1 replaces the `bt-vyr blocks bt-s9g` link with a `related` link, so Phase 2 work shows as ready and the history stays traceable.
- Task 1 also creates the gate measurement "no direct state edits in 10 sessions" as a human task (`bt-vyr.18`). It has no check and stays open after this plan.

**Not in this plan:**
- The optional code-graph MCP for `decide --preflight`.
- Codex and Gemini hook wiring (`init --harness`), the MCP tools, and publishing (all Phase 3).
- A `stats` metric for guard denies. Task 9 writes `.context/.cache/guard.jsonl` for the human gate measurement; reading it in `stats` is a later task.
- Rules-file targets other than `AGENTS.md` and `CLAUDE.md` (a spec non-goal: rulesync-class sync engines).

## Global Constraints

- **Starting state.** Phase 1 is fully implemented (its Tasks 1–21), and every interface it declares under **Interfaces → Produces** exists. If a Phase 1 interface a task restates differs from the code, stop and report; do not adapt silently.
- **Layering.**
  - `src/core/` never imports from `commands/`, `hooks/` or `mcp/`. Commands stay thin.
  - Hook handler modules statically import only light modules: `src/hooks/guards.ts`, `src/hooks/io.ts`, `src/core/glob.ts`, `src/core/paths.ts`, `src/core/decisions.ts`, `src/core/errors.ts` and Node built-ins. Everything else (config, section index, preflight, verify, drift) is loaded with `await import()` inside the handler body.
  - Do not touch `src/program.ts`: `decide`, `verify`, `compile` and `hook` are already registered.
- **Exit codes.** 0 ok, 1 error, 2 check failed or blocked, 3 not implemented. Throw `new BatonError(message, ExitCode.X)` (`src/core/errors.ts`); `action()` in `src/commands/_shared.ts` maps it to stderr plus `process.exitCode`. Hooks always exit 0. Only a structured deny (PreToolUse) or block (Stop) changes agent behaviour (ADR 0008).
- **Checks.**
  - `npm run check` (Biome, `tsc --noEmit`, vitest) passes at the end of every task.
  - Any task that changes `src/` or `templates/` runs `npm run build` before closing its item, so `dist/` and `plugin/dist/` stay in sync.
  - Skill tasks also run `npm run validate:skills`.
- **TypeScript.** `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on. Set optional properties only when you have a value; never assign `undefined`. ESM imports use `.js` suffixes.
- **No new runtime dependencies.**
- **Hand-edit rules.**
  - Never hand-edit `.context/tasks.jsonl`, `.context/memories.jsonl` or `.context/STATE.md`. Use `baton task …`, `baton remember …` and `baton handoff`.
  - Never edit an existing ADR (0001–0017).
  - ADRs 0018–0021 are new hand-written files (Tasks 1–2) that copy the shape of `.context/decisions/0008-hooks-exec-form-fail-open.md`.
  - After Task 5, decision files are created and change status only through `node dist/baton.mjs decide`. The one allowed hand edit is replacing the `{…}` placeholders in the body of a proposed record that `decide` created (Task 14). Never touch decision frontmatter.
  - `.context/spec.md`, `.context/rules.md`, `.context/knowledge/*.md` and `.context/config.yaml` are ordinary files.
  - **Never write the word "commander"** in any text that ends up under `.context/`: ADRs, `rules.md` (and so the compiled `AGENTS.md`), spec, knowledge, and task titles, descriptions and comments. The explain dogfood test asserts that no `.context/` text mentions that dependency.
- **Explain files.** Do not touch `src/core/explain/**`, `src/commands/explain.ts`, `plugin/skills/baton/**`, `test/explain-*.test.ts` or `test/helpers/explain-fixture.ts`.
- **Windows.**
  - Every file read that is parsed first strips one leading UTF-8 BOM, then normalises CRLF to LF: `text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")`.
  - Repo paths are POSIX.
  - Tool inputs can carry backslashes, either drive-letter case and mixed separators (`N:\repo/.context\STATE.md`).
  - Path comparisons against the project root are case-insensitive on `win32` only. Functions that compare paths take a `platform` parameter (default `process.platform`), so tests can pin it.
- **Writes under `.context/`.**
  - Regenerated files use `writeFileAtomic(path, text)` (sync, temp file + rename, from `src/core/tasks/native/jsonl.ts`), with LF endings.
  - The append-only cache logs use `appendFile`, one JSON line per event, and are never committed: `drift.jsonl` (Phase 1), `guard.jsonl` (Task 9) and `touched.jsonl` (Task 11).
  - New ADR files are written with exclusive create (`writeFileSync(path, text, { flag: "wx" })`).
  - A rewrite of an existing ADR changes only its `status:` and `verified_at:` lines, and keeps the file's BOM and line endings.
- **Stamps.** `verified_at` is the first 12 hex characters of HEAD, always double-quoted (Phase 1, ADR 0012).
- **Tests.**
  - Temp dirs come only from `makeTempDir()` or `makeRepo()` in `test/helpers/repo.ts` (Phase 1 Task 3). Loading that module sets `GIT_CEILING_DIRECTORIES` to the OS temp folder, because this machine's home folder (`C:/Users/jeswi`) is a git repo. A dir that must count as "no project" gets `runGit(dir, "init", "-q")` first.
  - Tests that touch tasks set `process.env.BATON_ACTOR = "tester"`.
  - Tests never write this repo's `.context/`; dogfood tests only read it.
  - Tests that `process.chdir` restore the cwd in `finally`.
  - Commands that tests run in a shell (`check:` labels, `runCheck`) are `node -e "<script>"`, with the script in double quotes and no `$` or `%`, so they behave the same under `cmd.exe` and `/bin/sh`.
  - Each bullet in a test list that builds a fixture (`verifyTask`, `verify` command, Stop hook, PreToolUse, PostToolUse) is its own `it`, with a fresh `makeRepo()`, unless the bullet says it continues the previous one.
- **Expected-text blocks.** A fenced block inside a list item is indented for markdown only. That indentation is not part of the expected text: each expected line starts at the block's left edge.
- **Hook budgets.** Median wall time on the built CLI, measured by `scripts/hook-smoke.mjs` (Phase 1 Task 18, extended in Task 13): `pre-tool-use` and `post-tool-use` < 150 ms; the other events < 1000 ms. vitest timing checks stay loose (< 3000 ms).
- **Closing items.**
  - Claim first: a claim sets the task's `started_at`, and `verify`'s diff rule starts there.
  - From Task 7 on, close with `node dist/baton.mjs verify <id>`, after `npm run build` and **before** the commit, so the uncommitted work is the diff. `verify` runs `npm run check` again: allow up to 10 minutes, and set the shell tool's `timeout` to 600000 ms for that command.
  - If `verify` exits 2, the task is not done. Fix it and run `verify` again. Never use `--no-diff` or `task close` instead, unless the task says so.
  - From Task 7 on, `task close` refuses a task that has a `check:` label unless `--force` is given, and a forced close records `forced (check not run)` in its reason (ADR 0019). No step in this plan forces a close.
- **Live hooks.** If this session loaded the baton plugin (`claude --plugin-dir ./plugin`), its hooks run the code you build after every `npm run build`. No step in this plan edits a protected file directly. If you see a deny, its reason names the baton command to use: use that command. Do not work around the guard, and do not set `guards.protectState: false`.
- **Commits.** End each task with a path-scoped commit: `git add <paths>`, then `git commit -m "<message>" -- <paths>`, with the same paths both times, always including `.context/tasks.jsonl`. Never `git add -A` or a bare `git commit`. Commits carry **no attribution trailers** (no `Co-Authored-By` lines).
- **Free-text arguments.** These contain none of `>`, `;`, `|` or `&`: commit messages, `--reason`, task titles, `-d` descriptions, task comments and `decide` titles and texts. The shell guard splits commands on those characters and does not parse quotes, so a message such as `"x; move y"` could otherwise be misread as a write to the paths after it.
- **Task ids.** This plan assumes the ids in the Task-store map. If Task 1 recorded different printed ids (in a comment on `bt-vyr`), use those.

## Review Focus

1. **The shell guard is precise on Windows and on this plan's own commands.**
   - Task 8's table tests must deny:
     - backslash and `cmd.exe`-style redirects (`echo x>.context\STATE.md`);
     - PowerShell cmdlets and aliases (`Set-Content`, `Out-File`, `Add-Content`, `Remove-Item`), from both the `Bash` and the `PowerShell` tools;
     - a `cp` destination, `sed -i`, `perl -pi`, `tee`, `mv`, `rm -rf .context`, and `git checkout -- <protected>`;
     - inline-script writes (`node -e "…writeFileSync('.context/STATE.md'…"`);
     - an upper-cased path.
   - They must allow `git add` and `git commit -- .context/tasks.jsonl`, reads, copying *from* a protected file, and every `node dist/baton.mjs …` call.
   - Task 9 proves that the real handler denies an absolute `<root>\.context\STATE.md` and a forward-slash variant of it, from hook stdin.
2. **Decision records stay append-only.**
   - Task 3 pins the record rendering, `statusOf`, `setFrontmatterField` and the placeholders.
   - Task 5 proves:
     - accept and supersede change only the `status:` and `verified_at:` lines, byte for byte, keeping BOM and CRLF;
     - a proposed successor never touches the old record;
     - placeholders block `--accept`;
     - an already-superseded record cannot be superseded.
   - Task 4 derives the chain from `supersedes`, so a missed status write still reads as superseded.
   - Task 8 replays an Edit or MultiEdit on the current text and denies any change to a proposed record's frontmatter, including `{ old_string: "proposed", new_string: "accepted" }` and `replace_all`.
3. **`verify` cannot be gamed.**
   - Task 6:
     - the claim's own `tasks.jsonl` write never counts as a diff;
     - only commits in a strictly later second than `started_at` count (committer time), so the fixture's `init` commit, or the previous task's commit, never counts;
     - every `check:` label runs, and a failure leaves the task open;
     - a check that times out is killed with its whole process tree.
   - Task 7: exit codes; `stats` counts `baton verify` as a close; `task close` on a checked task needs `--force`.
   - Task 12: the Stop gate never closes a task, does nothing when `stop_hook_active` is set, and skips a task with no diff.
4. **Hooks stay fast, quiet and fail open.**
   - Task 9: an ordinary shell command loads no config; the section index loads only for preflight; a broken config means stderr and no deny.
   - Task 11: one notice per section per session.
   - Task 10: uncommitted aging leaves every Phase 1 fixture result unchanged.
   - Task 13 measures the budgets on the built CLI on both plugin roots.
5. **One rules source.**
   - Task 14: `compile` uses init's renderer, so `init` followed by `compile --check` passes; more than 60 lines is refused; other `CLAUDE.md` content is kept.
   - Task 15: this repo's `AGENTS.md` keeps all its content once generated from `rules.md`, CI runs `compile --check`, and a dogfood test fails when the two drift.

---

## Decisions in this plan

| ADR | Title | Written | Task |
|---|---|---|---|
| 0018 | decide: MADR lifecycle, supersede by status, and preflight | by hand | 1 |
| 0019 | verify closes a task on passing checks and a non-empty diff; opt-in Stop gate | by hand | 1 |
| 0020 | PreToolUse guards: structured denies on protected state, preflight as context | by hand | 2 |
| 0021 | Uncommitted source changes age sections; PostToolUse notices touched sections | by hand | 2 |
| 0022 | compile writes AGENTS.md and the CLAUDE.md import from rules.md | **with `baton decide`** (dogfood) | 14 |

## File structure

| File | Responsibility | Task |
|---|---|---|
| `.context/decisions/0018-…` – `0021-…` | Phase 2 decisions (by hand) | 1, 2 |
| `src/core/decisions.ts` | + record rendering, placeholders, status parsing, ADR refs | 3 |
| `src/core/preflight.ts` | Pure relations between a proposed change and `.context/` | 4 |
| `src/core/sections.ts` | + the supersede chain derived from `supersedes` | 4 |
| `src/core/decide.ts` | Create, accept, supersede, list; record rewrites | 5 |
| `src/commands/decide.ts` | Thin command | 5 |
| `src/core/git.ts` | + `changedFilesSince` | 6 |
| `src/core/verify.ts` | Check runner, diff rule, `verifyTask`, `activeTask` | 6 |
| `src/commands/verify.ts`, `src/commands/task.ts` (`export toBatonError`; `task close` needs `--force` on checked tasks) | Thin command, and the close rule | 7 |
| `src/core/stats.ts` | `baton verify <id>` counts as a close | 7 |
| `src/hooks/guards.ts` | Pure classifier: protected targets, frontmatter replay, shell writes, dependency commands | 8 |
| `src/hooks/pre-tool-use.ts`; `src/core/config.ts` + both `config.yaml` files (`guards.preflightPaths` defaults) | Deny, preflight context, deny log | 9 |
| `src/core/drift.ts`, `src/commands/drift.ts` (the verify-doc note) | Uncommitted source changes make a fresh section aging | 10 |
| `src/hooks/post-tool-use.ts`, `src/hooks/io.ts` | Touched-section notice and its dedupe log | 11 |
| `src/hooks/stop.ts`, `src/core/config.ts` | Opt-in Stop gate (`verify.onStop`) | 12 |
| `src/hooks/dispatch.ts`, `plugin/hooks/hooks.json` | Handler wiring and matchers | 9, 11, 12 |
| `scripts/hook-smoke.mjs` | Phase 2 cases and budgets | 13 |
| `.context/decisions/0022-…` (via `decide`), `src/core/compile.ts`, `src/commands/compile.ts` | compile | 14 |
| `.context/rules.md`, `AGENTS.md`, `.github/workflows/ci.yml` | This repo's generated AGENTS.md, and CI | 15 |
| `plugin/skills/{decide,checkpoint,init-spec,doc-audit}/SKILL.md`, `templates/context/rules.md` | Skills call the real commands | 16 |
| `docs/design/*.md`, `docs/roadmap.md`, `README.md` | Docs | 2, 17 |

## Task-store map

Task 1 creates `bt-vyr.5`–`bt-vyr.18`, in this order. If `task create` prints different ids, Task 1 records the mapping in a comment on `bt-vyr`, and every later task uses the printed ids.

| Plan task | Item | Plan task | Item |
|---|---|---|---|
| 1–2 ADRs, design docs | bt-vyr.5 (new) | 10 Uncommitted aging | bt-vyr.10 (new) |
| 3 Record format | bt-vyr.6 (new) | 11 PostToolUse notices | bt-vyr.11 (new) |
| 4 Preflight | bt-vyr.7 (new) | 12 Stop gate | bt-vyr.12 (new) |
| 5 `decide` | bt-vyr.1 | 13 Hook smoke | bt-vyr.13 (new) |
| 6 verify core | bt-vyr.8 (new) | 14 `compile` | bt-vyr.4 |
| 7 `verify` | bt-vyr.2 | 15 Generated AGENTS.md + CI | bt-vyr.14 (new) |
| 8 Guard classifier | bt-vyr.9 (new) | 16 Skills | bt-vyr.15 (new) |
| 9 PreToolUse handler | bt-vyr.3 | 17 Docs | bt-vyr.16 (new) |
| — | — | 18 Stamp + STATE | bt-vyr.17 (new) |

`bt-vyr.18` (gate measurement, human) and the epic `bt-vyr` stay open after Task 18.

---

### Task 1: Decisions I: ADRs 0018–0019, task-store items, harness facts

Item `bt-vyr.5` (created here). These choices are load-bearing, so they get ADRs before any code. Everything below was decided while writing this plan; transcribe it.

**Files:**
- Create: `.context/decisions/0018-decide-madr-lifecycle-supersede-and-preflight.md`
- Create: `.context/decisions/0019-verify-closes-on-passing-checks-and-a-diff.md`
- Modify: `docs/research/2026-10-16-implementation-notes.md` (§1; a new §10)
- Modify: `.context/knowledge/harness-limits.md` (append three bullets; leave the frontmatter alone)
- Task store, through the CLI only → `.context/tasks.jsonl`
- Read first: `.context/decisions/0008-hooks-exec-form-fail-open.md` (the shape to copy), `.context/decisions/0001-record-decisions-as-madr.md` (supersession lives only in the status string), `.context/decisions/0012-section-index-and-verify-doc-stamps.md` (the "ADR stamps" bullet: a frontmatter metadata write through the CLI)

**Interfaces:**
- Consumes: `node dist/baton.mjs task create|dep add|dep remove|comment|update` (existing CLI; `task create` prints `created <id>: <title>`).
- Produces: `adr-0018` and `adr-0019`; items `bt-vyr.5` … `bt-vyr.18`.

**ADR frontmatter** (both; `source_paths` and `spec_sections` per ADR below):
```yaml
---
id: adr-00NN
kind: decision
status: accepted
date: 2026-10-21
decision-makers: [maintainer]
verified_at: null
source_paths: [...]
spec_sections: [...]
---
```
Sections: `# <title>`, `## Context and Problem Statement`, `## Decision Outcome` (bullets), `### Consequences` (at least one Good and one Bad). Inline-code paths in the bodies must be real repo paths, or paths this plan creates (`drift` checks them; the files exist by Task 18).

- [ ] **Step 1: Build, unblock the epic, create the items.**
  1. Run `npm run build` if `dist/baton.mjs` is missing.
  2. Replace the phase-gate link with a `related` link, which keeps the history traceable without blocking, and record why:
     ```bash
     node dist/baton.mjs task dep remove bt-vyr bt-s9g
     node dist/baton.mjs task dep add bt-vyr bt-s9g -t related
     node dist/baton.mjs task comment bt-vyr "Phase gates waived by the user for the build. Phase 1's gate is measured by dogfooding. Phase 2 plan: docs/superpowers/plans/2026-10-21-phase2-gates.md"
     ```
  3. Run these one at a time, in order. Each prints `created <id>: <title>`. They are expected to print `bt-vyr.5` to `bt-vyr.18` in creation order. If an id prints differently, substitute the printed id wherever it appears in the rest of this step.
     ```bash
     node dist/baton.mjs task create "Phase 2 decisions: ADRs 0018-0021 and design-doc updates" --parent bt-vyr -t chore -p 1 --spec decisions --check "npm run check"
     node dist/baton.mjs task create "Decision record format: rendering, placeholders, status parsing" --parent bt-vyr -p 2 --spec decisions --check "npm run check" --deps blocks:bt-vyr.5
     node dist/baton.mjs task create "decide --preflight: related decisions and spec sections, and the derived supersede chain" --parent bt-vyr -p 2 --spec decisions --check "npm run check" --deps blocks:bt-vyr.6
     node dist/baton.mjs task create "verify core: check runner, diff rule, active task" --parent bt-vyr -p 2 --spec tasks --check "npm run check" --deps blocks:bt-vyr.5
     node dist/baton.mjs task create "Guard classifier: protected targets, shell writes, dependency commands" --parent bt-vyr -p 2 --spec hooks --check "npm run check" --deps blocks:bt-vyr.5
     node dist/baton.mjs task create "Uncommitted source changes age sections" --parent bt-vyr -p 2 --spec freshness --check "npm run check" --deps blocks:bt-vyr.5
     node dist/baton.mjs task create "PostToolUse notices for touched sections" --parent bt-vyr -p 2 --spec hooks,freshness --check "npm run check" --deps blocks:bt-vyr.10,blocks:bt-vyr.9
     node dist/baton.mjs task create "Opt-in Stop verification of the active task" --parent bt-vyr -p 2 --spec hooks,tasks --check "npm run check" --deps blocks:bt-vyr.8
     node dist/baton.mjs task create "Hook smoke test: Phase 2 cases and budgets" --parent bt-vyr -p 2 --spec hooks --check "npm run check" --deps blocks:bt-vyr.3,blocks:bt-vyr.11,blocks:bt-vyr.12
     node dist/baton.mjs task create "Generate this repo's AGENTS.md from rules.md, with compile --check in CI" --parent bt-vyr -p 2 --spec context-format --check "npm run check" --deps blocks:bt-vyr.4
     node dist/baton.mjs task create "Skills call the real decide and verify" --parent bt-vyr -p 2 --spec skills --check "npm run check" --labels "check:npm run validate:skills" --deps blocks:bt-vyr.1,blocks:bt-vyr.2
     node dist/baton.mjs task create "Phase 2 docs: command contract, hook wiring, roadmap, README" --parent bt-vyr -p 3 --spec context-format,hooks --check "npm run check" --deps blocks:bt-vyr.13,blocks:bt-vyr.14,blocks:bt-vyr.15
     node dist/baton.mjs task create "Stamp Phase 2 sections and regenerate STATE.md" --parent bt-vyr -p 3 --spec context-format --check "npm run check" --deps blocks:bt-vyr.16
     node dist/baton.mjs task create "Measure the Phase 2 gate: no direct state edits in 10 sessions" --parent bt-vyr -p 2 --spec hooks --deps blocks:bt-vyr.17 -d "Agents: do not claim this task. It is a human measurement, and the phase gates were waived for the build, so it blocks nothing. Before the first of 10 real sessions with the plugin loaded, record the start date as a comment on this task. Then count only the deny lines in .context/.cache/guard.jsonl whose ts is after that date, and check git log --stat -- .context/STATE.md .context/tasks.jsonl .context/memories.jsonl .context/decisions/ for any change not made by a baton command. The gate holds when no direct edit landed. Close by hand (task close, no check label) with the numbers as the reason."
     ```
  4. Link the existing items:
     ```bash
     node dist/baton.mjs task dep add bt-vyr.1 bt-vyr.7
     node dist/baton.mjs task dep add bt-vyr.2 bt-vyr.8
     node dist/baton.mjs task dep add bt-vyr.3 bt-vyr.9
     node dist/baton.mjs task dep add bt-vyr.3 bt-vyr.7
     node dist/baton.mjs task dep add bt-vyr.4 bt-vyr.1
     node dist/baton.mjs task update bt-vyr.4 --title "compile and compile --check (the CI step lands with bt-vyr.14)"
     ```
     `bt-vyr.4` closes in Task 14, before Task 15 adds the CI step; the new title says so.
  5. If any printed id differed, record the mapping, e.g. `node dist/baton.mjs task comment bt-vyr "Phase 2 plan ids: plan bt-vyr.5 = <printed>, …"`.
  6. Claim: `node dist/baton.mjs task update bt-vyr.5 --claim`.

  Note: claiming works on any open task. `bt-vyr.1`–`.4` became ready once the `blocks` link was replaced.
- [ ] **Step 2: Write ADR 0018**, "decide: MADR lifecycle, supersede by status, and preflight".
  - `source_paths: [src/core/decisions.ts, src/core/decide.ts, src/core/preflight.ts, src/commands/decide.ts]`
  - `spec_sections: [decisions]`
  - **Context:** ADR 0001 fixes MADR 4.0, append-only records, and supersession recorded in the status string. The spec's `decisions` section asks for `decide --preflight`, and the roadmap asks for supersede chains and spec-conflict flags. Agents must be able to record decisions without hand-editing `.context/decisions/`, while accepted records stay immutable.
  - **Decision Outcome bullets:**
    - **Lifecycle.** `proposed` → `accepted` → `superseded by ADR-NNNN`.
      - `baton decide "<title>"` creates a record with the next free number; status `proposed` by default, or `--status accepted`.
      - A proposed record's **body** may be edited by hand; its frontmatter may not.
      - `baton decide --accept <NNNN>` moves a proposed record to accepted.
      - Accepted, superseded, rejected and deprecated records are never edited by hand.
    - **What "append-only" permits.** This applies ADR 0001 and ADR 0012.
      - ADR 0001: MADR has no supersedes field, and supersession lives only in the status string (`superseded by ADR-NNNN`).
      - ADR 0012: stamping an ADR's frontmatter is a metadata write through the CLI, and the record's text never changes.
      - AGENTS.md forbids *direct* edits to `.context/decisions/`; the CLI is the write path.

      So the CLI, and only the CLI, makes exactly two kinds of change to an existing record, both frontmatter-only:
      - its `status` line: `accepted` on accept, or `"superseded by ADR-NNNN"` on supersession;
      - its `verified_at` stamp.

      The body bytes never change, and every other byte of the file is preserved, including the BOM and line endings.
    - **Supersede chains.**
      - The new record carries `supersedes: "NNNN"`, ADR 0001's extension key.
      - When the new record becomes accepted (created with `--status accepted`, or later with `--accept`), the old record's status becomes `"superseded by ADR-<new>"`. A proposed successor leaves the old record untouched.
      - The section index also derives the chain: an accepted record's `supersedes` marks its target superseded even if the target's status was never rewritten.
      - A record that is already superseded, or rejected, cannot be superseded (exit 2).
    - **Record format.** The MADR minimal subset, rendered by `src/core/decisions.ts`.
      - Frontmatter: `id`, `kind`, `status`, `date`, `decision-makers` (default: the actor), `verified_at`, `source_paths` (`--paths`), `supersedes`, `spec_sections` (`--spec`).
      - `verified_at` is HEAD's 12-character stamp when the record is created as, or becomes, accepted; otherwise `null`.
      - Sections: Context and Problem Statement, Considered Options, Decision Outcome (with Consequences), More Information.
      - The missing parts of a proposed record are `{…}` placeholders. A record that still has placeholders cannot be accepted. `--status accepted` at creation needs `--context` and `--outcome`.
    - **Numbering.** The next free number is written with exclusive create. If a concurrent writer took the same number, the second writer removes its file and exits 1.
    - **Preflight.** `decide [title] --preflight [--paths] [--spec] [--supersedes]` writes nothing. It relates the proposal to every non-STATE section and every current ADR, in three ways: by path (an overlap with `source_paths`, glob tested in either direction), by spec id, or by a shared title keyword.
      - A relation **constrains** the proposal when an accepted ADR, or a load-bearing spec section, is related by path or spec id, and is not the record named in `--supersedes`. A section is load-bearing when its body carries the marker `(load-bearing)`, as the spec's `scope` section does. A passing mention of the word does not count.
      - Exit 2 when anything constrains, else 0. baton cannot judge whether two decisions contradict each other, so exit 2 means "read these before deciding".
      - Keyword-only matches are listed as "possibly related" (at most 5) and never fail.
      - Unknown `--spec` ids are listed.
    - **Spec-conflict flags.** On creation, `decide` runs the same preflight and records its result under "More Information" in the new record. It prints the report, plus a note for each linked load-bearing spec section saying that the section's text must agree.
      - Creation never fails on a conflict: the record *is* the decision.
      - Unknown `--spec` ids refuse creation (exit 1).
    - **Listing.** `baton decide` with no arguments at all lists every record with its status and its `supersedes`. Any creation option without a title (such as `--spec`, `--supersedes` or `--paths`) exits 1.
    - The optional code-graph MCP stays out of scope.
  - **Consequences.**
    - Good: agents never hand-edit `.context/decisions/`, and chains stay readable by MADR tools such as adr-kit.
    - Bad: preflight is lexical (paths, ids, words), so it over- and under-reports.
    - Bad: the status write to the old record is a narrow exception to "never edited" that only the CLI makes.
- [ ] **Step 3: Write ADR 0019**, "verify closes a task on passing checks and a non-empty diff; opt-in Stop gate".
  - `source_paths: [src/core/verify.ts, src/commands/verify.ts, src/commands/task.ts, src/hooks/stop.ts, src/core/config.ts]`
  - `spec_sections: [tasks]`
  - **Context:** The spec's `tasks` section says a task is done only when `baton verify` runs its check and the check passes, and that no proof string from the model is accepted. Roadmap open question 4 asks whether a non-empty diff is required by default. `config.yaml` already carries `verify.requireDiff: true`.
  - **Decision Outcome bullets:**
    - **Checks.**
      - Every `check:<command>` label of the task runs, in label order, in the project root.
      - The command runs through Node's `spawn` with `shell: true`: `cmd.exe` on Windows, `/bin/sh` elsewhere. Output is streamed.
      - Every check must exit 0. The first failure stops the run.
      - A task without a `check:` label cannot be verified (exit 1).
    - **Open question 4, resolved: yes.** With `verify.requireDiff: true` (the default), the task needs a non-empty diff since it was started (`started_at`, else `created_at`).
      - The diff is the files changed in commits made after the second in which the task was started (git stores whole-second committer times, so a commit in that same second is not counted), plus the files with uncommitted changes now.
      - `.context/tasks.jsonl`, `.context/memories.jsonl`, `.context/STATE.md` and `.context/.cache/**` are ignored, so the claim's own write never counts.
      - `--no-diff`, or `requireDiff: false`, skips the rule, for tasks such as investigations.
      - Why: a check like `npm run check` also passes on an untouched tree, so exit 0 alone would let an agent close a task it never did.
    - **Order.** The diff is checked first, because it is cheap; then the checks run.
    - **Exit codes.**
      - 0: closed, or already closed (nothing is run).
      - 2: a failed check or an empty diff; the task stays open.
      - 1: an unknown task, no `check:` label, or no git repository while the diff rule is on.
      - 3: a non-native task backend.
    - **Closing.** Through the task service, with the reason `verified: <commands joined "; ">`. The close rules (open children, open blockers) still apply, with exit 2.
    - **`task close` on a checked task.** `baton task close` refuses (exit 2) a task that has a `check:` label unless `--force` is given. A forced close records its reason as `forced (check not run): <reason>`. Tasks without a `check:` label close as before. Only `verify` closes a checked task without `--force`.
    - **stats.** A successful Bash call of `baton verify <id>` counts as a close, like `task close` (extends ADR 0016).
    - **Stop gate,** opt-in with `verify.onStop: true` (default `false`).
      - Its "active task" is the most recently started task that is in progress, not an epic, assigned to the current actor, and has a `check:` label.
      - It runs that task's checks with a 540 s timeout. If one fails, it returns `decision: "block"` with the failing command and the last 1,500 characters of its output.
      - It never closes a task: stopping to ask a question is not "done".
      - It does nothing when `stop_hook_active` is true (Claude Code's loop guard), or when the diff rule finds nothing yet.
      - It is wired in `hooks.json` with `timeout: 600`. A disabled gate costs one node start per stop.
  - **Consequences.**
    - Good: "done" means a command passed on a changed tree, decided by baton, not by the model.
    - Bad: a task whose work landed before it was claimed needs `--no-diff`.
    - Bad: checks run in the platform shell, so a label written for `sh` may fail under `cmd.exe`.
    - Bad: the gate can still be sidestepped by swapping labels (`task update --remove-labels "check:…"`) or by `task close --force`. The native store keeps no change history, so a label swap is visible only in the git history of `.context/tasks.jsonl`. A forced close keeps `forced` in its close reason.
- [ ] **Step 4: Add harness facts to the implementation notes.** Source for every ✅ below: the [hooks reference](https://code.claude.com/docs/en/hooks), read 2026-10-21.
  1. In §1, in the "**Per event:**" bullet, replace `` `stop_hook_active` ❓ `` with `` `stop_hook_active` ✅ (true while Claude Code is already continuing because of a stop hook) ``.
  2. In §1, directly after the "**JSON output:**" bullet, add these bullets, in this order:
     - "**PreToolUse decisions:** `permissionDecisionReason` is shown to Claude for `deny`; to the user for `ask` (Claude reads it only in a `-p` run, where nobody can answer the prompt); and only written to the debug log for `allow` and `defer`. `hookSpecificOutput.additionalContext` is added to Claude's context alongside the tool result (ignored with `defer`). ✅ An `additionalContext` with no `permissionDecision` leaves the normal permission flow unchanged: 🟡 inferred from the reference, not yet observed. → ADR 0020"
     - "**Tool inputs:** `tool_input.file_path` is always absolute for the file tools. Write carries `content`; Edit carries `old_string`, `new_string` and `replace_all`. ✅ MultiEdit (`edits[]`) and NotebookEdit fields are not in the reference ❓; baton reads `edits[].old_string`/`new_string` and `notebook_path` when they are present."
     - "**PowerShell tool:** Claude Code on Windows has a `PowerShell` tool whose `tool_input` matches Bash (`command`, `description`, `timeout`, `run_in_background`). The reference's matcher example is `Bash|PowerShell`. ✅ It also appeared in the Claude Code tool list of the planning session on the Windows build machine, 2026-10-21 🟡. → PreToolUse matches `Bash|PowerShell` (ADR 0020)"

     Keep that one fixed date: it records when the planning session saw the tool, not when you run this step.
     - "**PostToolUse:** runs after a tool succeeded. Its input carries `tool_input` and `tool_response`. `hookSpecificOutput.additionalContext` reaches Claude next to the tool result; `decision: "block"` adds `reason` beside the result. ✅ → ADR 0021"
     - "**Stop:** the input adds `stop_hook_active`, `last_assistant_message`, `background_tasks` and `session_crons`. `decision: "block"` with a required `reason` keeps Claude working. After 8 consecutive continuations Claude Code overrides the next block and ends the turn (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`). Stop has no matcher support. ✅ → ADR 0019"
  3. Append a new section at the end of the file:
     ```markdown
     ## 10. Node and git behaviour that verify relies on

     - `child_process.spawn(command, { shell: true })` runs `cmd.exe /d /s /c` on Windows and `/bin/sh -c` elsewhere, so a `check:` label runs in the platform shell. ✅ [Node child_process docs](https://nodejs.org/api/child_process.html#shell-requirements). → ADR 0019
     - `git log --since=<n>` reads a number of 9 or more digits as Unix seconds (git `date.c`, `match_digit`). baton passes whole seconds and keeps only commits whose `%ct` is strictly greater than the start second. 🟡 not yet observed; the `changedFilesSince` test in `test/verify-core.test.ts` will check it.
     ```
- [ ] **Step 5: Append to `.context/knowledge/harness-limits.md`.** Add three bullets at the end; leave the frontmatter and the existing bullets unchanged:
  - "PreToolUse `deny` reasons reach the model; `ask` reasons reach only the user. Deny, never ask, when the model must change course."
  - "Stop: `decision: "block"` keeps Claude working. Skip when `stop_hook_active` is true; Claude Code ends the turn after 8 blocks in a row anyway."
  - "Windows sessions have a `PowerShell` tool as well as `Bash`; guard both."
- [ ] **Step 6: Verify.** Run `npm run check`. Expected: PASS. The dogfood tests parse the new ADRs, and ids must stay unique.
- [ ] **Step 7: Commit.** Leave `bt-vyr.5` in progress; Task 2 closes it.
  ```bash
  git add .context/decisions/0018-* .context/decisions/0019-* docs/research/2026-10-16-implementation-notes.md .context/knowledge/harness-limits.md .context/tasks.jsonl
  git commit -m "docs: ADRs 0018-0019 (decide, verify) and Phase 2 task items" -- .context/decisions/0018-* .context/decisions/0019-* docs/research/2026-10-16-implementation-notes.md .context/knowledge/harness-limits.md .context/tasks.jsonl
  ```

---

### Task 2: Decisions II: ADRs 0020–0021 and design-doc updates

Item `bt-vyr.5` (already claimed in Task 1).

**Files:**
- Create: `.context/decisions/0020-pretooluse-guards-denies-and-preflight-context.md`
- Create: `.context/decisions/0021-uncommitted-changes-age-sections.md`
- Modify: `docs/design/context-format.md`, `docs/design/architecture.md`
- Modify: `.context/spec.md` (one sentence of the `decisions` section; Step 5)
- Read first: `.context/decisions/0008-hooks-exec-form-fail-open.md` (the shape to copy), `.context/decisions/0013-freshness-from-git-history-and-dead-references.md` (Phase 1), and the implementation-notes bullets Task 1 added in §1

**Interfaces:**
- Produces: `adr-0020` and `adr-0021`.

The ADR frontmatter is the same as Task 1's (`date: 2026-10-21`, `status: accepted`, `verified_at: null`), with the same sections and the same inline-path rule.

- [ ] **Step 1: Write ADR 0020**, "PreToolUse guards: structured denies on protected state, preflight as context".
  - `source_paths: [src/hooks/guards.ts, src/hooks/pre-tool-use.ts, plugin/hooks/hooks.json]`
  - `spec_sections: [hooks, decisions, tasks]`
  - **Context:** ADR 0008 fixes structured denies, guards on the shell as well as edit tools, and accepts false positives. `docs/design/context-format.md` lists which files are CLI-owned. Implementation notes §1: a deny reason reaches Claude while an ask reason reaches only the user; `additionalContext` sits alongside the tool result; Windows sessions have a `PowerShell` tool; file tools pass absolute paths.
  - **Decision Outcome bullets:**
    - **Matcher.** `Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell`, a plain list (ADR 0008).
    - **Protected targets.**
      - `.context/STATE.md` (`baton handoff`), `.context/tasks.jsonl` and `.context/memories.jsonl` (`baton task`, `baton remember`), `.context/.cache/**`, and `.beads/**`.
      - The `.context/` directory itself, for shell commands only.
      - Decision records `.context/decisions/NNNN-*.md` with N ≥ 1:
        - creating a record file by hand is denied (use `baton decide`);
        - editing a record whose status is not `proposed` is denied;
        - a proposed record may be edited, except its frontmatter. For Write, Edit, `replace` and MultiEdit, the guard applies the edit to the record's current text (honouring `replace_all`) and denies it when the frontmatter block would change; that covers `status`, `supersedes` and `verified_at`. An apply_patch is denied when a changed line touches `status`, `supersedes`, `verified_at`, `id` or `kind`;
        - a shell write to any decision record is denied.
      - For edit tools, `decisions/0000-template.md` and every other file are not protected. Shell mentions are matched as text, so any decision-record path a shell command writes is denied.
    - **Paths.** An edit-tool path is resolved against the hook's `cwd`, with `\` changed to `/`, and compared with the project root case-insensitively on Windows. An edit-tool path outside the project is never protected. A shell mention is matched as text wherever it points.
    - **The shell heuristic** (`src/hooks/guards.ts`) works segment by segment, after splitting on `&&`, `||`, `;`, `|`, `&` and newlines. A protected path counts as written when it is:
      - the target of a redirection (`>`, `>>`, `&>`; `2>&1` is not a file);
      - an argument of a write command: `rm`, `mv`, the destination of `cp`, `tee`, `sed -i`, `perl -i`, `truncate`, `touch`, `dd`, `ln`, `install`, `rsync`, `unlink`, `shred`; PowerShell `Set-Content`, `Add-Content`, `Out-File`, `Tee-Object`, `New-Item`, `Remove-Item`, `Move-Item`, `Copy-Item` (destination), `Clear-Content` and `Rename-Item`, and their aliases (including `clc`); `cmd` `del`, `erase`, `copy`, `move`, `ren`; and `git checkout|restore|rm|mv`, including with `git -C <dir>`;
      - named in a segment that also calls a file-write API (`writeFileSync`, `open(…, 'w')`, `WriteAllText`, the same cmdlet names inside a nested command);
      - or written by a nested `bash -c`, `sh -c`, `cmd /c` or `powershell -Command` string, one level deep, with the switch matched case-insensitively.

      Reads are allowed. Quoting is not parsed, and false positives are acceptable (ADR 0008).
    - **The deny** is `permissionDecision: "deny"`, with a reason that names the CLI command to use instead. Never exit 2. `guards.protectState: false` turns denies off.
    - **The deny log.** Each deny appends one line to `.context/.cache/guard.jsonl`: `{v: 1, ts, event: "deny", session, tool, rule, path}`, with no command text, so no secrets. It exists for the Phase 2 gate measurement.
    - **Preflight.** These get non-blocking `additionalContext`:
      - an edit-tool target that matches `guards.preflightPaths`;
      - a shell command that adds a dependency, when its manifest matches `guards.preflightPaths`. The commands: `npm install|i|add <pkg>`, `pnpm|yarn|bun add`, `pip install <pkg>`, `uv add` and `poetry add`, `cargo add`, `go get`. `pip install -r <file>` and `pip install -e <path>` install what is already declared, so they do not count.
      - The `guards.preflightPaths` default, in the schema and in both `config.yaml` files, covers every manifest those commands change, plus lockfiles and `**/migrations/**`.

      The context lists the `decide --preflight` path relations for those files, and the `baton decide "<title>" --preflight --paths …` command.
      - It is not `ask`: an ask reason goes to the user, not the model, and it would interrupt every lockfile edit.
      - It is not `deny`: a dependency change is legitimate once it has been decided.
    - **Budget.** < 150 ms.
      - A shell command that mentions no protected path and adds no dependency loads nothing beyond the guard module.
      - An edit loads the config.
      - Only preflight loads the section index.
    - **Fail open** (ADR 0008): any error, including an invalid `config.yaml`, gives stderr and no deny.
  - **Consequences.**
    - Good: state files stay CLI-owned, for Windows paths and in PowerShell too, and a dependency change surfaces the decisions it touches.
    - Bad: the heuristic is bypassable, for example by a script file that writes STATE.md.
    - Bad: the body of a proposed record is still hand-written text.
- [ ] **Step 2: Write ADR 0021**, "Uncommitted source changes age sections; PostToolUse notices touched sections".
  - `source_paths: [src/core/drift.ts, src/hooks/post-tool-use.ts]`
  - `spec_sections: [freshness, hooks]`
  - **Context:** The roadmap says "PostToolUse marks touched sections aging". ADR 0013 counts commits only, so a source that is edited but not committed leaves its section fresh mid-session, including in the packet re-injected after compaction. A mark written by a hook would need git anyway to expire (on a revert or a commit), and would miss edits made outside the agent.
  - **Decision Outcome bullets:**
    - **The level.** `evaluateFreshness` also runs `git status`, in one process, concurrently with its other git calls. A section becomes `aging` when all of these hold:
      - it would otherwise be `fresh`;
      - its `verified_at` is a known commit;
      - it has an uncommitted change (staged, unstaged or untracked) outside `.context/` that matches its `source_paths`.

      The reason reads `uncommitted changes in <up to 3 paths> (+<n> more)`. Other levels are unchanged. This extends ADR 0013 without superseding it. `drift`, `mission` and `explain` all see it, and there is no stored mark to expire.
      - `drift.jsonl` (ADR 0013) logs no flag for a section that is aging only because of uncommitted changes. Otherwise every `drift` run during work in progress would flood it.
      - The `verify-doc` note for uncommitted sources says they keep the section aging until committed and re-verified.
    - **The hook.** PostToolUse (`Edit|Write|MultiEdit`) tells the model, as `additionalContext`, which verified, non-superseded sections list the edited file in their `source_paths`. Those sections count as aging until re-verified: commit, then `baton verify-doc <id>` after review. It is sent once per session and section.
    - **The mark.** `.context/.cache/touched.jsonl` is git-ignored, local to the machine and append-only. It holds `{v: 1, ts, session, paths, ids}` per notice. It is only the per-session dedupe for the notice, and never decides a level. The hook reads at most its last 256 KiB.
    - **Budget.** < 150 ms, with no git process in the hook.
  - **Consequences.**
    - Good: freshness is right mid-session, with no state to expire, and the agent learns about a doc that describes the file it just edited.
    - Bad: any uncommitted change ages sections, including the user's own work in progress.
    - Bad: the notice costs tokens once per section per session.
- [ ] **Step 3: Edit `docs/design/context-format.md`.**
  1. In the layout block:
     - append `, guard.jsonl, touched.jsonl` to the end of the `.cache/` line, which Phase 1 Task 2 set to `git-ignored: tasks.db, last-packet.txt/.json, drift.jsonl, stats/<session>.json`;
     - change the `decisions/NNNN-*.md` line's text to `MADR 4.0 records, written by baton decide; append-only (ADR 0018)`.
  2. In the Mutation rules table:
     - `decisions/` row: set the Rule cell to `Created by baton decide; append-only: only a proposed record's body is edited by hand; status changes through decide --accept or a superseding record (ADR 0018)`, and the Enforced-by cell to `PreToolUse deny (ADR 0020)`;
     - `tasks.jsonl, memories.jsonl` row: set the Enforced-by cell to `PreToolUse deny (ADR 0020); tasks close through baton verify (ADR 0019)`;
     - `STATE.md` row: set the Enforced-by cell to `PreToolUse deny (ADR 0020) + handoff`.
  3. Under the freshness-levels table, after the sentence Phase 1 added, add: "A section that would be fresh, but has uncommitted changes (staged, unstaged or untracked, outside `.context/`) matching its `source_paths`, is aging (ADR 0021)."
  4. In the task store table, change the `Close` row's Rule cell to: `refused while children are open or a blocks target is open, unless --force; baton verify <id> closes only after its check: commands pass on a non-empty diff; task close on a task with a check: label needs --force and records "forced (check not run)" (ADR 0019)`.
- [ ] **Step 4: Edit `docs/design/architecture.md`.**
  1. Source layout, under `core/`:
     - change the `decisions.ts` line to `decisions.ts      MADR naming, numbering, record rendering, status parsing (ADR 0018)`;
     - add one line each: `decide.ts         decision records: create, accept, supersede, list (ADR 0018)`, `preflight.ts      decisions and spec sections related to a proposed change (ADR 0018)`, `verify.ts         check runner, diff rule, active task (ADR 0019)`, and `compile.ts        AGENTS.md and the CLAUDE.md import from rules.md`.
  2. Source layout, under `hooks/`:
     - change the `guards.ts` line to `guards.ts         protected targets, edit targets, shell-write and dependency heuristics (ADR 0020)`;
     - add `pre-tool-use.ts   protected-state denies, preflight context (ADR 0020)`, `post-tool-use.ts  notices for sections an edit touched (ADR 0021)`, and `stop.ts           opt-in check of the active task (ADR 0019)`.
  3. Hook wiring table:
     - `pre-tool-use` row: set the Claude Code cell to `PreToolUse Edit\|Write\|MultiEdit\|NotebookEdit\|Bash\|PowerShell` and the handler cell to `deny protected-state edits; preflight context for dependency and migration files (2, ADR 0020)`;
     - `post-tool-use` row: set the handler cell to `notice the sections whose source_paths an edit touched; uncommitted changes age them (2, ADR 0021)`;
     - `stop` row: set the Claude Code cell to `Stop (timeout 600 s; acts only with verify.onStop)` and the handler cell to `run the active task's check; block the stop when it fails (2, ADR 0019)`.
  4. Performance budget: append "`hook post-tool-use` shares the < 150 ms budget. `hook stop` does nothing unless `verify.onStop` is set; then it runs the active task's check (up to 540 s, ADR 0019)."
- [ ] **Step 5: Align the spec's `decisions` section with ADR 0018.** In `.context/spec.md`, in the body of `## Decisions`, replace the sentence ``MADR 4.0 records in `.context/decisions/`, append-only, superseded never edited (ADR 0001).`` with: "MADR 4.0 records, append-only: bodies never change once accepted; only `baton decide` rewrites a status line and `verify-doc` a `verified_at` (ADR 0018)."
  - Leave the marker line and the `decide --preflight` sentence as they are.
  - The section is not marked `(load-bearing)`, and ADR 0018 records the change.
- [ ] **Step 6: Verify.** Run `npm run check`. Expected: PASS.
- [ ] **Step 7: Close and commit.**
  ```bash
  node dist/baton.mjs task close bt-vyr.5 --reason "ADRs 0018-0021 written, design docs and the spec decisions sentence updated"
  git add .context/decisions/0020-* .context/decisions/0021-* .context/spec.md docs/design/context-format.md docs/design/architecture.md .context/tasks.jsonl
  git commit -m "docs: ADRs 0020-0021 (guards, aging) and design-doc updates" -- .context/decisions/0020-* .context/decisions/0021-* .context/spec.md docs/design/context-format.md docs/design/architecture.md .context/tasks.jsonl
  ```

---

### Task 3: Decision record format (pure)

Item `bt-vyr.6`. Claim it first.

**Files:**
- Modify: `src/core/decisions.ts` (keep `ADR_FILE_RE`, `slugify`, `adrFileName` and `nextAdrNumber` unchanged)
- Test: `test/decisions-record.test.ts`
- Read first: `src/core/decisions.ts`, `src/core/frontmatter.ts` (`parseFrontmatter`, `parseFileSection`), ADR 0018

**Interfaces:**
- Consumes (existing):
  ```ts
  // src/core/decisions.ts
  export const ADR_FILE_RE: RegExp;                          // /^(\d{4})-([a-z0-9-]+)\.md$/
  export function slugify(title: string): string;
  export function adrFileName(num: number, title: string): string;   // "0007-packet-budget.md"
  export async function nextAdrNumber(dir: string): Promise<number>; // 0000 reserved for the template
  // src/core/frontmatter.ts
  export function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string };
  export function parseFileSection(text: string, file: string): Section | null;
  // src/core/errors.ts
  export class BatonError extends Error { constructor(message: string, exitCode?: number) }
  ```
- Produces (all pure):
  ```ts
  export const PLACEHOLDERS: {
    readonly context: "{Context: the problem, and why a decision is needed now.}";
    readonly option: "{Considered option}";
    readonly outcome: "{Chosen option and why.}";
    readonly good: "Good, because {…}";
    readonly bad: "Bad, because {…}";
  };
  export type PlaceholderKey = keyof typeof PLACEHOLDERS;
  export type StatusKind = "proposed" | "accepted" | "superseded" | "rejected" | "deprecated" | "other";
  export function statusKind(status: string): StatusKind;
  export function pad4(n: number): string;                       // 7 → "0007"
  export function adrId(n: number): string;                      // 7 → "adr-0007"
  export function parseAdrRef(ref: string): number;              // BatonError exit 1 on bad input
  export function adrNumberFrom(value: string): number | null;   // loose: first 1–4 digit run
  export function supersededStatus(n: number): string;           // "superseded by ADR-0007"
  export function localDate(d: Date): string;                    // local YYYY-MM-DD
  export interface AdrDraft {
    number: number; title: string; status: "proposed" | "accepted"; date: string;
    deciders: string[]; verifiedAt: string | null; sourcePaths: string[]; specSections: string[];
    supersedes?: number;
    context?: string; considered: string[]; outcome?: string; consequences: string[];
    moreInformation: { summary: string; items: string[] };
  }
  export function renderAdr(d: AdrDraft): string;
  export function placeholdersIn(text: string): PlaceholderKey[];    // PLACEHOLDERS key order
  export function statusOf(text: string): string | null;
  export function frontmatterBlock(text: string): string | null;  // the whole "---\n…\n---" block, BOM/CRLF-normalised
  export function setFrontmatterField(lfText: string, key: string, rendered: string): string;
  export function numberTaken(entries: string[], n: number, ownName: string): boolean;
  ```

**Rules (pinned):**
- **`statusKind(s)`.** `t = s.trim().toLowerCase()`. The result is the first of these that holds:
  - `superseded` when `t` starts with `superseded`;
  - `accepted` when it starts with `accepted`;
  - `proposed` when it starts with `proposed`;
  - `rejected` when it starts with `rejected`;
  - `deprecated` when it starts with `deprecated`;
  - otherwise `other` (including `""`).
- **`parseAdrRef(ref)`.** Match `ref.trim()` against `/^(?:adr[-\s]?)?(\d{1,4})$/i`. Any other input, or a number below 1, throws `BatonError(\`not an ADR number: "${ref}"\`)` (exit 1).
- **`adrNumberFrom(v)`.** The first match of `/\d{1,4}/` in `v`, as a number. It returns `null` when there is no match or the number is 0.
- **`localDate(d)`.** `getFullYear()`, `getMonth() + 1` and `getDate()`, zero-padded and joined with `-`.
- **`renderAdr(d)`.** LF text ending in exactly one `\n`.
  - **Frontmatter,** one line per key, in this order:
    - `id: adr-NNNN`, `kind: decision`, `status: <status>`, `date: <date>`;
    - `decision-makers: [<names joined ", ">]`. A name matching `/^[A-Za-z0-9._ -]+$/` is written as is; any other name is written `JSON.stringify`'d;
    - `verified_at: null`, or `verified_at: "<12 chars>"`;
    - `source_paths: [<each JSON.stringify'd, joined ", ">]` (`[]` when empty);
    - `supersedes: "NNNN"`, only when it is set;
    - `spec_sections: [<ids joined ", ">]`.
  - **Body,** after the closing `---`:
    - `# <title>`, then a blank line.
    - `## Context and Problem Statement`, a blank line, then `context`, or `PLACEHOLDERS.context` when it is unset.
    - `## Considered Options`, a blank line, and one `* <text>` bullet per entry of `considered`. When `considered` is empty, a proposed record gets two `* {Considered option}` bullets, and an accepted record omits the whole section.
    - `## Decision Outcome`, a blank line, then `outcome`, or `PLACEHOLDERS.outcome`.
    - `### Consequences`, a blank line, and one `* <text>` bullet per entry of `consequences`. When it is empty, a proposed record gets `* Good, because {…}` and `* Bad, because {…}`, and an accepted record omits the section.
    - `## More Information`, a blank line, then `summary`. When there are items: a blank line, then one `* <item>` per item.
  - Sections are separated by one blank line.
  - A title or an item that contains `\n` throws `BatonError` (exit 1).
- **`placeholdersIn(text)`.** The keys whose `PLACEHOLDERS` value occurs in `text`.
- **`statusOf(text)`.**
  1. Strip a BOM and normalise CRLF.
  2. The frontmatter must match `/^---\n([\s\S]*?)\n---(?:\n|$)/`.
  3. Inside it, take the first `/^status:[ \t]*(.*)$/m`, trim it, and strip one pair of matching surrounding quotes (`"…"` or `'…'`).
  4. Return `null` when there is no frontmatter or no status line.
- **`frontmatterBlock(text)`.** Steps 1 and 2 of `statusOf`, then the whole matched block (`m[0]`) with a trailing `\n` removed, or `null` when there is no frontmatter. Task 8's guard compares these blocks before and after an edit.
- **`setFrontmatterField(lfText, key, rendered)`.** The text must start with `---\n` and contain a closing `\n---` line; otherwise throw `Error("no frontmatter")`. Inside the frontmatter, replace the first line matching `^<key>:.*$` with `<key>: <rendered>`. If there is none, insert that line directly before the closing `---`. Nothing outside the frontmatter changes.
- **`numberTaken(entries, n, ownName)`.** True when some entry other than `ownName` matches `/^(\d{4})-.+\.md$/` with the number `n`.

**Expected text.** These two are the exact expected strings the tests compare.
- **Proposed, minimal.** `{ number: 3, title: "Use WebAuthn for login", status: "proposed", date: "2026-10-21", deciders: ["tester"], verifiedAt: null, sourcePaths: [], specSections: [], considered: [], consequences: [], moreInformation: { summary: "Preflight at creation (baton decide): 0 constraining, 0 related, 0 possibly related.", items: [] } }` renders:
  ```text
  ---
  id: adr-0003
  kind: decision
  status: proposed
  date: 2026-10-21
  decision-makers: [tester]
  verified_at: null
  source_paths: []
  spec_sections: []
  ---
  # Use WebAuthn for login

  ## Context and Problem Statement

  {Context: the problem, and why a decision is needed now.}

  ## Considered Options

  * {Considered option}
  * {Considered option}

  ## Decision Outcome

  {Chosen option and why.}

  ### Consequences

  * Good, because {…}
  * Bad, because {…}

  ## More Information

  Preflight at creation (baton decide): 0 constraining, 0 related, 0 possibly related.
  ```
- **Accepted, full.** `{ number: 4, title: "Store sessions in SQLite", status: "accepted", date: "2026-10-21", deciders: ["maintainer", "Jane Doe"], verifiedAt: "0123456789ab", sourcePaths: ["src/db/**", "package.json"], specSections: ["auth", "billing"], supersedes: 1, context: "Sessions must survive restarts.", considered: ["SQLite file", "In-memory map"], outcome: 'Chosen option: "SQLite file", because it survives restarts.', consequences: ["Good, because restarts keep sessions.", "Bad, because the file must be backed up."], moreInformation: { summary: "Preflight at creation (baton decide): 1 constraining, 0 related, 0 possibly related.", items: ['constrains: ADR 0001 (accepted) "Use passkeys for sign-in" (spec: auth)'] } }` renders:
  ```text
  ---
  id: adr-0004
  kind: decision
  status: accepted
  date: 2026-10-21
  decision-makers: [maintainer, Jane Doe]
  verified_at: "0123456789ab"
  source_paths: ["src/db/**", "package.json"]
  supersedes: "0001"
  spec_sections: [auth, billing]
  ---
  # Store sessions in SQLite

  ## Context and Problem Statement

  Sessions must survive restarts.

  ## Considered Options

  * SQLite file
  * In-memory map

  ## Decision Outcome

  Chosen option: "SQLite file", because it survives restarts.

  ### Consequences

  * Good, because restarts keep sessions.
  * Bad, because the file must be backed up.

  ## More Information

  Preflight at creation (baton decide): 1 constraining, 0 related, 0 possibly related.

  * constrains: ADR 0001 (accepted) "Use passkeys for sign-in" (spec: auth)
  ```

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-vyr.6 --claim`
- [ ] **Step 2: Write the failing tests** in `test/decisions-record.test.ts`.
  - `renders a minimal proposed record exactly`: the first expected text.
  - `renders a full accepted record exactly`: the second expected text. In addition:
    - `parseFrontmatter(text).data["decision-makers"]` equals `["maintainer", "Jane Doe"]`;
    - `parseFileSection(text, "x.md")` has `meta.id` `"adr-0004"` and `meta.verifiedAt` `"0123456789ab"`, as a string;
    - `data.supersedes` is `"0001"` and `data.source_paths` equals `["src/db/**", "package.json"]`.
  - `omits empty optional sections when accepted`: the full draft with `considered: []` and `consequences: []` contains neither `## Considered Options` nor `### Consequences`, and `placeholdersIn` gives `[]`.
  - `placeholdersIn`: the minimal text gives `["context", "option", "outcome", "good", "bad"]`; after replacing `{Considered option}` everywhere, `["context", "outcome", "good", "bad"]`.
  - `statusOf`:
    - `---\nstatus: accepted\n---\n` → `"accepted"`;
    - `"\uFEFF---\r\nid: a\r\nstatus: \"superseded by ADR-0009\"\r\n---\r\n# A\r\n"` → `"superseded by ADR-0009"`;
    - `---\nstatus: 'proposed'\n---\n` → `"proposed"`;
    - `# no frontmatter` → `null`; `---\nid: a\n---\n` → `null`.
  - `frontmatterBlock`:
    - `"﻿---\r\nid: a\r\nstatus: proposed\r\n---\r\n# A\r\n"` → `"---\nid: a\nstatus: proposed\n---"`;
    - `"---\nid: a\n---"` (no trailing newline) → `"---\nid: a\n---"`;
    - `# A` → `null`.
  - `statusKind` table:
    - `"accepted"` → accepted; `" Accepted "` → accepted;
    - `"superseded by ADR-0009"` → superseded;
    - `"proposed"` → proposed; `"rejected"` → rejected; `"deprecated"` → deprecated;
    - `""` → other; `"draft"` → other.
  - `parseAdrRef` table:
    - `"7"`, `"0007"`, `"ADR-0007"`, `"adr-7"` and `"adr 12"` → 7, 7, 7, 7, 12;
    - `"x"`, `"0"`, `"10000"` and `""` each throw a `BatonError` with `exitCode` 1.
  - `adrNumberFrom`: `"0007"` → 7; `"ADR-0009"` → 9; `"none"` → `null`.
  - `adrId(7)` → `"adr-0007"`; `pad4(12)` → `"0012"`; `supersededStatus(18)` → `"superseded by ADR-0018"`.
  - `localDate(new Date(2026, 9, 1, 12))` → `"2026-10-01"`.
  - `setFrontmatterField`:
    - `"---\nid: a\nstatus: proposed\n---\n# A\nstatus: body line\n"` with `("status", "accepted")` → `"---\nid: a\nstatus: accepted\n---\n# A\nstatus: body line\n"`. The body's `status:` line is untouched;
    - `"---\nid: a\n---\n# A\n"` with `("verified_at", "\"0123456789ab\"")` → `"---\nid: a\nverified_at: \"0123456789ab\"\n---\n# A\n"`;
    - `"# A\n"` throws.
  - `numberTaken(["0003-a.md", "0003-b.md", "0004-c.md"], 3, "0003-a.md")` → true; `(["0003-a.md"], 3, "0003-a.md")` → false.
  - `rejects multi-line titles`: a title `"a\nb"` throws with exit 1.
- [ ] **Step 3: Run.** `npx vitest run test/decisions-record.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the additions in `src/core/decisions.ts`. Keep the module light; it is imported by the PreToolUse hook. Its only imports are `node:fs/promises` (already there) and `./errors.js`.
- [ ] **Step 5: Run.** Expected: PASS. The existing `test/decisions-config.test.ts` still passes. Then `npm run check` and `npm run build`.
- [ ] **Step 6: Close and commit.**
  ```bash
  node dist/baton.mjs task close bt-vyr.6 --reason "MADR record rendering, placeholders, status parsing"
  git add src/core/decisions.ts test/decisions-record.test.ts .context/tasks.jsonl
  git commit -m "feat(decisions): MADR record rendering, placeholders and status parsing" -- src/core/decisions.ts test/decisions-record.test.ts .context/tasks.jsonl
  ```

---

### Task 4: Preflight relations and the derived supersede chain

Item `bt-vyr.7`. Claim it first.

**Files:**
- Create: `src/core/preflight.ts`
- Modify: `src/core/sections.ts` (Phase 1 Task 3; add the chain derivation only)
- Test: `test/preflight.test.ts`; add one `describe` to `test/sections.test.ts` (Phase 1 Task 3)
- Read first: `src/core/sections.ts`, `src/core/glob.ts`, ADR 0018

**Interfaces:**
- Consumes:
  ```ts
  // Phase 1 Task 3: src/core/sections.ts
  export type ContextDoc = "rules" | "spec" | "state" | "knowledge" | "decision";
  export interface AdrInfo { number: number; status: string; specSections: string[]; supersedes?: string }
  export interface IndexedSection extends Section { doc: ContextDoc; adr?: AdrInfo }   // Section: { meta: { id, kind, verifiedAt, sourcePaths, supersededBy? }, title, body, file, line }
  export interface SectionIndex { root: string; sections: IndexedSection[]; byId: ReadonlyMap<string, IndexedSection>; problems: { file: string; message: string }[] }
  export async function loadSectionIndex(root: string, opts?: LoadIndexOptions /* { lenient?: boolean } */): Promise<SectionIndex>;
  //   As landed:
  //   - decision files are listed with ADR_FILE_RE (lowercase slug, number >= 1), sorted by number;
  //   - supersededBy is set from a status "superseded by ADR-NNNN" (supersededByFromStatus);
  //   - a loop over `collected` builds `sections` and `byId`, dropping later cross-file duplicates as problems;
  //   - then `if (problems.length > 0 && !opts.lenient) throw …`.
  // Task 3: src/core/decisions.ts
  export function statusKind(status: string): "proposed" | "accepted" | "superseded" | "rejected" | "deprecated" | "other";
  export function adrNumberFrom(value: string): number | null;
  export function adrId(n: number): string;
  export function pad4(n: number): string;
  // existing: src/core/glob.ts
  export function matchesAny(path: string, globs: readonly string[]): boolean;   // normalises "\" and "./"
  ```
  Test helpers (Phase 1 Task 3, `test/helpers/repo.ts`):
  - `makeRepo(files?, { git? })`, `writeFiles(root, files)` and `CONTEXT_FIXTURE`.
  - The fixture's sections:
    - `rules-project` (`.context/rules.md:3`, title `Project rules`, `source_paths: [package.json]`);
    - `auth` (`.context/spec.md:3`, `Authentication`, `["src/auth/**"]`);
    - `billing` (`.context/spec.md:8`, `Billing`, `[]`, body `Stripe, monthly only.`);
    - `state`;
    - `knowledge-windows` (`.context/knowledge/windows.md:1`, `Windows gotchas`, `["src/**"]`);
    - `adr-0001` (`.context/decisions/0001-use-passkeys.md:1`, `Use passkeys for sign-in`, accepted, `spec_sections: [auth]`, `source_paths: []`);
    - `adr-0002` (`Use passwords`, `status: "superseded by ADR-0001"`, `spec_sections: [auth]`).
- Produces:
  ```ts
  // src/core/preflight.ts
  export type Relation = "path" | "spec" | "keyword" | "supersedes";
  export type HitCategory = "constrains" | "related" | "possibly";
  export interface PreflightQuery { title?: string; paths: string[]; specIds: string[]; supersedes?: number }
  export interface PreflightHit {
    section: IndexedSection; category: HitCategory; relations: Relation[];
    why: string; loadBearing: boolean; matchedPath?: string; keywords: string[];
  }
  export interface PreflightReport {
    hits: PreflightHit[];                                            // category order, then pinned order
    counts: { constrains: number; related: number; possibly: number };
    unknownSpecIds: string[];
  }
  export const PREFLIGHT_STOPWORDS: ReadonlySet<string>;
  export function normalizeQueryPath(p: string): string;            // "\"→"/", strip leading "./", trim
  export function titleTokens(s: string): string[];
  export function isLoadBearing(s: IndexedSection): boolean;
  export function preflight(index: { sections: readonly IndexedSection[] }, q: PreflightQuery): PreflightReport;
  export function hitLabel(h: PreflightHit): string;
  export function renderPreflight(r: PreflightReport): string;      // lines joined "\n", no trailing newline
  export function preflightMoreInformation(r: PreflightReport): { summary: string; items: string[] };
  // src/core/sections.ts: behaviour change only (rule below); no new exports
  ```

**Rules (pinned):**
- **`titleTokens(s)`.** Lowercase, split on `/[^a-z0-9]+/`, keep tokens of length ≥ 3 that are not stopwords, and dedupe in first-appearance order. `PREFLIGHT_STOPWORDS` is exactly: `the and for with from into onto over under that this these those when then than them they their there here what which while where who why how not but are was were has have had does did done use uses used using via per new add adds added make makes all any each every one two its our your you can should would could will shall may might must also only just more most less same such out off own too very`.
- **`isLoadBearing(s)`.** `s.doc !== "decision" && /\(load-bearing\)/i.test(s.body)`. Only the marker form counts, as in the spec's `scope` section ("Not in scope (load-bearing): …"). A body that merely mentions the word is not load-bearing.
- **Candidates.** Every section except:
  - `doc === "state"`;
  - decisions with `meta.supersededBy` set;
  - decisions whose `statusKind(adr.status)` is `rejected` or `deprecated`.
- **Relations, per candidate.** The query paths are passed through `normalizeQueryPath`. Then:
  - **path:** the first query path `p` for which `matchesAny(p, src) || src.some((g) => matchesAny(g, [p]))` holds, where `src = meta.sourcePaths`. Testing both directions relates a literal to a glob and a glob to a wider glob. Set `matchedPath = p`; its why part is `path: <p>`.
  - **spec:** for a non-decision section, `q.specIds` includes its id, giving `spec: <id>`. For a decision, the ids of `adr.specSections` that are in `q.specIds`, in `specSections` order, when there is at least one, giving `spec: <ids joined ", ">`.
  - **keyword** (only when `q.title` is set): the tokens of `titleTokens(q.title)` that are also in `titleTokens(section.title)`, in query order, when there is at least one; stored in `keywords`, giving `keyword: <tokens joined ", ">`.
  - **supersedes:** a decision whose `adr.number === q.supersedes`, giving `replaced by this decision`.
  - With no relation, the section is not a hit.
  - `why` joins the parts with `"; "`, in the order path, spec, keyword, supersedes.
- **Category.**
  - `constrains` when the relations include path or spec, **and** either the section is a decision with `statusKind === "accepted"` and `adr.number !== q.supersedes`, or it is a non-decision section and `isLoadBearing`.
  - `related` otherwise, when the relations include path, spec or supersedes.
  - `possibly` otherwise (keyword only).
- **Order.**
  - Categories: constrains, then related, then possibly.
  - Within constrains and related: decisions by `adr.number`, then other sections in index order.
  - Possibly: by `keywords.length` descending, then the same order, and only the first 5 are kept.
  - `counts` count the kept hits.
- **`unknownSpecIds`.** The deduped `q.specIds`, in order, that match no section, or only a section whose `doc` is `decision` or `state`.
- **`hitLabel(h)`.** Backticks are removed from titles.
  - Decision: `ADR <pad4(number)> (<adr.status>) "<title>"`.
  - Otherwise: `<word> <id> "<title>"`, plus ` (load-bearing)` when it applies. `word` is `spec` for doc `spec`, `rule` for `rules` and `knowledge` for `knowledge`.
- **`renderPreflight(r)`.**
  - The first line is `preflight: <c> constraining, <r> related, <p> possibly related`.
  - Then one line per hit: `` `${CAT.padEnd(10)}  ${hitLabel(h)}  ${file}:${line}  ${why}` ``, where `CAT` is `CONSTRAINS`, `RELATED` or `POSSIBLY`.
  - Then, when there are any, `unknown spec ids: <ids joined ", ">`.
- **`preflightMoreInformation(r)`.**
  - `summary` is `Preflight at creation (baton decide): <c> constraining, <r> related, <p> possibly related.`
  - `items` has one entry per hit: `<constrains | related | possibly related>: <hitLabel> (<why>)`.
  - No backticks and no markdown links appear in it, so drift's dead-reference check never reads a planned path as dead.
- **Derived chain in `loadSectionIndex`.** Insert it after the loop over `collected` that builds `sections` and `byId`, and before the `if (problems.length > 0 && !opts.lenient)` throw. `sections.ts` already imports from `./decisions.js`; add `statusKind`, `adrNumberFrom` and `adrId` to that import. Walk the decisions in index order. For each decision `s` with `s.adr?.supersedes`, `statusKind(s.adr.status) === "accepted"` and no `s.meta.supersededBy`:
  - `n = adrNumberFrom(s.adr.supersedes)`, and `t = byId.get(adrId(n))`;
  - if `t` exists, has `doc === "decision"`, is not `s`, and has no `meta.supersededBy`, set `t.meta.supersededBy = s.meta.id`.

  Proposed successors never mark anything.

**Fixture query `Q`:** `{ title: "Use WebAuthn for login", paths: ["src/auth/**"], specIds: ["auth"] }` on `loadSectionIndex(makeRepo(CONTEXT_FIXTURE, { git: false }))`. `renderPreflight(preflight(index, Q))` is exactly:
```text
preflight: 1 constraining, 2 related, 0 possibly related
CONSTRAINS  ADR 0001 (accepted) "Use passkeys for sign-in"  .context/decisions/0001-use-passkeys.md:1  spec: auth
RELATED     spec auth "Authentication"  .context/spec.md:3  path: src/auth/**; spec: auth
RELATED     knowledge knowledge-windows "Windows gotchas"  .context/knowledge/windows.md:1  path: src/auth/**
```

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-vyr.7 --claim`
- [ ] **Step 2: Write the failing tests** in `test/preflight.test.ts`. Use the fixture index unless a test says otherwise.
  - `renders the fixture query exactly`: the text above.
  - `skips superseded and state sections`: no hit for `adr-0002` or `state`.
  - `supersedes downgrades the constraint`: `Q` with `supersedes: 1` gives `counts.constrains` 0. The `adr-0001` hit is `related`, and its `why` is `spec: auth; replaced by this decision`.
  - `load-bearing sections constrain`: in a fixture whose `billing` body is `Stripe, monthly only (load-bearing).`, the query `{ paths: [], specIds: ["billing"] }` gives one `constrains` hit, labelled `spec billing "Billing" (load-bearing)`.
  - `a mention is not a marker`: with the `billing` body `Stripe, monthly only. This section is not load-bearing.`, the same query gives a `related` hit, and `isLoadBearing` is false.
  - `keywords are only possible`: `{ title: "Rotate passkeys yearly", paths: [], specIds: [] }` gives exactly one hit, `adr-0001`, `possibly`, with `keywords` `["passkeys"]`.
  - `possibly keeps 5`: seven extra knowledge files `k1`–`k7` titled `Passkey storage k<i>`, plus the query title `"passkey storage"`, give `counts.possibly` 5.
  - `paths match in either direction`: `{ paths: ["package.json"], specIds: [] }` relates `rules-project` (path). `{ paths: ["src/**"] }` relates `auth`, because `src/auth/**` lies under `src/**`. `{ paths: ["docs/x.md"] }` gives no hits.
  - `normalises Windows query paths`: `{ paths: [".\\src\\auth\\login.ts"] }` relates `auth`, with `matchedPath` `"src/auth/login.ts"`.
  - `lists unknown spec ids`: `{ paths: [], specIds: ["ghost", "adr-0001", "state", "auth"] }` gives `unknownSpecIds` `["ghost", "adr-0001", "state"]`, and `renderPreflight` ends with `unknown spec ids: ghost, adr-0001, state`.
  - `titleTokens("Use the zod schema for config-validation")` → `["zod", "schema", "config", "validation"]`.
  - `preflightMoreInformation` for `Q`: `summary` is `Preflight at creation (baton decide): 1 constraining, 2 related, 0 possibly related.`, and `items[0]` is `constrains: ADR 0001 (accepted) "Use passkeys for sign-in" (spec: auth)`.
  - **Derived chain,** in `test/sections.test.ts`, a new `describe("supersede chain")`:
    - Add `.context/decisions/0003-sessions.md` = `"---\nid: adr-0003\nkind: decision\nstatus: accepted\nsupersedes: \"0001\"\nspec_sections: [auth]\n---\n# Sessions\n"`. Then `byId.get("adr-0001")?.meta.supersededBy` is `"adr-0003"`.
    - With `status: proposed` instead, `adr-0001` has no `supersededBy`.
    - `adr-0002` keeps `supersededBy` `"adr-0001"` from its status, in both cases.
- [ ] **Step 3: Run.** `npx vitest run test/preflight.test.ts test/sections.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `src/core/preflight.ts` and the derivation.
- [ ] **Step 5: Run.** Expected: PASS. `test/dogfood-context.test.ts` (`adr-0007` superseded by `adr-0009`) still passes. Then `npm run check` and `npm run build`.
- [ ] **Step 6: Close and commit.**
  ```bash
  node dist/baton.mjs task close bt-vyr.7 --reason "pure preflight relations, supersede chain derived from accepted records"
  git add src/core/preflight.ts src/core/sections.ts test/preflight.test.ts test/sections.test.ts .context/tasks.jsonl
  git commit -m "feat(decide): preflight relations and a derived supersede chain" -- src/core/preflight.ts src/core/sections.ts test/preflight.test.ts test/sections.test.ts .context/tasks.jsonl
  ```

---

### Task 5: `baton decide` (create, accept, supersede, list, preflight)

Item `bt-vyr.1`. Claim it first. From this task on, decision files are written only through this command (Global Constraints).

**Files:**
- Create: `src/core/decide.ts`
- Modify: `src/commands/decide.ts`
- Test: `test/decide.test.ts`
- Read first: `src/commands/decide.ts`, `src/commands/task.ts` (option parsing style), ADR 0018

**Interfaces:**
- Consumes:
  - Task 3 (`src/core/decisions.ts`):
    - `renderAdr(draft)`, `AdrDraft`, `PLACEHOLDERS` and `placeholdersIn(text)`;
    - `statusOf(text)`, `statusKind(status)`, `setFrontmatterField(lfText, key, rendered)`;
    - `parseAdrRef(ref)` (exit 1), `adrNumberFrom`, `adrId`, `pad4`, `supersededStatus(n)`, `localDate(d)`, `numberTaken(entries, n, ownName)`;
    - existing: `adrFileName(n, title)` and `nextAdrNumber(dir)`.
  - Task 4 (`src/core/preflight.ts`): `preflight(index, q)`, `PreflightQuery { title?, paths, specIds, supersedes? }`, `PreflightReport { hits, counts, unknownSpecIds }`, `renderPreflight(r)`, `preflightMoreInformation(r)`, `isLoadBearing(section)` and `normalizeQueryPath(p)`.
  - Phase 1 Task 3: `loadSectionIndex(root, { lenient: true })`. Decisions carry `adr: { number, status, specSections, supersedes? }`.
  - Phase 1 Task 6: `requireContext(root)` (`src/commands/_shared.ts`, exit 1 without `.context/`), and `runCli(args, cwd)` (`test/helpers/cli.ts`) → `{ stdout, stderr, exitCode }`.
  - Existing:
    - `headSha(cwd)` (`src/core/git.ts`);
    - `parseFrontmatter`;
    - `writeFileAtomic(path, text)` (sync, `src/core/tasks/native/jsonl.ts`);
    - `resolveActor(root, explicit?)` (`src/core/tasks/native/store.ts`: `BATON_ACTOR`, then git user.name, then the OS user);
    - `contextPath`, `ContextPaths.decisions` (`"decisions"`), `findProjectRoot`, `action`, `BatonError` and `ExitCode`.
  - Test helpers: `makeRepo()`, a `CONTEXT_FIXTURE` git repo with one commit (fixture facts as in Task 4; the next ADR number is 3), plus `makeTempDir`, `writeFiles`, `runGit` and `commitAll`.
- Produces:
  ```ts
  // src/core/decide.ts
  export interface CreateDecisionInput {
    title: string; status: "proposed" | "accepted"; specIds: string[]; paths: string[];
    supersedes?: number; context?: string; considered: string[]; outcome?: string; consequences: string[];
    deciders: string[]; now?: Date;
  }
  export interface Superseded { number: number; file: string }
  export interface CreateDecisionResult {
    number: number; file: string; status: "proposed" | "accepted"; report: PreflightReport;
    notes: string[]; placeholders: boolean; superseded?: Superseded;
  }
  export async function createDecision(root: string, input: CreateDecisionInput): Promise<CreateDecisionResult>;
  export async function acceptDecision(root: string, n: number): Promise<{ number: number; file: string; superseded?: Superseded }>;
  export async function findAdrFile(root: string, n: number): Promise<string | null>;   // repo path, e.g. ".context/decisions/0001-use-passkeys.md"
  export interface DecisionListing { number: number; status: string; title: string; file: string; supersedes?: number }
  export async function listDecisions(root: string): Promise<DecisionListing[]>;
  export async function runPreflight(root: string, q: PreflightQuery): Promise<PreflightReport>;
  export function rewriteRecord(absPath: string, fn: (lfText: string) => string): void;  // keeps BOM + EOL
  ```

**Rules (pinned):**
- **`rewriteRecord(abs, fn)`.** Read the raw text.
  - `bom = raw.startsWith("\uFEFF") ? "\uFEFF" : ""`, `rest = raw.slice(bom.length)`, and `crlf = rest.includes("\r\n")`.
  - `out = fn(rest.replace(/\r\n/g, "\n"))`.
  - Write `bom + (crlf ? out.replace(/\n/g, "\r\n") : out)` with `writeFileAtomic`.
- **`findAdrFile(root, n)`.** Read the entries of `.context/decisions/` (a missing dir means none) that match `/^(\d{4})-.+\.md$/` with number `n`.
  - None → `null`.
  - More than one → `BatonError(\`ADR ${pad4(n)} has several files: ${names.join(", ")}\`)` (exit 1).
- **`assertSupersedable(root, m)`** (internal).
  - The file must exist, else `BatonError(\`no ADR ${pad4(m)}\`)` (exit 1).
  - If `statusKind(statusOf(text) ?? "")` is `superseded` or `rejected`, throw `BatonError(\`ADR ${pad4(m)} is ${status}; it cannot be superseded\`, ExitCode.Blocked)` (exit 2).
- **`markSuperseded(root, m, n)`** (internal). `rewriteRecord` with `setFrontmatterField(lf, "status", JSON.stringify(supersededStatus(n)))`, which writes `status: "superseded by ADR-NNNN"`. It returns the repo path.
- **`createDecision`**, in this order. It writes nothing before step 8.
  1. Validate the title. `title.trim()` must be non-empty and contain no newline; else exit 1, `a decision needs a one-line title`.
  2. Validate the status. If `status === "accepted"` and `context` or `outcome` is unset, exit 1: `an accepted record needs --context and --outcome; create it as proposed and fill it in instead`.
  3. Load the index: `index = await loadSectionIndex(root, { lenient: true })`.
  4. Unknown spec ids (the same rule as preflight's `unknownSpecIds`) → exit 1, `unknown spec section(s): <ids>`.
  5. If `supersedes` is set, `assertSupersedable`.
  6. `report = preflight(index, { title, paths, specIds, supersedes })`.
  7. Build the record:
     - `dir = contextPath(root, "decisions")`, `n = await nextAdrNumber(dir)`, `name = adrFileName(n, title)`;
     - an empty slug (`name === \`${pad4(n)}-.md\``) → exit 1, `title has no letters or digits`;
     - `verifiedAt = status === "accepted" ? (await headSha(root))?.slice(0, 12) ?? null : null`;
     - `date = localDate(now ?? new Date())`.
  8. Write it:
     - `mkdirSync(dir, { recursive: true })`;
     - `writeFileSync(join(dir, name), renderAdr(draft), { flag: "wx" })`, where the draft's `moreInformation` is `preflightMoreInformation(report)`;
     - `EEXIST` → exit 1, `<file> already exists`.
  9. Collision check. If `numberTaken(readdirSync(dir), n, name)`, unlink the new file and throw exit 1: `ADR number ${pad4(n)} was taken concurrently; run decide again`.
  10. If `status === "accepted"` and `supersedes` is set, call `markSuperseded(root, supersedes, n)`. If this throws, the new file stays: the index derives the chain (Task 4).
  11. `notes`: for each spec id whose section `isLoadBearing`: `spec section <id> is load-bearing; make its text agree with this decision, then baton verify-doc <id>`.
  12. `placeholders = placeholdersIn(text).length > 0`.
- **`acceptDecision(root, n)`.**
  1. `findAdrFile`; `null` → exit 1, `no ADR NNNN`.
  2. `statusKind(statusOf(text) ?? "")` must be `proposed`. Otherwise throw `BatonError(\`ADR ${pad4(n)} is ${status || "missing a status"}; only a proposed record can be accepted\`, 2)`.
  3. Placeholders still present → exit 2: `ADR NNNN still has template placeholders (<keys joined ", ">); fill them in first`.
  4. `m = adrNumberFrom(String(parseFrontmatter(lf).data.supersedes ?? ""))`. When `m` is set, `assertSupersedable(root, m)`.
  5. `rewriteRecord` with status `accepted`. When `headSha` is not null, also set `verified_at` to `"<head12>"` (`setFrontmatterField(…, "verified_at", JSON.stringify(head12))`).
  6. When `m` is set, `markSuperseded(root, m, n)`.
- **`listDecisions`.** Take the lenient index's decisions in number order: `{ number, status: adr.status, title, file, supersedes? }`. When `meta.supersededBy` is set but `statusKind(status) !== "superseded"`, the listed status is `` `${status}, superseded by ${supersededBy}` ``.
- **`runPreflight(root, q)`.** `preflight(await loadSectionIndex(root, { lenient: true }), q)`.
- **Command** `decide [title] [--preflight] [--supersedes <adr>] [--status <status>] [--accept <adr>] [--spec <ids>] [--paths <globs>] [--context <text>] [--considered <text>] [--outcome <text>] [--consequence <text>] [--deciders <names>]`.
  - **Options.**
    - `--considered` and `--consequence` repeat: `(v, prev: string[]) => [...prev, v]`, default `[]`.
    - `--spec`, `--paths` and `--deciders` are comma lists: trimmed, empties dropped. Paths go through `normalizeQueryPath`.
    - Declare `--status` **without** a default. The action uses `o.status ?? "proposed"`, so that list mode can tell whether any option was given. Any value other than `proposed` or `accepted` exits 1.
    - Update the doc comment at the top of the file to match ADR 0018.
  - **Setup.** `root = findProjectRoot()`, then `requireContext(root)`.
  - **Modes,** checked in this order:
    1. **`--accept <adr>`.** It must come alone: a title, `--preflight` or `--supersedes` alongside it exits 1, `--accept takes no title and no other mode`. Print `accepted ADR NNNN: <file>`, plus `marked ADR MMMM superseded by ADR NNNN` when a record was superseded.
    2. **`--preflight`.** It needs a title, `--paths` or `--spec`; else exit 1, `preflight needs a title, --paths or --spec`. Print `renderPreflight(report)`. When `counts.constrains > 0`, throw `BatonError(\`${c} accepted decision(s) or load-bearing section(s) constrain this change; read them before deciding (supersede with --supersedes when it replaces one)\`, 2)`.
    3. **A title.** `createDecision`, with `deciders = o.deciders ?? [resolveActor(root)]`. Print:
       - `created ADR NNNN (<status>): <file>`;
       - `renderPreflight(report)`;
       - `note: <note>` per note;
       - `marked ADR MMMM superseded by ADR NNNN`, when it applies;
       - `next: replace the {…} placeholders in the body, then run baton decide --accept NNNN`, when `placeholders` is true.

       Exit 0, even when something constrains the decision.
    4. **No title, `--accept` or `--preflight`.**
       - If any other option is given, exit 1: `a decision needs a title`. "Given" means `--supersedes`, `--status`, `--spec`, `--paths`, `--context`, `--outcome` or `--deciders` is set, or `--considered` or `--consequence` is set **and non-empty**. Those two default to `[]`, so an empty array does not count.
       - Otherwise list: one line per record, `` `${pad4(n)}  ${status}  ${title}${supersedes ? `  (supersedes ${pad4(s)})` : ""}` ``, or `no decisions yet`.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-vyr.1 --claim`
- [ ] **Step 2: Write the failing tests** in `test/decide.test.ts`. Set `BATON_ACTOR = "tester"`, and use `root = makeRepo()` per test.
  - `creates a proposed record`: `createDecision(root, { title: "Use WebAuthn for login", status: "proposed", specIds: ["auth"], paths: ["src/auth/**"], considered: [], consequences: [], deciders: ["tester"], now: new Date("2026-10-21T12:00:00Z") })`:
    - `number` 3, `file` `.context/decisions/0003-use-webauthn-for-login.md`, `placeholders` true;
    - the file contains `status: proposed`, `verified_at: null`, `source_paths: ["src/auth/**"]` and `spec_sections: [auth]`;
    - it contains `Preflight at creation (baton decide): 1 constraining, 2 related, 0 possibly related.` and `* constrains: ADR 0001 (accepted) "Use passkeys for sign-in" (spec: auth)`;
    - `adr-0001`'s file is byte-identical to before.
  - `accepted at creation is stamped`: `{ title: "Keep passwords out", status: "accepted", context: "C.", outcome: "O.", … }` gives `verified_at: "<HEAD12>"`, where `HEAD12` is `runGit(root, "rev-parse", "HEAD").slice(0, 12)`, and `placeholders` false.
  - `accepted needs context and outcome`: with `outcome` missing, it rejects with exit 1, and `.context/decisions/` still has the same entries.
  - `unknown spec ids write nothing`: `specIds: ["ghost"]` rejects with exit 1, and the message contains `ghost`.
  - `notes load-bearing sections`: rewrite `billing`'s body to `Stripe, monthly only (load-bearing).`. Creating with `specIds: ["billing"]` gives a note containing `spec section billing is load-bearing`.
  - `accept refuses placeholders, then accepts`:
    - `acceptDecision(root, 3)` on the record from the first test rejects with exit 2, and the message contains `placeholders (context, option, outcome, good, bad)`;
    - replace every placeholder with plain text (`fs` edits in the test);
    - `acceptDecision` now resolves. Compare the file line by line with its pre-accept text: only the `status:` line (now `status: accepted`) and the `verified_at:` line (now `"<HEAD12>"`) differ.
  - `accept refuses a non-proposed record`: `acceptDecision(root, 1)` rejects with exit 2, and the message contains `ADR 0001 is accepted`.
  - `supersede at acceptance`: create `{ title: "Passkeys v2", status: "accepted", supersedes: 1, context: "C.", outcome: "O.", specIds: ["auth"], … }`.
    - `superseded` equals `{ number: 1, file: ".context/decisions/0001-use-passkeys.md" }`.
    - `statusOf(<0001 text>)` is `"superseded by ADR-0003"`, and the 0001 file differs from before only on its status line.
    - The new file contains `supersedes: "0001"`.
    - `loadSectionIndex(root)` gives `adr-0001.meta.supersededBy` `"adr-0003"`.
  - `a proposed successor leaves the old record alone`: with `status: "proposed", supersedes: 1`, 0001 is byte-identical. After filling the placeholders, `acceptDecision(root, 3)` marks 0001 superseded.
  - `cannot supersede twice`: `supersedes: 2` (already superseded) rejects with exit 2, and nothing is written. `supersedes: 9` rejects with exit 1 (`no ADR 0009`).
  - `keeps CRLF and BOM on the old record`: rewrite 0001 as `"\uFEFF" + text.replace(/\n/g, "\r\n")`, then supersede it. The file still starts with `\uFEFF`, has no `\n` without `\r` before it, and only its status line changed.
  - `lists decisions`: `listDecisions(makeRepo())` gives two rows: `{ number: 1, status: "accepted", … }` and `{ number: 2, status: "superseded by ADR-0001", … }`.
  - **Command tests** (`runCli`):
    - `decide "Use WebAuthn for login" --spec auth --paths "src/auth/**" --deciders tester` exits 0. stdout starts with `created ADR 0003 (proposed): .context/decisions/0003-use-webauthn-for-login.md`, and contains `CONSTRAINS  ADR 0001` and `next: replace the {…} placeholders`.
    - `decide "Use WebAuthn" --preflight --spec auth` exits 2: stdout contains `preflight: 1 constraining`, stderr contains `constrain this change`, and no new file exists.
    - `decide "Use WebAuthn" --preflight --spec auth --supersedes 1` exits 0.
    - `decide --preflight` with nothing else exits 1.
    - `decide --accept 1` exits 2; `decide --accept x` exits 1; `decide --accept 1 "title"` exits 1.
    - `decide` (no arguments) prints a line `0001  accepted  Use passkeys for sign-in`.
    - `decide --supersedes 1` and `decide --spec auth` (no title) each exit 1, with stderr containing `a decision needs a title`, and nothing is listed or written.
    - `decide "X" --status maybe` exits 1.
    - In `makeTempDir()` after `runGit(dir, "init", "-q")`, `decide` exits 1 (no `.context/`).
- [ ] **Step 3: Run.** `npx vitest run test/decide.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `src/core/decide.ts` and the command.
- [ ] **Step 5: Run.** Expected: PASS. Then `npm run check` and `npm run build`. Smoke test on this repo: `node dist/baton.mjs decide` lists ADRs 0001–0021, and `node dist/baton.mjs decide "Use zod for config" --preflight --paths src/core/config.ts` prints a report and exits 0 or 2.
- [ ] **Step 6: Close and commit.** `verify` does not exist yet, so close with `task close`.
  ```bash
  node dist/baton.mjs task close bt-vyr.1 --reason "decide: create, accept, supersede by status, list, --preflight exit 2"
  git add src/core/decide.ts src/commands/decide.ts test/decide.test.ts .context/tasks.jsonl
  git commit -m "feat(decide): MADR records, supersede chains, spec-conflict flags and preflight" -- src/core/decide.ts src/commands/decide.ts test/decide.test.ts .context/tasks.jsonl
  ```

---

### Task 6: verify core: check runner, diff rule, active task

Item `bt-vyr.8`. Claim it first.

**Files:**
- Modify: `src/core/git.ts` (add `changedFilesSince`)
- Create: `src/core/verify.ts`
- Test: `test/verify-core.test.ts`
- Modify: `docs/research/2026-10-16-implementation-notes.md` (§10, the `--since` bullet's status)
- Read first: `src/core/tasks/native/service.ts` (`get`, `list`, `close`, `claim`; `Issue.startedAt`), `src/core/tasks/native/store.ts`, ADR 0019

**Interfaces:**
- Consumes:
  - Existing:
    - `openTaskService(root, config, { actor? })`, which returns `{ service, db }` (the caller must `db.close()`);
    - `TaskService.get(id): Issue | null`, `.list({ status?, assignee?, issueType? }): Issue[]`, `.close(id, reason, force?)`, which throws a `TaskError` with code `has_open_children` or `has_open_blockers`;
    - `Issue { id, status, issueType, assignee?, labels, createdAt, startedAt?, … }`;
    - `isGitRepo(cwd)`, `headSha(cwd)` (`null` without a commit or outside a repo) and `git(args, cwd)` (`src/core/git.ts`);
    - `matchesAny`, `notImplemented(feature, phase)` (exit 3), `BatonError` and `Config`.
  - Phase 1 Task 4 (`src/core/git.ts`): `statusLines(cwd)` (porcelain v1, run with `--no-optional-locks`) and `porcelainPath(line)`.
  - Test helpers:
    - Phase 1 Task 3: `makeRepo`, `makeTempDir`, `writeFiles`, `runGit`, `commitAll` and `CONTEXT_FIXTURE`;
    - Phase 1 Task 8: `withService(root, actor, fn)`, which runs `fn` with an open native `TaskService`.
- Produces:
  ```ts
  // src/core/git.ts
  export async function changedFilesSince(cwd: string, sinceIso: string): Promise<string[][]>;
  // src/core/verify.ts
  export const VERIFY_IGNORED_GLOBS: readonly string[];   // [".context/tasks.jsonl", ".context/memories.jsonl", ".context/STATE.md", ".context/.cache/**"]
  export const DEFAULT_TAIL_CHARS = 4000;
  export function checkCommands(labels: readonly string[]): string[];
  export async function changesSince(root: string, sinceIso: string): Promise<string[]>;
  export interface CheckRun { command: string; exitCode: number | null; timedOut: boolean; tail: string; ms: number }
  export interface RunCheckOptions { timeoutMs?: number; tailChars?: number; onOutput?: (chunk: string, stream: "stdout" | "stderr") => void }
  export async function runCheck(command: string, cwd: string, opts?: RunCheckOptions): Promise<CheckRun>;
  export interface VerifyOptions { requireDiff: boolean; close: boolean; timeoutMs?: number; onOutput?: RunCheckOptions["onOutput"]; onCheckStart?: (command: string) => void }
  export type VerifyOutcome =
    | { status: "already-closed"; id: string }
    | { status: "no-diff"; id: string; since: string }
    | { status: "failed"; id: string; run: CheckRun; passed: CheckRun[] }
    | { status: "passed"; id: string; runs: CheckRun[]; closed: boolean; changes: string[] };
  export async function verifyTask(root: string, config: Config, id: string, opts: VerifyOptions): Promise<VerifyOutcome>;
  export async function activeTask(root: string, config: Config, actor: string): Promise<Issue | null>;
  ```

**Rules (pinned):**
- **`changedFilesSince(cwd, sinceIso)`.**
  1. If `await headSha(cwd)` is `null` (no commit yet, or not a repo), return `[]`.
  2. `s = Math.floor(Date.parse(sinceIso) / 1000)`. If it is `NaN`, throw `Error(\`bad since: ${sinceIso}\`)`.
  3. Run `git -c core.quotePath=false log --no-merges --no-renames --name-only --format=%x00%H %ct --since=<s> HEAD`.
  4. Split on `"\0"` and drop the first chunk. For each chunk, the first line is `<sha> <ct>`. Keep the chunk only when `Number(ct) > s`: **strictly later** than the start second. git stores whole-second committer times, so a commit made in the same second as the claim (such as a test fixture's `init` commit, or the previous task's commit) is never part of the diff. The chunk's files are its remaining non-empty lines.
  5. Return newest first. Any git error after step 1 is rethrown, not swallowed.
- **`checkCommands(labels)`.** Labels that start with `check:`, with the prefix removed and the rest trimmed; empty results are dropped. Label order.
- **`changesSince(root, since)`.** The files of `changedFilesSince(root, since)`, together with `(await statusLines(root)).map(porcelainPath)`. Drop paths that match `VERIFY_IGNORED_GLOBS`, dedupe, and sort with plain `<`.
- **`runCheck(command, cwd, opts)`.**
  - Start it with `spawn(command, { cwd, shell: true, windowsHide: true, env: process.env, detached: process.platform !== "win32" && opts.timeoutMs !== undefined })`, with `setEncoding("utf8")` on both streams.
    - On POSIX with a timeout, `detached` makes the shell lead its own process group, so the timeout can kill the whole tree.
    - Without a timeout (the `verify` command), the check stays in the terminal's process group, so Ctrl+C still reaches it.
  - Every chunk goes to `onOutput`, and is appended to a combined buffer that keeps only its last `tailChars` (default 4000).
  - Record the code from the `exit` event. Resolve on `close`: `{ command, exitCode: code, timedOut, tail, ms }`.
  - **Timeout.** When `timeoutMs` is set and elapses, set `timedOut`, then kill the whole tree:
    - **win32:** run `spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"])` **first**, while the tree still exists, ignoring its errors; then `child.kill()`. Killing `cmd.exe` first would orphan its children, and `taskkill /T` cannot find a tree from a dead PID.
    - **POSIX:** `process.kill(-child.pid, "SIGKILL")` (the process group), and fall back to `child.kill("SIGKILL")` if that throws.
    - **Backstop:** if `close` has not fired 2 s after the kill, call `child.stdout.destroy()` and `child.stderr.destroy()`, then resolve with the code recorded from `exit` (or `null`). An orphan holding the inherited pipes open can otherwise keep `close` from ever firing.
  - A spawn `error` resolves with `exitCode: null` and the error message as `tail`.
- **`verifyTask(root, config, id, opts)`.**
  1. If `config.tasks.backend !== "native"`, call `notImplemented(\`verify for the ${backend} task backend\`, "a later phase")` (exit 3).
  2. Read the issue with a short-lived service (open, `get`, close in `finally`).
     - `null` → `BatonError(\`no task ${id}\`)` (exit 1).
     - Status `closed` → `{ status: "already-closed", id }`. Nothing runs.
  3. `checks = checkCommands(issue.labels)`. Empty → `BatonError(\`task ${id} has no check: label; add one with baton task update ${id} --add-labels "check:<command>"\`)` (exit 1).
  4. **Diff rule,** when `opts.requireDiff` is set:
     - not a git repo → `BatonError("verify needs a git repository for its diff rule; pass --no-diff to skip it")` (exit 1);
     - `since = issue.startedAt ?? issue.createdAt`, and `changes = await changesSince(root, since)`;
     - `[]` → `{ status: "no-diff", id, since }`.
  5. Run the checks in order: `onCheckStart?.(cmd)`, then `runCheck(cmd, root, { timeoutMs, onOutput })`. The first run with `exitCode !== 0` or `timedOut` gives `{ status: "failed", id, run, passed: <the runs before it> }`.
  6. If `opts.close`: open a service, call `close(id, \`verified: ${checks.join("; ")}\`)`, and close the db in `finally`. A `TaskError` propagates.
  7. `{ status: "passed", id, runs, closed: opts.close, changes }`. `changes` is `[]` when the diff rule is off.
- **`activeTask(root, config, actor)`.** `null` unless the backend is native.
  - Take `list({ status: ["in_progress"], assignee: actor })`, filtered to `issueType !== "epic"` with at least one `checkCommands` entry.
  - Sort by `startedAt ?? updatedAt` descending, then id ascending, and take the first, or `null`.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-vyr.8 --claim`
- [ ] **Step 2: Write the failing tests** in `test/verify-core.test.ts`. Set `BATON_ACTOR = "tester"`. `PASS` is `'node -e "process.exit(0)"'` and `FAIL3` is `'node -e "process.exit(3)"'`.
  - `changedFilesSince filters by committer time`. Every commit in this repo gets an explicit date, so that dates rise along the history:
    1. `root = makeRepo(CONTEXT_FIXTURE, { git: false })`, then `runGit(root, "-c", "init.defaultBranch=main", "init", "-q")`.
    2. Set `process.env.GIT_COMMITTER_DATE = "2025-12-01T00:00:00+00:00"` and `commitAll(root, "base")`.
    3. Set it to `"2026-01-01T00:00:00+00:00"`, write `old.txt`, and `commitAll`.
    4. Set it to `"2026-06-01T00:00:00+00:00"`, write `new.txt`, and `commitAll`.
    5. Delete the variable in `finally`, so later tests commit with the real time.

    Then:
    - `changedFilesSince(root, "2026-03-01T00:00:00.000Z")` equals `[["new.txt"]]`;
    - `"2027-01-01T00:00:00.000Z"` gives `[]`;
    - `"2025-12-15T00:00:00.000Z"` gives `[["new.txt"], ["old.txt"]]`;
    - **same second is excluded:** `"2026-06-01T00:00:00.500Z"` (the second in which `new.txt` was committed) gives `[]`, and `"2026-05-31T23:59:59.000Z"` gives `[["new.txt"]]`;
    - an empty repo (`makeTempDir()` plus `runGit(dir, "init", "-q")`) gives `[]`, and so does a plain `makeTempDir()` (not a repo). Both go through the `headSha` check;
    - `changedFilesSince(root, "not a date")` rejects. Pin it in step 2: when `Date.parse` gives `NaN`, throw `Error(\`bad since: ${sinceIso}\`)` before running git.

    The implementation puts no `try`/`catch` around the `git log` call. The reviewer checks this, since a git failure inside a repo cannot be produced portably in a test.
  - `changesSince ignores task-store churn`: in the same repo, modify `old.txt`, write `.context/tasks.jsonl`, `.context/STATE.md` and `.context/.cache/x`, and commit nothing. `changesSince(root, "2026-03-01T00:00:00.000Z")` equals `["new.txt", "old.txt"]`.
  - `checkCommands(["spec:x", "check:npm test", "check:  node -e 0 ", "check:"])` → `["npm test", "node -e 0"]`.
  - `runCheck`:
    - `PASS` gives `exitCode` 0 and `timedOut` false; `FAIL3` gives 3;
    - `node -e "process.stdout.write('x'.repeat(5000))"` gives a `tail` of length 4000, and `onOutput` receives all 5000 characters;
    - write `marker.txt` in a temp dir. `node -e "process.exit(require('fs').existsSync('marker.txt')?0:4)"` with that dir as `cwd` gives 0;
    - **The timeout kills the whole tree,** on both Windows and POSIX. In a temp dir as `cwd`, run `node -e "require('fs').writeFileSync('pid.txt',String(process.pid));setInterval(()=>0,1000)"` with `timeoutMs: 300`:
      - it resolves with `timedOut` true in **under 1500 ms**, before the 2 s backstop could fire. With the wrong kill order, the pipes would only be released by the backstop, at about 2.3 s;
      - read the grandchild's pid from `pid.txt`, then poll every 50 ms for up to 1 s until `process.kill(pid, 0)` throws with `code === "ESRCH"`. If it never throws, the test fails: the grandchild survived.
  - **`verifyTask` fixture:** `root = makeRepo()`. In `withService(root, "tester", s => …)`: `t = s.create({ title: "Work", labels: [\`check:${PASS}\`] })`, then `s.claim(t.id)`. **Each bullet below is its own `it`, with a fresh fixture.** The fixture's `init` commit lands in the same second as the claim, or an earlier one, so it never counts as a change.
    - With nothing changed: `{ requireDiff: true, close: true }` → `status` `"no-diff"`. The claim's `tasks.jsonl` write does not count.
    - Modify `src/auth/login.ts`: → `"passed"`, `closed` true, and `changes` equals `["src/auth/login.ts"]`. The stored task has `status` closed and `closeReason` `verified: node -e "process.exit(0)"`.
    - `requireDiff: false` with no change → `"passed"`.
    - `close: false` → `"passed"`, `closed` false, and the task is still `in_progress`.
    - Labels `[check:PASS, check:FAIL3]` with a change → `"failed"`: `run.exitCode` 3, `passed.length` 1, and the task is still `in_progress`.
    - A closed task with a `FAIL3` label → `"already-closed"` (nothing runs).
    - No check label → rejects with exit 1, and the message contains `has no check: label`. `"bt-zzz"` → exit 1.
    - `makeRepo(CONTEXT_FIXTURE, { git: false })` with `requireDiff: true` → exit 1, with the message containing `--no-diff`. With `requireDiff: false` → `"passed"`.
    - `ConfigSchema.parse({ tasks: { backend: "none" } })` → exit 3.
    - Task `D` with `deps: [["blocks", B.id]]`, where `B` is open, a `PASS` label and a change: `verifyTask` rejects with a `TaskError` whose code is `has_open_blockers`, and `D` stays open.
  - `activeTask`:
    - claim `A` (`PASS`), wait 5 ms, then claim `B` (`PASS`): the result is `B`;
    - an in-progress epic with a check label is ignored;
    - a task claimed by `"alice"` is ignored for actor `"tester"`;
    - a task without a check label is ignored;
    - nothing qualifies → `null`.
- [ ] **Step 3: Run.** `npx vitest run test/verify-core.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `changedFilesSince` and `src/core/verify.ts`.
- [ ] **Step 5: Run.** Expected: PASS. Then, in implementation notes §10, replace the `--since` bullet's ending ("🟡 not yet observed; …") with "🟡 observed: the `changedFilesSince` test in `test/verify-core.test.ts` passed on <the actual run date>." It stays 🟡: a local test is an observation, not official documentation. Then run `npm run check` and `npm run build`.
- [ ] **Step 6: Close and commit.** The CLI command lands in Task 7, so close with `task close`.
  ```bash
  node dist/baton.mjs task close bt-vyr.8 --reason "check runner, diff rule from started_at, active task"
  git add src/core/git.ts src/core/verify.ts test/verify-core.test.ts docs/research/2026-10-16-implementation-notes.md .context/tasks.jsonl
  git commit -m "feat(verify): check runner, diff-since-claim rule and active task" -- src/core/git.ts src/core/verify.ts test/verify-core.test.ts docs/research/2026-10-16-implementation-notes.md .context/tasks.jsonl
  ```

---

### Task 7: `baton verify`; `task close` needs `--force` on checked tasks; stats counts verify

Item `bt-vyr.2`. Claim it first. This is the first item closed by `verify` itself.

**Files:**
- Modify: `src/commands/verify.ts`
- Modify: `src/commands/task.ts`: add `export` to `toBatonError`, and add the checked-task rule to the `close` action and its `--force` description. Nothing else.
- Modify: `src/core/stats.ts` (Phase 1 Task 13; the tasks-closed regex only)
- Modify: `test/skills-e2e.test.ts` (Phase 1 Task 19; step 7 only, see Step 4)
- Test: `test/verify-command.test.ts`; add one test to `test/stats-session.test.ts` (Phase 1 Task 13)
- Read first: `src/commands/verify.ts`, `src/commands/task.ts` (`toBatonError`, `withTasks`, the `close` action), `test/skills-e2e.test.ts`, ADR 0019

**Interfaces:**
- Consumes:
  - Task 6 (`src/core/verify.ts`): `verifyTask(root, config, id, { requireDiff, close, onOutput?, onCheckStart? })`, which resolves to one of:
    - `{ status: "already-closed" }`;
    - `{ status: "no-diff", since }`;
    - `{ status: "failed", run: { command, exitCode, timedOut } }`;
    - `{ status: "passed", runs, closed }`.

    It throws a `BatonError` (exit 1 or 3) or a `TaskError`.
  - Task 6: `checkCommands(labels): string[]` (`src/core/verify.ts`).
  - `toBatonError(err: TaskError): BatonError` in `src/commands/task.ts`: `has_open_children` and `has_open_blockers` map to exit 2.
  - The existing `task close <ids...> [-r, --reason <text>] [-f, --force] [--json]` action. Inside `withTasks`, it calls `s.close(id, o.reason, Boolean(o.force))` for each id; the default reason is `Closed`.
  - Phase 1 Task 19's `test/skills-e2e.test.ts`, step 7 ("checkpoint's verify fallback"): it creates `Add store` with `--check "node -e 0"`, claims it, runs `node -e 0`, then `task close <id> --reason "check passed: node -e 0"`.
  - Phase 1 Task 6: `requireContext(root)` and `runCli(args, cwd)`.
  - Phase 1 Task 13 (`src/core/stats.ts`), the tasks-closed rule: Bash tool uses that did not fail, with the command matched against `/\btask\s+close\s+([^\n;&|]*)/g`, then whitespace tokens up to the first one starting with `-`, kept when they match `/^[a-z0-9]+-[a-z0-9]+(?:\.\d+)*$/`, deduped. Test builders `toolUse`, `toolResult` (Phase 1 Task 11, `test/helpers/transcript.ts`) and `sessionMetrics(records, { sessionId, root, platform })`.
  - Existing: `loadConfig`, `findProjectRoot`, `action`, `BatonError`, `ExitCode`, `TaskError`.
  - Test helpers: `makeRepo`, `withService`, `writeFiles`, `makeTempDir`, `runGit`.
- Produces:
  - The command `verify <task-id> [--no-diff]`.
  - `export function toBatonError(err: TaskError): BatonError` (`src/commands/task.ts`).
  - The `task close` rule below.
  - The stats regex becomes `/\b(?:task\s+close|verify)\s+([^\n;&|]*)/g`.

**`task close` on checked tasks (pinned, ADR 0019).** In the `close` action, inside `withTasks`, before closing anything:
1. For every id, `issue = s.get(id)`; skip `null`, which `close` reports as before.
2. If `checkCommands(issue.labels).length > 0` and `!o.force`, throw `BatonError(\`${id} has a check (${cmds.join("; ")}); close it with baton verify ${id}, or with task close --force and a reason\`, ExitCode.Blocked)`. This happens before any id is closed, so `task close A B` with a checked `B` closes nothing.
3. Close each id. For a checked task closed with `--force`, the reason is `` `forced (check not run): ${o.reason}` ``. For every other task the reason is unchanged.

Set the `--force` description to `close even with open children, open blockers or a check: label (recorded as forced)`. `verify` closes through the task service, not this action, so it is unaffected.

**Command (pinned):**
1. `root = findProjectRoot()`, `requireContext(root)`, and `config = await loadConfig(root)`.
2. Call `verifyTask(root, config, id, { requireDiff: config.verify.requireDiff && o.diff !== false, close: true, onCheckStart: (c) => process.stdout.write(\`running check: ${c}\n\`), onOutput: (chunk, s) => (s === "stdout" ? process.stdout : process.stderr).write(chunk) })`. A `TaskError` is rethrown as `toBatonError(err)`.
3. Map the outcome:
   - `already-closed` → stdout `<id> is already closed`, exit 0.
   - `no-diff` → `BatonError(\`no changes since ${id} was started (${since}); verify needs a non-empty diff outside the task store (use --no-diff for a task without file changes)\`, 2)`.
   - `failed` → `BatonError(\`check failed (${run.timedOut ? "timed out" : \`exit ${run.exitCode}\`}): ${run.command}; ${id} stays open\`, 2)`.
   - `passed` → stdout `closed <id> (checks passed: <commands joined "; ">)`.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-vyr.2 --claim`
- [ ] **Step 2: Write the failing tests** in `test/verify-command.test.ts`. Set `BATON_ACTOR = "tester"`, and use the Task 6 fixture (`makeRepo()`, a task with label `check:node -e "process.exit(0)"`, claimed by `tester`). **Each bullet is its own `it`, with a fresh fixture**, except where a bullet says "again" or "then".
  - With `src/auth/login.ts` modified, `runCli(["verify", id], root)` exits 0. stdout contains `running check: node -e "process.exit(0)"` and `closed <id> (checks passed: node -e "process.exit(0)")`.
  - Then running it again exits 0 with `<id> is already closed`.
  - With nothing changed: exit 2, stderr contains `no changes since`, and the task is still in progress. `verify <id> --no-diff` then exits 0.
  - A `check:node -e "process.exit(3)"` label with a change: exit 2, stderr contains `check failed (exit 3)` and `stays open`.
  - Open blockers: exit 2, and stderr contains `blocked by open`.
  - `verify bt-zzz` → exit 1.
  - `verify` in `makeTempDir()` after `runGit(dir, "init", "-q")` → exit 1.
  - **`task close` on a checked task:**
    - `runCli(["task", "close", id], root)` exits 2. stderr contains `has a check` and `baton verify`, and the task is still `in_progress`.
    - `task close <id> --force --reason manual` exits 0, and the stored `closeReason` is `forced (check not run): manual`.
    - A task created without a check label: `task close <id2> --reason done` exits 0, and its `closeReason` is `done`.
    - `task close <id2> <id>`, where only `<id>` is checked, exits 2, and `<id2>` is still open.
  - **stats**, in `test/stats-session.test.ts`: `toolUse("v1", "Bash", { command: "node dist/baton.mjs verify bt-3 --no-diff" })` plus `toolResult("v1", "closed bt-3")` gives `tasksClosed` containing `"bt-3"`. `toolUse("v2", "Bash", { command: "baton verify-doc auth" })` adds nothing. The existing `task close` test still passes.
- [ ] **Step 3: Run.** `npx vitest run test/verify-command.test.ts test/stats-session.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the command, the `export`, the `task close` rule and the regex change. Then update Phase 1's `test/skills-e2e.test.ts` step 7, which the close rule would otherwise break: replace its `node -e 0` run and its `task close <id> --reason …` with two steps:
  - append a line to `src/db/store.ts`;
  - `runCli(["verify", id], dir)`, expecting exit 0 and stdout containing `closed <id>`.

  Leave every other e2e step unchanged; Task 16 rewrites steps 6–10 later.
- [ ] **Step 5: Run.** Expected: PASS, including `test/skills-e2e.test.ts`. Then `npm run check` and `npm run build`.
- [ ] **Step 6: Close through `verify` (dogfood), then commit.**
  1. `node dist/baton.mjs verify bt-vyr.2`. It runs `npm run check`: allow up to 10 minutes, and set the shell tool's `timeout` to 600000 ms.
     - Expected: `closed bt-vyr.2 (checks passed: npm run check)`, exit 0.
     - On exit 2, fix the cause and run it again.
  2. Commit:
     ```bash
     git add src/commands/verify.ts src/commands/task.ts src/core/stats.ts test/verify-command.test.ts test/stats-session.test.ts test/skills-e2e.test.ts .context/tasks.jsonl
     git commit -m "feat(verify): close tasks only on passing checks and a non-empty diff" -- src/commands/verify.ts src/commands/task.ts src/core/stats.ts test/verify-command.test.ts test/stats-session.test.ts test/skills-e2e.test.ts .context/tasks.jsonl
     ```

---

### Task 8: Guard classifier (pure)

Item `bt-vyr.9`. Claim it first.

**Files:**
- Modify: `src/hooks/guards.ts` (keep `PROTECTED_GLOBS`, `isProtectedPath`, `editTargets` and `shellMayWriteProtected` exported; their existing tests keep passing)
- Test: `test/guards.test.ts` (add `describe` blocks; keep the existing ones)
- Read first: `src/hooks/guards.ts`, `test/guards.test.ts`, ADR 0020

**Interfaces:**
- Consumes (existing):
  - `editTargets(toolName, toolInput): string[]`: Edit, Write and MultiEdit (`file_path`), NotebookEdit (`notebook_path`), Gemini `write_file` and `replace`, and Codex `apply_patch` headers.
  - `matchesAny` (`src/core/glob.ts`).
  - Task 3 (`src/core/decisions.ts`): `statusOf(text)`, `statusKind(status)`, `pad4`, and `frontmatterBlock(text)`, which returns the BOM/CRLF-normalised `---\n…\n---` block or `null`.
- Produces:
  ```ts
  export type ProtectedRule = "state" | "tasks" | "memories" | "cache" | "beads" | "context-dir" | "adr-new" | "adr-final" | "adr-status" | "adr-shell";
  export type ProtectedClass = "state" | "tasks" | "memories" | "cache" | "beads" | "decision";
  export const SHELL_TOOLS: readonly string[];          // ["Bash", "PowerShell", "run_shell_command"]
  export function toRepoTarget(p: string, root: string, cwd: string, platform?: NodeJS.Platform): string | null;
  export function protectedClass(repoPath: string, platform?: NodeJS.Platform): ProtectedClass | null;
  export function shellCommandOf(tool: string, input: Record<string, unknown>): string | null;
  export function shellSegments(command: string): string[];
  export function shellWriteTargets(command: string): string[];    // normalised mentions written, deduped, in order
  export function mentionRule(mention: string): ProtectedRule;     // shell-side rule for a mention
  export function dependencyManifests(command: string): string[];
  export function applyEdits(tool: string, input: Record<string, unknown>, current: string): string | null;
  export function patchTouchesFrontmatter(patch: string): boolean;
  export interface AdrState { exists: boolean; status: string | null }
  export interface GuardEnv {
    root: string; cwd: string; platform: NodeJS.Platform;
    adrState(repoPath: string): AdrState;
    readText(repoPath: string): string | null;     // the file's current text, or null when unreadable
  }
  export interface Denial { rule: ProtectedRule; path: string; reason: string }
  export function denyReason(rule: ProtectedRule, path: string, status?: string): string;
  export function checkToolCall(tool: string, input: Record<string, unknown>, env: GuardEnv): Denial | null;
  // kept: shellMayWriteProtected(command) === shellWriteTargets(command).length > 0
  ```

**Rules (pinned):**
- **`toRepoTarget(p, root, cwd, platform = process.platform)`.**
  1. `a = p.trim().replace(/\\/g, "/")`. Normalise `r = root` and `c = cwd` the same way, and strip trailing slashes from both.
  2. `abs = isAbs(a) ? a : posix.join(c, a)`, where `isAbs` is `/^[A-Za-z]:\//` or a leading `/`. Then `abs = posix.normalize(abs)`.
  3. Under the root means `abs` starts with `r + "/"`. On `win32` the comparison is on lowercased strings; on other platforms it is exact.
  4. Return `abs.slice(r.length + 1)`, keeping the original case, or `null` when the path is not under the root (or is the root itself).
- **`protectedClass(rp, platform)`.** `q = platform === "win32" ? rp.toLowerCase() : rp`. The first rule that holds:
  - `q === ".context/STATE.md"` → `state`. On win32 the comparison is with the lowercased constant, as for the next three;
  - `.context/tasks.jsonl` → `tasks`;
  - `.context/memories.jsonl` → `memories`;
  - starts with `.context/.cache/` → `cache`;
  - starts with `.beads/` → `beads`;
  - matches `/^\.context\/decisions\/(\d{4})-[^/]+\.md$/i` with a number ≥ 1 → `decision`;
  - otherwise `null`.
- **`shellCommandOf(tool, input)`.** For a tool in `SHELL_TOOLS`: `input.command` when it is a string, or the strings of an array joined with `" "`. Otherwise `null`.
- **`shellSegments(cmd)`.**
  1. `t = cmd.replace(/\\/g, "/")`.
  2. `t = t.replace(/&>>?/g, (m) => (m === "&>>" ? " >> " : " > "))`.
  3. `t = t.replace(/\d*>&\d*/g, " ")`. Descriptor duplications such as `2>&1` are not files.
  4. Split on `/&&|\|\||[;|&\n\r]/`, trim the parts, and drop the empty ones.
- **Mentions.** Matches of this regex in a segment, normalised by stripping a leading `./`:
  ```ts
  const SEG = String.raw`[^\s"'\`;|&<>()]`;
  const MENTION_RE = new RegExp(String.raw`(?:^|[\s"'\`=(:,])((?:${SEG}*/)?(?:\.context(?:/(?:STATE\.md|tasks\.jsonl|memories\.jsonl|decisions(?:/${SEG}*)?|\.cache(?:/${SEG}*)?))?/?|\.beads(?:/${SEG}*)?))(?=$|[\s"'\`;|&<>()])`, "gi");
  ```
  `.context/knowledge/x.md`, `.context/spec.md` and `.context/STATE.md.bak` are not mentions; bare `.context` and `.context/` are.
- **Is a token a mention?** Used for redirect targets and the `cp` destination. Strip one pair of surrounding quotes from the token. It is written when `MENTION_RE`, with a fresh `lastIndex` (reset it to 0, or build a new RegExp), finds a match inside the stripped token. The written mention is that match's group 1. The same rule applies wherever this section says "is a mention".
- **`shellWriteTargets(cmd)`.** For each segment:
  1. **Redirects.** For each match of `/(^|[^<>=-])(>>?)\s*("[^"]*"|'[^']*'|[^\s;|&<>()]+)/g`, the target token is written when it is a mention. (Write the class `[^<>=-]`, not `[^<>=\-]`, which Biome flags as a useless escape.)
  2. **The command name.** Words are `seg.match(/"[^"]*"|'[^']*'|\S+/g)`. Skip leading env assignments (`/^[A-Za-z_]\w*=/`) and the wrappers `sudo`, `env`, `command`, `nohup` and `time`. The name is the next word: quotes stripped, everything up to the last `/` removed, a trailing `.exe` or `.cmd` removed (case-insensitive), and lowercased.
  3. **Write commands,** when the segment has mentions:
     - **Destination only:** `cp`, `copy`, `copy-item`, `cpi`, `install`, `rsync`. The destination is the word after a `-destination` parameter (case-insensitive), else the last word that does not start with `-`. It counts when it is a mention.
     - **`sed`:** all mentions, only when a word is `-i`, starts with `-i`, or is `--in-place`.
     - **`perl`:** all mentions, only when a word matches `/^-\w*i/`.
     - **`git`:** all mentions, only when the subcommand is `checkout`, `restore`, `rm` or `mv`. The subcommand is the first word after `git` once git's global options are skipped: `-C <dir>` and `-c <key=value>` (each with its next word), and any word starting with `--` (`--no-pager`, `--git-dir=…`).
     - **All mentions:** `rm`, `mv`, `tee`, `tee-object`, `truncate`, `touch`, `dd`, `ln`, `unlink`, `shred`, `set-content`, `add-content`, `out-file`, `new-item`, `remove-item`, `move-item`, `clear-content`, `clc`, `rename-item`, `sc`, `ac`, `ni`, `ri`, `mi`, `rni`, `ren`, `rename`, `del`, `erase`, `rd`, `rmdir`, `move`.
  4. **Write APIs.** When the segment has mentions and matches `/\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|WriteAllText|WriteAllLines|WriteAllBytes|AppendAllText|AppendAllLines|Set-Content|Add-Content|Out-File|Tee-Object|New-Item|Remove-Item|Move-Item|Clear-Content)\b|\bopen\s*\([^)]*['"][wax]\+?['"]/i`, all mentions count.
  5. **Nested shells, one level deep.** When the name is `bash`, `sh`, `zsh`, `cmd`, `pwsh` or `powershell`, and a later word, lowercased, is `-c`, `/c` or `-command`: run `shellWriteTargets` on the rest of the segment after that word, with one pair of surrounding quotes stripped.

  Collect, normalise and dedupe in order.
- **`mentionRule(m)`.** On `lc = m.toLowerCase()`, the first rule that holds:
  - ends with `state.md` → `state`;
  - ends with `tasks.jsonl` → `tasks`;
  - ends with `memories.jsonl` → `memories`;
  - contains `.context/.cache` → `cache`;
  - contains `.beads` → `beads`;
  - contains `.context/decisions` → `adr-shell`;
  - otherwise `context-dir`.
- **`dependencyManifests(cmd)`.** For each segment: the words, with env assignments and wrappers skipped as above, and the name lowercased.
  - **`npm`:** the second word is `install`, `i`, `add` or `in`, and some later word does not start with `-` → `package.json`.
  - **`pnpm`, `yarn`, `bun`:** the second word is `add` → `package.json`.
  - **`pip`, `pip3`, or `python`/`python3`/`py` with `-m pip`:** `install` follows. Skip every word that starts with `-`, and the word after each of `-r`, `--requirement`, `-c`, `--constraint`, `-e` and `--editable`. If any word remains, the result is `requirements.txt`, `pyproject.toml`. So `pip install -r requirements.txt` and `pip install -e .` install what is already declared and do not count.
  - **`uv add`, `poetry add`** → `pyproject.toml`.
  - **`cargo add`** → `Cargo.toml`.
  - **`go get`** → `go.mod`.

  Deduped, in order.
- **`applyEdits(tool, input, current)`.** The text the file would have after the call.
  - First normalise `current`, and every `old_string` and `new_string`, to LF: strip one BOM from `current`, then `replace(/\r\n?/g, "\n")`. A CRLF record and an LF `old_string` then still match, and the comparison of frontmatter blocks is line-ending-blind.
  - Write and `write_file`: `input.content` when it is a string, else `null`. `frontmatterBlock` normalises it.
  - Edit and `replace`: apply one replacement of `old_string` by `new_string` to `current`. With `replace_all === true`, replace every occurrence (`split`/`join`); otherwise only the first. When `old_string` does not occur, `current` is unchanged.
  - MultiEdit: apply each entry of `input.edits` in order, the same way, each honouring its own `replace_all`.
  - Missing or non-string fields, and any other tool, give `null`.
- **`patchTouchesFrontmatter(patch)`.** `/^[+-][ \t]*(?:status|supersedes|verified_at|id|kind)[ \t]*:/m.test(patch)`, the line heuristic used for `apply_patch`.
- **`checkToolCall(tool, input, env)`.** The first denial wins.
  1. **Shell tools.** `cmd = shellCommandOf(...)`. For the first mention in `shellWriteTargets(cmd)`: `rule = mentionRule(m)`, with denial `{ rule, path: m, reason: denyReason(rule, m) }`.
  2. **Edit tools.** For each `p` of `editTargets(tool, input)`, in order: `rp = toRepoTarget(p, env.root, env.cwd, env.platform)`; skip `null`. Then `cls = protectedClass(rp, env.platform)`. Every edit-tool denial is `{ rule, path: rp, reason: denyReason(rule, rp, status) }`:
     - `state`, `tasks`, `memories`, `cache`, `beads` → a denial with that rule;
     - `decision`: `st = env.adrState(rp)`.
       - `!st.exists` → `adr-new`.
       - `statusKind(st.status ?? "") !== "proposed"` → `adr-final`, with the status, or `unknown` when it is null.
       - Proposed: `current = env.readText(rp)`.
         - `current === null` → `adr-status`.
         - `apply_patch` → `adr-status` when `patchTouchesFrontmatter(input.input)`.
         - Any other tool: `next = applyEdits(tool, input, current)`. `next === null` (for example NotebookEdit) → `adr-status`. `frontmatterBlock(next) !== frontmatterBlock(current)` → `adr-status`. This covers `status`, `supersedes`, `verified_at` and every other frontmatter key, through any spelling of the edit.
         - Otherwise allowed.
  3. Otherwise `null`.
- **`denyReason(rule, path, status)`,** exact strings. `<NNNN>` comes from `/(\d{4})-/` in the path.
  - `state`: ``baton: .context/STATE.md is generated by `baton handoff` and is never edited by hand (ADR 0015). `baton handoff` regenerates it; lasting notes go in a task comment (`baton task comment <id> …`), a knowledge file or a decision.``
  - `tasks`: ``baton: .context/tasks.jsonl is the task store and changes only through `baton task …` (ADR 0009): create, update --claim, comment, dep add, close. `baton verify <id>` runs a task's check and closes it.``
  - `memories`: ``baton: .context/memories.jsonl changes only through `baton remember` and `baton forget` (ADR 0009).``
  - `cache`: ``baton: .context/.cache/ is baton's local cache and is rebuilt automatically; nothing in it needs a hand edit.``
  - `beads`: ``baton: .beads/ belongs to Beads; change it with `bd`.``
  - `context-dir`: ``baton: the .context/ directory holds baton's committed state; move or delete files in it through baton commands, not the shell.``
  - `adr-new`: ``baton: new decision records are created with `baton decide "<title>" --spec <ids>` (ADR 0018), which numbers the file and writes the MADR skeleton; the body of a proposed record can then be edited.``
  - `adr-final`: ``baton: <path> has status "<status>" and is append-only (ADR 0001). A changed decision is a new record: `baton decide "<title>" --supersedes <NNNN>`.``
  - `adr-status`: ``baton: the frontmatter of <path> (status, supersedes, verified_at …) changes only through `baton decide --accept <NNNN>` or a superseding record (ADR 0018); edit the body below the frontmatter.``
  - `adr-shell`: ``baton: decision records are written by `baton decide` (ADR 0018); only a proposed record's body may be edited, with the edit tools.``

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-vyr.9 --claim`
- [ ] **Step 2: Write the failing tests** in `test/guards.test.ts`.
  - **`shellWriteTargets` must deny.** Each command gives a non-empty result whose first entry `mentionRule`s to the rule shown:
    1. `echo hi >> .context/STATE.md` → state
    2. `echo x > .context\STATE.md` → state
    3. `echo x>N:\repo\.context\STATE.md` → state
    4. `sed -i 's/a/b/' .context/decisions/0001-x.md` → adr-shell
    5. `echo '{}' >> .context/tasks.jsonl` → tasks
    6. `cat notes.md | tee -a .context/memories.jsonl` → memories
    7. `Set-Content -Path .context\STATE.md -Value x` → state
    8. `"x" | Out-File -FilePath ".\.context\STATE.md"` → state
    9. `Add-Content .context/tasks.jsonl '{}'` → tasks
    10. `cp /tmp/state.md .context/STATE.md` → state
    11. `mv .context/tasks.jsonl /tmp/t.jsonl` → tasks
    12. `rm -rf .context` → context-dir
    13. `git checkout -- .context/tasks.jsonl` → tasks
    14. `node -e "require('fs').writeFileSync('.context/STATE.md','x')"` → state
    15. `powershell -Command "Set-Content .context\STATE.md x"` → state
    16. `perl -pi -e 's/a/b/' .context/STATE.md` → state
    17. `Remove-Item .context\decisions\0001-x.md` → adr-shell
    18. `echo x &> .context/STATE.md` → state
    19. `ECHO X > .CONTEXT\STATE.MD` → state
    20. `[IO.File]::WriteAllText(".context/STATE.md", "x")` → state
    21. `bash -c "rm .context/memories.jsonl"` → memories
    22. `rm -rf .context/.cache/tasks.db` → cache
    23. `git -C sub checkout -- .context/STATE.md` → state
    24. `"x" | Tee-Object -FilePath .context\STATE.md` → state
    25. `clc .context\STATE.md` → state
    26. `cmd /C "del .context\tasks.jsonl"` → tasks
    27. `powershell -COMMAND "Out-File -FilePath .context\STATE.md"` → state
    28. `C:\tools\rm.cmd .context\STATE.md` → state
  - **`shellWriteTargets` must allow.** Each gives `[]`:
    1. `cat .context/STATE.md`
    2. `git add .context/decisions/0018-x.md .context/tasks.jsonl`
    3. `git commit -m "docs: a then b" -- .context/tasks.jsonl`
    4. `grep -n status .context/decisions/*.md > out.txt`
    5. `cp .context/STATE.md /tmp/state-copy.md`
    6. `node dist/baton.mjs task close bt-1 --reason "check passed"`
    7. `echo hi > notes.md`
    8. `sed -n 1,20p .context/STATE.md`
    9. `Get-Content .context\STATE.md | Select-Object -First 5`
    10. `npm run check 2>&1 | tee check.log`
    11. `ls .context/knowledge && rm .context/knowledge/old.md`
    12. `git diff -- .context/tasks.jsonl`
    13. `cat .context/STATE.md.bak > x`
    14. `node dist/baton.mjs decide --accept 22`
    15. `git -C sub log -- .context/STATE.md`
  - **Mentions inside a token:** `shellWriteTargets('echo x > "./.context/STATE.md"')` equals `[".context/STATE.md"]`. Calling `shellWriteTargets` twice in a row with the same command returns the same result, which proves `lastIndex` is reset.
  - `the existing shellMayWriteProtected tests still pass` (keep them as they are).
  - **`toRepoTarget`:**
    - `("N:\\repo\\.context\\STATE.md", "N:\\repo", "N:\\repo", "win32")` → `".context/STATE.md"`;
    - `("n:/REPO/.context/state.md", "N:\\repo", "N:\\repo", "win32")` → `".context/state.md"`;
    - `("/work/demo/.context/STATE.md", "/work/demo", "/work/demo", "linux")` → `".context/STATE.md"`;
    - `("/work/Demo/.context/STATE.md", "/work/demo", "/work/demo", "linux")` → `null`;
    - `(".context/STATE.md", "/work/demo", "/work/demo/src", "linux")` → `"src/.context/STATE.md"`;
    - `("../.context/STATE.md", "/work/demo", "/work/demo/src", "linux")` → `".context/STATE.md"`;
    - `("./.context/STATE.md", "/work/demo", "/work/demo", "linux")` → `".context/STATE.md"`;
    - `("/elsewhere/x", "/work/demo", "/work/demo", "linux")` → `null`, and `("/work/demo", …)` → `null`.
  - **`protectedClass`:**
    - `.context/STATE.md` → state on both platforms; `.context/state.md` → state on `win32` and `null` on `linux`;
    - `.context/tasks.jsonl` → tasks; `.context/memories.jsonl` → memories; `.context/.cache/tasks.db` → cache; `.beads/issues.jsonl` → beads;
    - `.context/decisions/0001-x.md` → decision; `.context/decisions/0001-X.md` → decision;
    - `.context/decisions/0000-template.md` → `null`; `.context/decisions/README.md` → `null`;
    - `.context/spec.md`, `.context/knowledge/x.md` and `src/a.ts` → `null`.
  - **`dependencyManifests`:**
    - `npm install zod`, `npm i -D vitest`, `pnpm add react`, `yarn add lodash`, `bun add x`, and `npm run build && npm install zod` → `["package.json"]`;
    - `npm install`, `npm ci`, `echo npm install zod` and `npx vitest` → `[]`;
    - `pip install requests`, `python -m pip install x` and `pip install -r req.txt requests` → `["requirements.txt", "pyproject.toml"]`;
    - `pip install -r requirements.txt`, `pip install --requirement=requirements.txt` and `pip install -e .` → `[]`;
    - `uv add httpx` → `["pyproject.toml"]`; `cargo add serde` → `["Cargo.toml"]`; `go get example.com/x` → `["go.mod"]`.
  - **`applyEdits`** on `cur = "---\nid: a\nstatus: proposed\n---\n# T\n\nproposed body.\n"`:
    - `Edit { old_string: "proposed", new_string: "accepted" }` changes only the first occurrence (the status line);
    - with `replace_all: true` it changes both;
    - `MultiEdit { edits: [{ old_string: "body", new_string: "text" }, { old_string: "# T", new_string: "# U" }] }` applies both, in order;
    - `Edit { old_string: "missing", new_string: "x" }` returns `cur` unchanged;
    - `NotebookEdit {}` → `null`.
  - **`checkToolCall`.** `env = { root: "N:\\repo", cwd: "N:\\repo", platform: "win32", adrState, readText }`, with fakes:
    - `adrState`: `0001-x.md` accepted, `0003-draft.md` proposed, everything else missing;
    - `readText`: `0003-draft.md` → `DRAFT = "---\nid: adr-0003\nkind: decision\nstatus: proposed\n---\n# Draft\n\nDraft.\n"`, everything else `null`.
    - `Edit { file_path: "N:\\repo\\.context\\STATE.md" }` → `state`, and the reason contains `baton handoff`.
    - `NotebookEdit { notebook_path: "N:/repo/.context/tasks.jsonl" }` → `tasks`.
    - `Write { file_path: "N:\\repo\\.context\\decisions\\0005-new.md", content: "x" }` → `adr-new`, and the reason contains `baton decide`.
    - `Edit` of `0001-x.md` → `adr-final`, and the reason contains `has status "accepted"` and `--supersedes 0001`.
    - `Edit` of `0003-draft.md` with `{ old_string: "Draft.", new_string: "Better." }` → `null`.
    - `Edit` of `0003-draft.md` with `{ old_string: "status: proposed", new_string: "status: accepted" }` → `adr-status`, and the reason contains `--accept 0003`.
    - `Edit` of `0003-draft.md` with `{ old_string: "proposed", new_string: "accepted" }` → `adr-status`, and so does the same with `replace_all: true`.
    - `MultiEdit` of `0003-draft.md` with `edits: [{ old_string: "Draft.", new_string: "Better." }]` → `null`. Adding `{ old_string: "kind: decision", new_string: "kind: knowledge" }` → `adr-status`.
    - `Write` of `0003-draft.md`:
      - with `content` = `DRAFT` with the body changed to `New body.` → `null`;
      - the same content with CRLF line endings → `null`;
      - with `supersedes: "0001"` added to the frontmatter → `adr-status`;
      - with `status: accepted` → `adr-status`.
    - `NotebookEdit { notebook_path: "N:\\repo\\.context\\decisions\\0003-draft.md" }` → `adr-status`.
    - `apply_patch` `{ input: "*** Begin Patch\n*** Update File: .context/decisions/0003-draft.md\n@@\n-status: proposed\n+status: accepted\n*** End Patch" }` → `adr-status`. A patch that only changes `-Draft.` into `+Better.` → `null`.
    - `Bash { command: "echo x > .context/decisions/0003-draft.md" }` → `adr-shell`.
    - `PowerShell { command: "Set-Content .context\\STATE.md x" }` → `state`; `run_shell_command` with the same input → `state`.
    - `Edit` of `N:\\other\\.context\\STATE.md` → `null`; `Read` → `null`; `Edit` of `.context/spec.md` → `null`.
- [ ] **Step 3: Run.** `npx vitest run test/guards.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** `guards.ts` stays pure: no `fs` and no config. Its imports are `node:path` (`posix`), `../core/glob.js` and `../core/decisions.js`.
- [ ] **Step 5: Run.** Expected: PASS. Then `npm run check` and `npm run build`.
- [ ] **Step 6: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-vyr.9
  git add src/hooks/guards.ts test/guards.test.ts .context/tasks.jsonl
  git commit -m "feat(guards): protected targets, frontmatter replay, shell-write and dependency heuristics" -- src/hooks/guards.ts test/guards.test.ts .context/tasks.jsonl
  ```

---

### Task 9: PreToolUse handler: denies, preflight context, deny log

Item `bt-vyr.3`. Claim it first.

**Files:**
- Create: `src/hooks/pre-tool-use.ts`
- Modify: `src/hooks/dispatch.ts` (the `pre-tool-use` entry and the doc comment only)
- Modify: `plugin/hooks/hooks.json` (the PreToolUse `matcher` only)
- Modify: `src/core/config.ts` (the `guards.preflightPaths` default only), `.context/config.yaml` and `templates/context/config.yaml` (their `preflightPaths` lists), and `src/core/templates.generated.ts` (regenerated by `npm run embed:templates`, Phase 1 Task 15)
- Test: `test/pre-tool-use.test.ts`
- Read first: `src/hooks/dispatch.ts`, `src/hooks/io.ts` (`renderHookResult`), `src/hooks/guards.ts` (Task 8), `src/core/config.ts`, both `config.yaml` files, ADR 0020

**Interfaces:**
- Consumes:
  - Task 8 (`src/hooks/guards.ts`): `checkToolCall(tool, input, env)` → `Denial | null`, where `GuardEnv` is `{ root, cwd, platform, adrState(rp): { exists, status }, readText(rp): string | null }` and `Denial` is `{ rule, path, reason }`. Also `editTargets`, `toRepoTarget`, `shellCommandOf`, `dependencyManifests` and `SHELL_TOOLS`.
  - `src/core/config.ts` (existing): `guards.preflightPaths` defaults to `["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "**/migrations/**"]`. Both `config.yaml` files (this repo's and the template) override it with only `[package.json, package-lock.json]`, which drops migrations and other lockfiles.
  - Phase 1 Task 15: `TEMPLATES` (`src/core/templates.generated.ts`), and `npm run embed:templates`. `test/templates-embedded.test.ts` fails until the generated file matches `templates/`.
  - Task 3: `statusOf(text)` (`src/core/decisions.ts`).
  - Task 4 (`src/core/preflight.ts`): `preflight(index, { paths, specIds: [] })` → `{ hits: { section, category, relations, matchedPath? }[] }`, and `hitLabel(hit)`.
  - Phase 1 Task 3: `loadSectionIndex(root, { lenient: true })`.
  - Existing:
    - `loadConfig(root)` (`config.guards.protectState: boolean`, `config.guards.preflightPaths: string[]`); it throws on invalid YAML or schema;
    - `matchesAny`, `contextPath`;
    - `HookResult` kinds `noop`, `deny` and `context`; `HookInput` (`tool_name?`, `tool_input?`, `cwd?`, `session_id?`); `HookContext { root, harness }`.
  - `renderHookResult("pre-tool-use", …)`:
    - `deny` renders `{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason } }` (Gemini: `{ decision: "deny", reason }`);
    - `context` renders `{ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext } }`, with no `permissionDecision`.
  - `runHook(event, harness, stdin)` (existing; Phase 1 Task 17 strips the BOM). It catches every error: stdout `""`, stderr `baton hook <event>: <message>`, exit 0.
  - Test helpers:
    - `makeRepo()` (`CONTEXT_FIXTURE`: `rules-project` has `source_paths: [package.json]`; the config has no `guards` key, so the defaults apply: `protectState: true` and `preflightPaths` including `package.json`);
    - `makeTempDir`, `runGit`, `writeFiles`, `CONTEXT_FIXTURE` and `REPO_ROOT` (Phase 1 Task 3); `defaultConfig` and `loadConfig` (`src/core/config.ts`);
    - `emptyTmp` = `makeTempDir()` followed by `runGit(emptyTmp, "init", "-q")`.
- Produces:
  ```ts
  // src/hooks/pre-tool-use.ts
  export const GUARD_LOG = "guard.jsonl";   // .context/.cache/guard.jsonl
  export function readAdrState(absPath: string): { exists: boolean; status: string | null };
  export function matchesPreflight(repoPath: string, globs: readonly string[], platform?: NodeJS.Platform): boolean;
  export function renderPreflightContext(opts: { kind: "edit" | "shell"; tool: string; paths: string[];
    hits: { label: string; path: string }[] }): string;
  export async function preToolUse(input: HookInput, ctx: HookContext, platform?: NodeJS.Platform): Promise<HookResult>;
  // src/core/config.ts: the preflightPaths default becomes PREFLIGHT_DEFAULTS
  export const PREFLIGHT_DEFAULTS: readonly string[];
  ```

**Rules (pinned):**
- **Preflight defaults.** `PREFLIGHT_DEFAULTS` (exported from `src/core/config.ts`, used as the schema default) is exactly, in this order: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `**/migrations/**`. This covers every manifest that `dependencyManifests` (Task 8) can return.
  - In `.context/config.yaml` and `templates/context/config.yaml`, replace the two-entry `preflightPaths` list with these nine entries, one `- <entry>` per line. Quote `"**/migrations/**"`.
  - Then run `npm run embed:templates`.
- **`readText(rp)`** for `GuardEnv`: `readFileSync(join(ctx.root, rp), "utf8")`, or `null` on any error.
- **`readAdrState(abs)`.**
  - `exists = existsSync(abs)`.
  - `status = exists ? statusOf(readFileSync(abs, "utf8")) : null`. A read error gives status `null`, which `checkToolCall` treats as not proposed.
- **`preToolUse(input, ctx, platform = process.platform)`:**
  1. If `!existsSync(contextPath(ctx.root))` → `noop`.
  2. `tool = typeof input.tool_name === "string" ? input.tool_name : ""`. If it is empty → `noop`.
  3. `toolInput` is `input.tool_input` when that is a plain object, else `{}`. `cwd = typeof input.cwd === "string" ? input.cwd : ctx.root`.
  4. `denial = checkToolCall(tool, toolInput, { root: ctx.root, cwd, platform, adrState: (rp) => readAdrState(join(ctx.root, rp)), readText })`.
  5. **If there is a denial:**
     - load the config (`await import("../core/config.js")`);
     - if `config.guards.protectState`, append `{"v":1,"ts":<ISO>,"event":"deny","session":<session_id or "">,"tool":<tool>,"rule":<rule>,"path":<path>}` plus `"\n"` to `.context/.cache/guard.jsonl` (`mkdir -p`, then `appendFile`; a failure is ignored silently) and return `{ kind: "deny", reason: denial.reason }`;
     - otherwise fall through to step 6.
  6. **Preflight candidates:**
     - edit tools: `editTargets(tool, toolInput)` mapped through `toRepoTarget`, with nulls dropped;
     - shell tools: `dependencyManifests(shellCommandOf(tool, toolInput) ?? "")`.

     If there are none → `noop`. An ordinary shell command therefore loads no config.
  7. Load the config, unless step 5 did. `paths = candidates.filter((p) => matchesPreflight(p, config.guards.preflightPaths, platform))`. None → `noop`.
  8. `index = await loadSectionIndex(ctx.root, { lenient: true })`, and `report = preflight(index, { paths, specIds: [] })`.
  9. `hits` = the report's hits whose `relations` include `path`, mapped to `{ label: hitLabel(h), path: h.matchedPath }`.
  10. Return `{ kind: "context", text: renderPreflightContext({ kind: shell ? "shell" : "edit", tool, paths, hits }) }`.
- **`matchesPreflight`.** On `win32`, `matchesAny(path.toLowerCase(), globs.map((g) => g.toLowerCase()))`; otherwise `matchesAny(path, globs)`.
- **`renderPreflightContext`,** exact lines joined with `\n`:
  - Line 1:
    - edit: `baton preflight: <tool> on <paths joined ", "> touches a dependency or migration file (guards.preflightPaths in .context/config.yaml).`
    - shell: `baton preflight: this command adds a dependency, which changes <paths joined ", ">.`
  - Line 2: `A new dependency or schema change is a load-bearing choice and gets a decision record first: baton decide "<title>" --preflight --paths <paths joined ",">.`
  - Then, for each of the first 5 hits: `Recorded: <label> lists <path> in source_paths.` More than 5 adds `Recorded: <n> more; baton decide --preflight lists them.`
  - No hits: `No decision or spec section lists <paths joined ", "> in source_paths.`
- **dispatch.ts.** `"pre-tool-use": async (input, ctx) => (await import("./pre-tool-use.js")).preToolUse(input, ctx)`. Update the doc comment's pre-tool-use line to cite ADR 0020.
- **hooks.json.** The PreToolUse matcher becomes `"Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell"`. Nothing else changes in this task.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-vyr.3 --claim`
- [ ] **Step 2: Write the failing tests** in `test/pre-tool-use.test.ts`. Call `runHook("pre-tool-use", "claude", stdin({ hook_event_name: "PreToolUse", cwd: root, session_id: "s1", tool_name, tool_input }))`, with `stdin = (o) => Readable.from([JSON.stringify(o)])`. `root = makeRepo()` unless a test says otherwise. `json(out)` is `JSON.parse(out.stdout)`.
  - `denies an absolute STATE.md path`: `Edit { file_path: join(root, ".context", "STATE.md") }`.
    - `json(out).hookSpecificOutput.permissionDecision` is `"deny"`, the reason contains `baton handoff`, and `out.exitCode` is 0.
    - `.context/.cache/guard.jsonl` has one line, parsing to `{ v: 1, event: "deny", session: "s1", tool: "Edit", rule: "state", path: ".context/STATE.md" }` plus a `ts`.
  - `denies forward-slash and Windows-case variants`:
    - `file_path: join(root, ".context", "STATE.md").replace(/\\/g, "/")` is denied.
    - With `it.runIf(process.platform === "win32")`: `file_path: join(root.toUpperCase(), ".context", "state.md")` is denied.
  - `denies shell writes`:
    - `Bash { command: "echo x > .context/tasks.jsonl" }` is denied with a reason containing `baton task`;
    - `PowerShell { command: "Set-Content .context\\STATE.md x" }` is denied.
  - `allows ordinary edits and reads`:
    - `Edit .context/spec.md`, `Edit src/auth/login.ts` and `Bash { command: "git add .context/tasks.jsonl" }` each give stdout `""`;
    - `Read` of STATE.md gives `""`.
  - `guards decision records`:
    - `Edit` of `.context/decisions/0001-use-passkeys.md` is denied with a reason containing `--supersedes 0001`;
    - `Write` of `.context/decisions/0009-new.md` is denied with a reason containing `baton decide`;
    - with `.context/decisions/0003-draft.md` = `"---\nid: adr-0003\nkind: decision\nstatus: proposed\n---\n# Draft\n\nDraft.\n"`:
      - `Edit { old_string: "Draft.", new_string: "Better." }` gives `""`;
      - `Edit { old_string: "status: proposed", new_string: "status: accepted" }` is denied;
      - `Edit { old_string: "proposed", new_string: "accepted" }` is denied, because the guard replays it on the real file text.
  - `denies a MultiEdit of STATE.md`: `MultiEdit { file_path: join(root, ".context", "STATE.md"), edits: [{ old_string: "Nothing", new_string: "Something" }] }` is denied with a reason containing `baton handoff`.
  - `protectState false allows`: with `.context/config.yaml` = `"version: 1\nguards:\n  protectState: false\n"`, `Edit` of STATE.md gives `""`, and no `guard.jsonl` exists.
  - `preflight context on a dependency file`: `Edit { file_path: join(root, "package.json") }`.
    - `json(out).hookSpecificOutput.additionalContext` starts with `baton preflight: Edit on package.json touches a dependency or migration file`.
    - It contains `Recorded: rule rules-project "Project rules" lists package.json in source_paths.`
    - `json(out).hookSpecificOutput.permissionDecision` is `undefined`.
  - `preflight context on a dependency command`:
    - `Bash { command: "npm install zod" }` gives context starting with `baton preflight: this command adds a dependency, which changes package.json.`;
    - `Bash { command: "npm install" }` gives `""`.
  - `no preflight path, no context`: with `.context/config.yaml` = `"version: 1\nguards:\n  preflightPaths: [\"**/migrations/**\"]\n"`, `Edit package.json` gives `""`, while `Edit db/migrations/001.sql` gives context.
  - `the template config covers migrations`: `root = makeRepo({ ...CONTEXT_FIXTURE, ".context/config.yaml": TEMPLATES["context/config.yaml"] })`. `Edit { file_path: join(root, "db", "migrations", "001.sql") }` gives context starting with `baton preflight: Edit on db/migrations/001.sql`.
  - `defaults cover every manifest`: these all equal `[...PREFLIGHT_DEFAULTS]`:
    - `defaultConfig().guards.preflightPaths`;
    - `(await loadConfig(root)).guards.preflightPaths`, where this test rebuilds that fixture itself: `root = makeRepo({ ...CONTEXT_FIXTURE, ".context/config.yaml": TEMPLATES["context/config.yaml"] })`;
    - `(await loadConfig(REPO_ROOT)).guards.preflightPaths`.

    `PREFLIGHT_DEFAULTS` includes `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml` and `go.mod`.
  - `no .context/, no guard`: `Edit { file_path: join(emptyTmp, ".context", "STATE.md") }` with `cwd: emptyTmp` gives `{ stdout: "", stderr: "", exitCode: 0 }`.
  - `fails open on a broken config`: with `.context/config.yaml` = `"guards: [\n"`, `Edit` of STATE.md gives stdout `""`, exit 0, and stderr starting with `baton hook pre-tool-use:`.
  - `ordinary shell commands load no config`: with the same broken `config.yaml`, `Bash { command: "ls" }` gives `{ stdout: "", stderr: "", exitCode: 0 }`. An empty stderr proves the config was never read.
  - `ignores malformed input`: `tool_input: { command: 42 }` with `tool_name: "Bash"`, and a missing `tool_name`, both give stdout `""` and stderr `""`.
  - `renders a Gemini deny`: `runHook("pre-tool-use", "gemini", stdin({ hook_event_name: "BeforeTool", cwd: root, tool_name: "write_file", tool_input: { file_path: join(root, ".context", "STATE.md") } }))` parses to `{ decision: "deny", reason: <string> }`.
  - `renderPreflightContext` exact, for `{ kind: "edit", tool: "Edit", paths: ["package.json"], hits: [] }`:
    ```text
    baton preflight: Edit on package.json touches a dependency or migration file (guards.preflightPaths in .context/config.yaml).
    A new dependency or schema change is a load-bearing choice and gets a decision record first: baton decide "<title>" --preflight --paths package.json.
    No decision or spec section lists package.json in source_paths.
    ```
- [ ] **Step 3: Run.** `npx vitest run test/pre-tool-use.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the handler, the dispatch entry, the matcher, `PREFLIGHT_DEFAULTS` and the two `config.yaml` lists, then run `npm run embed:templates`. The handler's static imports are `node:fs`, `node:fs/promises`, `node:path`, `./guards.js`, `./io.js` (types), `../core/decisions.js`, `../core/paths.js` and `../core/glob.js`. Config, the section index and preflight load with `await import()`.
- [ ] **Step 5: Run.** Expected: PASS, and `test/hooks.test.ts` (Phase 1 Task 17) still passes. Then `npm run check` and `npm run build`. Smoke test (Git Bash): `echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"echo x > .context/STATE.md"}}' | node dist/baton.mjs hook pre-tool-use` prints a JSON deny and exits 0.
- [ ] **Step 6: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-vyr.3
  git add src/hooks/pre-tool-use.ts src/hooks/dispatch.ts plugin/hooks/hooks.json src/core/config.ts .context/config.yaml templates/context/config.yaml src/core/templates.generated.ts test/pre-tool-use.test.ts .context/tasks.jsonl
  git commit -m "feat(hooks): PreToolUse denies on protected state and preflight context" -- src/hooks/pre-tool-use.ts src/hooks/dispatch.ts plugin/hooks/hooks.json src/core/config.ts .context/config.yaml templates/context/config.yaml src/core/templates.generated.ts test/pre-tool-use.test.ts .context/tasks.jsonl
  ```

---

### Task 10: Uncommitted source changes age sections

Item `bt-vyr.10`. Claim it first.

**Files:**
- Modify: `src/core/drift.ts` (Phase 1 Tasks 5–6: `evaluateFreshness`, `SectionFreshness` and `flagEvents`)
- Modify: `src/commands/drift.ts` (Phase 1 Task 7: the `verify-doc` note text only)
- Test: `test/drift-eval.test.ts` (add a `describe`; keep the existing tests)
- Read first: `src/core/drift.ts`, ADR 0021, ADR 0013

**Interfaces:**
- Consumes:
  - Phase 1 Task 5 (`src/core/drift.ts`):
    - `evaluateFreshness(scope: { root; sections }, config): Promise<FreshnessReport>`, where `FreshnessReport` is `{ head, sections: SectionFreshness[], counts }` and `SectionFreshness` is `{ section, result: { level, commitsSince, reason }, deadRefs, commitsOutsideContext }`;
    - `FRESHNESS_IGNORED_GLOBS = [".context/**"]`;
    - it gathers `headSha`, `listRepoFiles` and one `changedFilesPerCommit` per distinct SHA concurrently; a rejected SHA is "unknown".
  - Phase 1 Task 4: `statusLines(cwd)` (porcelain v1, `--no-optional-locks`; it includes untracked `??` entries and works before the first commit) and `porcelainPath(line)` (the new path for a rename).
  - Phase 1 Task 10: `buildMission(root, config, { now })`. It prints `Aging: <id> (<reason>).` lines in the freshness block.
  - Phase 1 Task 6 (`src/core/drift.ts`): `flagEvents(report, ts): DriftEvent[]` (one `flag` event per aging or stale section), written to `.context/.cache/drift.jsonl` by `drift`; `readDriftLog(root)`; `runCli(args, cwd)` (`test/helpers/cli.ts`).
  - Phase 1 Task 7 (`src/commands/drift.ts`, the `verify-doc` action): for each stamped section with uncommitted sources it writes to stderr `note: <id>: uncommitted changes in <paths, comma-separated> will count once committed`. Phase 1's test asserts only the prefix `note: auth: uncommitted changes in src/auth/login.ts`.
  - Test helpers: `makeRepo`, `commitAll`, `stampFixture(root, sha12)`, `writeFiles` and `CONTEXT_FIXTURE` (`auth` has `source_paths: ["src/auth/**"]`, `knowledge-windows` has `["src/**"]` and `rules-project` has `[package.json]`).
- Produces:
  - `SectionFreshness` gains an optional `uncommitted?: string[]`, set only when non-empty.
  - The behaviour rule below.
  - `flagEvents` skips sections whose `uncommitted` is set, so `drift.jsonl` is not flooded during work in progress.
  - The `verify-doc` note's ending becomes `keep it aging until committed and re-verified`.

**Rule (pinned):**
- In a git repo, add `statusLines(root)` to the concurrent gather.
- `dirty = statusLines.map(porcelainPath).filter((p) => !matchesAny(p, FRESHNESS_IGNORED_GLOBS))`, keeping git's order and deduped.
- After `classifyFreshness`, for each section whose `result.level === "fresh"`, whose `meta.sourcePaths` is non-empty and whose `verifiedAt` SHA is known: `touched = dirty.filter((p) => matchesAny(p, sourcePaths))`.
- When `touched` is non-empty:
  - `result = { level: "aging", commitsSince: result.commitsSince, reason: \`uncommitted changes in ${touched.slice(0, 3).join(", ")}${touched.length > 3 ? \` (+${touched.length - 3} more)\` : ""}\` }`;
  - `uncommitted = touched`.
- Every other level is left alone.
- `counts` is tallied after this rule.
- Outside git nothing changes: there is no status call.
- **`flagEvents`** leaves out every section with `uncommitted` set. Only this rule sets it, and only on otherwise-fresh sections, so this drops exactly the uncommitted-only aging. Commit-based aging and stale flags are logged as before.
- **The `verify-doc` note** (`src/commands/drift.ts`) becomes `note: <id>: uncommitted changes in <paths, comma-separated> keep it aging until committed and re-verified`. Change nothing else in that file.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-vyr.10 --claim`
- [ ] **Step 2: Write the failing tests**, in `describe("uncommitted changes")`. **Stamped fixture:** `root = makeRepo()`, `stampFixture(root, commitAll(root, "base").slice(0, 12))`, `commitAll(root, "stamp")`.
  - Modify `src/auth/login.ts` and commit nothing:
    - `auth` is `aging` with `commitsSince` 0, reason `uncommitted changes in src/auth/login.ts` and `uncommitted` `["src/auth/login.ts"]`;
    - `knowledge-windows` is `aging`;
    - `rules-project` is `fresh`, with no `uncommitted` key.
  - Add an untracked `src/auth/new.ts` as well: `auth`'s reason is `uncommitted changes in src/auth/login.ts, src/auth/new.ts`.
  - Five dirty files `src/auth/f1.ts` … `f5.ts`: the reason ends with `(+2 more)`.
  - `.context/`-only changes (rewrite `.context/tasks.jsonl` and `.context/spec.md`'s billing text): every section stays `fresh`, apart from the superseded `adr-0002`.
  - Already aging stays aging by commits: commit a change to `src/auth/login.ts`, then modify it again. `auth`'s reason is `1 commit touched sources since <sha7>`, not the uncommitted one.
  - Unverified stays unverified: in the unstamped `makeRepo()` with `src/auth/login.ts` modified, `auth` is `unverified`.
  - `counts` reflect the change: with `src/auth/login.ts` modified in the stamped fixture, `{ fresh: 4, aging: 2, stale: 0, superseded: 1, unverified: 0 }`.
  - The packet shows it: `buildMission(root, await loadConfig(root), { now: new Date("2026-10-21T00:00:00.000Z") })` text contains `Aging: auth (uncommitted changes in src/auth/login.ts)`.
  - `no drift flags for uncommitted-only aging`: in the stamped fixture with `src/auth/login.ts` modified and uncommitted, `runCli(["drift"], root)` exits 0, and `readDriftLog(root)` holds no `flag` event. After committing the change, a second `drift` run logs `flag` events for `auth` and `knowledge-windows`.
  - `verify-doc notes the uncommitted source`: with `src/auth/login.ts` modified, `runCli(["verify-doc", "auth"], root)` stderr contains `note: auth: uncommitted changes in src/auth/login.ts keep it aging until committed and re-verified`.
- [ ] **Step 3: Run.** `npx vitest run test/drift-eval.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run the whole suite.** `npm run check`. Expected: PASS, with **no Phase 1 or explain test changed**. Phase 1's fixtures commit their source changes before checking a level, and the explain fixture has no commits, so its SHAs are unknown and stale. If a Phase 1 or explain test fails:
  - first check whether the code applies the rule beyond its three conditions (fresh, a known SHA, a matching dirty path outside `.context/`), and fix the code if so;
  - if instead the test's fixture really leaves a matching source change uncommitted and expects `fresh`, change neither. Stop and report the test name to the controller.

  Then `npm run build`.
- [ ] **Step 6: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-vyr.10
  git add src/core/drift.ts src/commands/drift.ts test/drift-eval.test.ts .context/tasks.jsonl
  git commit -m "feat(freshness): uncommitted source changes make fresh sections aging" -- src/core/drift.ts src/commands/drift.ts test/drift-eval.test.ts .context/tasks.jsonl
  ```

---

### Task 11: PostToolUse notices for touched sections

Item `bt-vyr.11`. Claim it first.

**Files:**
- Create: `src/hooks/post-tool-use.ts`
- Modify: `src/hooks/dispatch.ts` (the `post-tool-use` entry and the doc comment), `src/hooks/io.ts` (`NATIVE_NAME` only)
- Test: `test/post-tool-use.test.ts`
- Read first: `src/hooks/io.ts`, ADR 0021

**Interfaces:**
- Consumes:
  - Task 8: `editTargets(tool, input)` and `toRepoTarget(p, root, cwd, platform)` (`src/hooks/guards.ts`).
  - Phase 1 Task 3: `loadSectionIndex(root, { lenient: true })`. Sections carry `meta.verifiedAt`, `meta.supersededBy`, `meta.sourcePaths`, `title`, `file` and `line`.
  - Phase 1 Task 5: `FRESHNESS_IGNORED_GLOBS` (`src/core/drift.ts`). Import it dynamically, or duplicate the literal `[".context/**"]` with a comment.
  - Existing: `matchesAny`, `contextPath`, `HookInput` (`tool_name`, `tool_input`, `cwd`, `session_id`), `HookContext`, and `renderHookResult`. Its `context` result renders `hookSpecificOutput.hookEventName` from `NATIVE_NAME[harness][event] ?? event`.
  - Test helpers: `makeRepo`, `stampFixture`, `commitAll`, `writeFiles`, `makeTempDir`, `runGit`. In the stamped fixture, `auth` (`.context/spec.md:3`, `Authentication`, `src/auth/**`) and `knowledge-windows` (`.context/knowledge/windows.md:1`, `Windows gotchas`, `src/**`) are verified.
- Produces:
  ```ts
  // src/hooks/post-tool-use.ts
  export const TOUCHED_LOG = "touched.jsonl";          // .context/.cache/touched.jsonl
  export const TOUCHED_TAIL_BYTES = 262_144;
  export function noticedIds(logText: string, session: string): Set<string>;
  export function noticeText(paths: string[], sections: { id: string; title: string; file: string; line: number }[]): string;
  export async function postToolUse(input: HookInput, ctx: HookContext, platform?: NodeJS.Platform): Promise<HookResult>;
  // src/hooks/io.ts: NATIVE_NAME gains "post-tool-use": "PostToolUse" for claude and codex, "AfterTool" for gemini
  ```

**Rules (pinned):**
- **`postToolUse`:**
  1. No `.context/` → `noop`.
  2. `targets = editTargets(tool, toolInput)` mapped through `toRepoTarget(p, ctx.root, cwd, platform)`, with nulls dropped, paths matching `.context/**` dropped, and duplicates removed. None → `noop`.
  3. `index = await loadSectionIndex(ctx.root, { lenient: true })`.
  4. `matched` = sections, in index order, with `meta.verifiedAt !== null`, no `meta.supersededBy`, non-empty `sourcePaths`, and some target `t` with `matchesAny(t, sourcePaths)`. None → `noop`.
  5. `session = typeof input.session_id === "string" ? input.session_id : ""`.
  6. Read the log: the whole file when it is ≤ 256 KiB, else its last 256 KiB with everything up to the first `\n` dropped. A missing file is empty.
  7. `fresh = matched.filter((s) => !noticedIds(log, session).has(s.meta.id))`. None → `noop`.
  8. Append `{"v":1,"ts":<ISO>,"session":<session>,"paths":<targets>,"ids":<fresh ids>}` plus `"\n"` (`mkdir -p`, then `appendFile`; a failure is ignored).
  9. Return `{ kind: "context", text: noticeText(targets, fresh) }`.
- **`noticedIds(text, session)`.** Over the parseable JSON lines with `v === 1` and `session === session`, the union of their `ids`.
- **`noticeText(paths, sections)`,** exact:
  - `` `baton: ${paths.join(", ")} ${paths.length === 1 ? "is" : "are"} in the source_paths of ${list}. Those sections count as aging until they are re-verified: commit the change, then baton verify-doc <id> records a section as verified at HEAD after review.` ``
  - `list` is the first 5 sections as `<id> ("<title>", <file>:<line>)`, joined with `"; "`, plus `; and <n> more` when there are more than 5.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-vyr.11 --claim`
- [ ] **Step 2: Write the failing tests** in `test/post-tool-use.test.ts`, using `runHook("post-tool-use", "claude", stdin({ hook_event_name: "PostToolUse", cwd: root, session_id, tool_name: "Edit", tool_input: { file_path } }))` on the stamped fixture. Each bullet is its own `it`, with a fresh fixture, except "once per session", which continues the first bullet.
  - `notices the sections of an edited file`: `file_path: join(root, "src", "auth", "login.ts")`, session `"s1"`.
    - `hookSpecificOutput.hookEventName` is `"PostToolUse"`.
    - `additionalContext` is exactly: `baton: src/auth/login.ts is in the source_paths of auth ("Authentication", .context/spec.md:3); knowledge-windows ("Windows gotchas", .context/knowledge/windows.md:1). Those sections count as aging until they are re-verified: commit the change, then baton verify-doc <id> records a section as verified at HEAD after review.`
    - `touched.jsonl` has one line, with `ids` `["auth", "knowledge-windows"]`.
  - `once per session`: the same call again gives stdout `""`, and the log still has one line. Session `"s2"` gives the context again.
  - `rules sections too`: `file_path: join(root, "package.json")` mentions `rules-project`.
  - `skips context files, unverified sections and outside paths`:
    - `Edit .context/spec.md` gives `""`;
    - on the **unstamped** `makeRepo()`, `src/auth/login.ts` gives `""`;
    - a `file_path` outside `root` gives `""`;
    - `emptyTmp` gives `{ stdout: "", stderr: "", exitCode: 0 }`.
  - `caps the list`: add `.context/knowledge/k1.md` … `k6.md` (frontmatter `id: k<i>`, `kind: knowledge`, `source_paths: ["src/**"]`, stamped), and commit. The context contains `; and 3 more`.
  - `reads only the log tail`: pre-fill `touched.jsonl` with 300 KiB of lines for session `"other"`, then a line `{v:1,…,session:"s1",ids:["auth","knowledge-windows"]}`. The `s1` call gives `""`.
  - `noticedIds` ignores malformed lines and other sessions.
  - `renderHookResult("post-tool-use", { kind: "context", text: "t" }, "gemini")` has `hookEventName` `"AfterTool"`.
- [ ] **Step 3: Run.** `npx vitest run test/post-tool-use.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** Static imports: `node:fs`, `node:fs/promises`, `node:path`, `./guards.js`, `./io.js` (types), `../core/glob.js` and `../core/paths.js`. The section index loads dynamically. No git process.
- [ ] **Step 5: Run.** Expected: PASS. Then `npm run check` and `npm run build`.
- [ ] **Step 6: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-vyr.11
  git add src/hooks/post-tool-use.ts src/hooks/dispatch.ts src/hooks/io.ts test/post-tool-use.test.ts .context/tasks.jsonl
  git commit -m "feat(hooks): PostToolUse notices sections an edit touched, once per session" -- src/hooks/post-tool-use.ts src/hooks/dispatch.ts src/hooks/io.ts test/post-tool-use.test.ts .context/tasks.jsonl
  ```

---

### Task 12: Opt-in Stop verification

Item `bt-vyr.12`. Claim it first.

**Files:**
- Modify: `src/core/config.ts` (add `verify.onStop`)
- Create: `src/hooks/stop.ts`
- Modify: `src/hooks/dispatch.ts` (the `stop` entry and the doc comment)
- Modify: `plugin/hooks/hooks.json` (add the Stop entry; replace `description`)
- Modify: `.context/config.yaml`, `templates/context/config.yaml`, `src/core/templates.generated.ts` (regenerated by `npm run embed:templates`, Phase 1 Task 15)
- Test: `test/stop-hook.test.ts`; one assertion in `test/decisions-config.test.ts`
- Read first: `src/core/config.ts`, ADR 0019

**Interfaces:**
- Consumes:
  - Task 6 (`src/core/verify.ts`):
    - `activeTask(root, config, actor)`: the most recently started task that is in progress, not an epic, assigned to `actor`, and has a check label; or `null`;
    - `verifyTask(root, config, id, { requireDiff, close: false, timeoutMs })` → `{ status: "no-diff" } | { status: "failed", run: { command, exitCode, timedOut, tail } } | { status: "passed" } | …`.
  - Existing: `resolveActor(root)` (`src/core/tasks/native/store.ts`), `loadConfig`, `contextPath`, and the `HookResult` kind `block-stop` (rendered as `{ decision: "block", reason }`).
  - `HookInput.stop_hook_active?: boolean`.
  - Test helpers: `makeRepo`, `CONTEXT_FIXTURE` (Phase 1 Task 3), `withService` (Phase 1 Task 8), `writeFiles`, `makeTempDir`, `runGit`.
  - Task 6's diff rule: only commits in a strictly later second than `started_at` count, and the uncommitted files outside `VERIFY_IGNORED_GLOBS` (`.context/tasks.jsonl`, `.context/memories.jsonl`, `.context/STATE.md`, `.context/.cache/**`).
- Produces:
  ```ts
  // src/core/config.ts: verify gains onStop
  verify: z.object({ requireDiff: z.boolean().default(true), onStop: z.boolean().default(false) }).prefault({})
  // src/hooks/stop.ts
  export const STOP_CHECK_TIMEOUT_MS = 540_000;
  export const STOP_TAIL_CHARS = 1500;
  export function blockReason(id: string, run: { command: string; exitCode: number | null; timedOut: boolean; tail: string }): string;
  export async function stopHook(input: HookInput, ctx: HookContext): Promise<HookResult>;
  ```

**Rules (pinned):**
- **`stopHook`:**
  1. No `.context/` → `noop`.
  2. `input.stop_hook_active === true` → `noop`.
  3. Load the config (dynamic import). `!config.verify.onStop` → `noop`, and so is a backend other than `native`. `src/core/verify.ts` and `src/core/tasks/native/store.ts` are also loaded with `await import()`, only after this point. `stop.ts` imports nothing else statically beyond `node:fs`, `./io.js` (types) and `../core/paths.js`.
  4. `task = await activeTask(root, config, resolveActor(root))`. `null` → `noop`.
  5. `outcome = await verifyTask(root, config, task.id, { requireDiff: config.verify.requireDiff, close: false, timeoutMs: STOP_CHECK_TIMEOUT_MS })`.
  6. `failed` → `{ kind: "block-stop", reason: blockReason(task.id, outcome.run) }`. Everything else → `noop`.
- **`blockReason`,** lines joined with `\n`:
  - `Task <id> is in progress and its check failed (<"timed out after 540 s" | "exit <code>">): <command>`
  - `Last output:`
  - `run.tail.slice(-1500).trim()`, or `(no output)`
  - `The task stays open. baton verify <id> closes it once the check passes.`
- **hooks.json.**
  - Add `"Stop": [{ "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/dist/baton.mjs", "hook", "stop"], "timeout": 600 }] }]`, with no matcher (Stop has none).
  - Set `description` to `"baton continuity hooks: SessionStart injects the mission packet; PreCompact and SessionEnd regenerate .context/STATE.md; PreToolUse denies direct edits to protected state and adds preflight context; PostToolUse notices touched sections; Stop runs the active task's check when verify.onStop is set (docs/design/architecture.md)."`
- **Config files.**
  - In `.context/config.yaml` and `templates/context/config.yaml`, under `verify:`, add the line `  onStop: false    # Stop hook runs the active task's check and blocks on failure (ADR 0019)`.
  - Then run `npm run embed:templates`. Phase 1's `test/templates-embedded.test.ts` compares the generated file with `templates/`.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-vyr.12 --claim`
- [ ] **Step 2: Write the failing tests** in `test/stop-hook.test.ts`. Set `BATON_ACTOR = "tester"`. **Each bullet is its own `it`, with a fresh fixture.**
  - **Fixture:** `root = makeRepo({ ...CONTEXT_FIXTURE, ".context/config.yaml": "version: 1\ntasks:\n  prefix: bt\nverify:\n  onStop: true\n" })`, so the config is part of the `init` commit. A config file written after `makeRepo()` would stay uncommitted and count as a change for the diff rule, because `.context/config.yaml` is not in `VERIFY_IGNORED_GLOBS`. A task with label `check:node -e "process.exit(1)"` is claimed by `tester` (`withService(root, "tester", …)`), and `src/auth/login.ts` is modified.
  - **Input:** `stdin({ hook_event_name: "Stop", cwd: root, session_id: "s1", stop_hook_active: false, last_assistant_message: "done" })`.
  - `blocks when the active task's check fails`: `JSON.parse(stdout)` has `decision` `"block"`. Its `reason` starts with `Task <id> is in progress and its check failed (exit 1): node -e "process.exit(1)"` and ends with `baton verify <id> closes it once the check passes.` The task is still `in_progress`.
  - `does nothing when`, each giving `{ stdout: "", stderr: "", exitCode: 0 }`:
    - `stop_hook_active: true`;
    - `onStop` is absent (plain `makeRepo()`, whose committed config has no `verify` key);
    - the check passes (`process.exit(0)`), and the task is still `in_progress` (never closed);
    - nothing changed since the claim (no diff);
    - no task is in progress for `tester` (claimed by `alice` instead);
    - `emptyTmp` has no `.context/`.
  - `the most recently started task is checked`: claim `A` (a passing check), wait 5 ms, then claim `B` (a failing check). The reason names `B`.
  - `blockReason` for a timed-out run with an empty tail contains `(timed out after 540 s)` and `(no output)`.
  - In `test/decisions-config.test.ts`: `defaultConfig().verify.onStop` is `false`.
  - `hooks.json` wires Stop: parse `plugin/hooks/hooks.json`. `hooks.Stop[0].hooks[0].args` ends with `["hook", "stop"]`, `timeout` is 600, and there is no `matcher`.
- [ ] **Step 3: Run.** `npx vitest run test/stop-hook.test.ts test/decisions-config.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement:** the schema, the handler, the dispatch entry, hooks.json, both config files, then `npm run embed:templates`.
- [ ] **Step 5: Run.** Expected: PASS. `test/dogfood-context.test.ts` (a valid config) and `test/templates-embedded.test.ts` pass. Then `npm run check` and `npm run build`.
- [ ] **Step 6: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-vyr.12
  git add src/core/config.ts src/hooks/stop.ts src/hooks/dispatch.ts plugin/hooks/hooks.json .context/config.yaml templates/context/config.yaml src/core/templates.generated.ts test/stop-hook.test.ts test/decisions-config.test.ts .context/tasks.jsonl
  git commit -m "feat(hooks): opt-in Stop gate runs the active task's check" -- src/core/config.ts src/hooks/stop.ts src/hooks/dispatch.ts plugin/hooks/hooks.json .context/config.yaml templates/context/config.yaml src/core/templates.generated.ts test/stop-hook.test.ts test/decisions-config.test.ts .context/tasks.jsonl
  ```

---

### Task 13: Hook smoke test: Phase 2 cases and budgets

Item `bt-vyr.13`. Claim it first. This runs on the Windows 11 build machine, with no live or nested `claude` session.

**Files:**
- Modify: `scripts/hook-smoke.mjs` (Phase 1 Task 18)
- Modify: `docs/research/2026-10-16-implementation-notes.md` (§1: one bullet with the measured results)
- Read first: `scripts/hook-smoke.mjs`, `plugin/hooks/hooks.json`

**Interfaces:**
- Consumes: the Phase 1 Task 18 script behaviour.
  - It builds a temp project named `baton smoke …` (`git init`, `baton init --no-hooks`, `src/a.ts`, one commit).
  - It copies `plugin/` to a second root whose name contains a space.
  - It runs every hook entry of `hooks.json`, with `${CLAUDE_PLUGIN_ROOT}` expanded, `--runs` times (default 5), taking median timings.
  - Its stdin table per event: SessionStart `source: "startup"`; PreCompact `trigger: "manual"`; SessionEnd `reason: "other"`; PreToolUse and PostToolUse `Edit` on `src/a.ts`.
  - Functional checks: exit 0 and empty stderr; SessionStart context starts with `# baton mission brief` and is ≤ 10000; STATE.md is written by PreCompact and SessionEnd; PreToolUse and PostToolUse print `""`.
  - Budgets: 1000 ms, and 150 ms for PreToolUse and PostToolUse. `--strict-timing` makes an overrun fail. Output is a header plus a markdown table.
  - It also consumes Tasks 9, 11 and 12 (the handlers), and the `hooks.json` Stop entry.
- Produces: `npm run smoke:hooks` covering Phase 2 (same flags).

**Script changes (pinned):**
1. **Project setup, before the existing commit:**
   - write `package.json` = `{ "name": "smoke" }\n` and `lib/b.ts` = `export const b = 1;\n`;
   - append to `.context/spec.md`: `\n## Lib\n<!-- baton: {id: smoke-lib, kind: intent, verified_at: "0123456789ab", source_paths: ["lib/**"]} -->\n\nThe lib folder.\n`. The fake SHA is fine: PostToolUse runs no git.
2. **Stdin table:** add `Stop: { stop_hook_active: false, last_assistant_message: "done" }`, with a functional check of stdout `""` (`verify.onStop` is off in the template config) and a budget of 1000 ms.
3. **Extra cases.** Run each against both plugin roots, `--runs` times, with the PreToolUse or PostToolUse argv taken from `hooks.json`, budget 150 ms, one table row per case and root. The stdin is `{ hook_event_name: "PreToolUse" | "PostToolUse", session_id: "smoke-" + run, cwd: project, tool_name, tool_input }`, with a fresh `session_id` per run so that the notice is emitted every time.

   | Case | Event | `tool_name` and `tool_input` | Functional check |
   |---|---|---|---|
   | `deny Edit` | PreToolUse | `Edit`, `{ file_path: join(project, ".context", "STATE.md") }` | `hookSpecificOutput.permissionDecision === "deny"` |
   | `deny Bash` | PreToolUse | `Bash`, `{ command: "echo x > .context/tasks.jsonl" }` | deny |
   | `deny PowerShell` | PreToolUse | `PowerShell`, `{ command: "Set-Content -Path .context\\STATE.md -Value x" }` | deny |
   | `preflight` | PreToolUse | `Edit`, `{ file_path: join(project, "package.json") }` | `additionalContext` starts with `baton preflight:`, and there is no `permissionDecision` |
   | `notice` | PostToolUse | `Edit`, `{ file_path: join(project, "lib", "b.ts") }` | `additionalContext` contains `smoke-lib` |
4. **Repo timings,** next to Phase 1's `mission` and `handoff --dry-run` rows (plugin root `-`, `cwd` = this repo's root, `--runs` times, budget 150 ms). They measure a real `.context/` with a full section index:
   - `post-tool-use on repo`: the PostToolUse argv with `{ hook_event_name: "PostToolUse", session_id: "smoke-" + run, cwd: <repo root>, tool_name: "Edit", tool_input: { file_path: join(<repo root>, "src", "core", "drift.ts") } }`. It writes only the git-ignored `.context/.cache/touched.jsonl`. Functional check: exit 0 and empty stderr; stdout may hold a notice.
   - `pre-tool-use on repo`: the PreToolUse argv with the same file. It loads the real config. Functional check: exit 0, empty stdout and empty stderr.
5. **Unchanged:** every existing case, the flags, the other repo timings and the cleanup.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-vyr.13 --claim`
- [ ] **Step 2: Edit the script** per the pinned changes. It stays Biome-clean.
- [ ] **Step 3: Run.** `npm run build`, then `npm run smoke:hooks -- --strict-timing`.
  - Expected: every functional check passes. Record the header and the table.
  - If a 150 ms case misses its budget under `--strict-timing`, do **not** loosen the budget. Record the number and create a task that names the fallback: `node dist/baton.mjs task create "PreToolUse/PostToolUse over budget on Windows: <case> <n> ms" -p 1 --spec hooks --deps discovered-from:bt-vyr.13 -d "Fallbacks to try: read the guards keys of config.yaml with yaml only, without the zod schema, or cache the parsed config under .context/.cache/ keyed by the file mtime. Measure with npm run smoke:hooks."`.
  - Then run `npm run smoke:hooks` without the flag (warn-only) and continue.
- [ ] **Step 4: Record the results.** In §1 of the implementation notes, directly after the bullets Task 1 added, add: "Phase 2 hooks, exec form, both plugin roots (simulated `${CLAUDE_PLUGIN_ROOT}`): PreToolUse deny/preflight and PostToolUse notice medians <table rows>; on this repo, PreToolUse <n> ms and PostToolUse <n> ms; Stop no-op <n> ms. 🟡 observed <the actual run date>, Windows 11 <os.release()>, Node <version>; not yet observed in a live Claude Code session." Fill every `<…>` from the run, including the date.
- [ ] **Step 5: Verify.** `npm run check`. Expected: PASS.
- [ ] **Step 6: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-vyr.13
  git add scripts/hook-smoke.mjs docs/research/2026-10-16-implementation-notes.md .context/tasks.jsonl
  git commit -m "test(hooks): smoke-test Phase 2 guard, notice and Stop hooks with budgets" -- scripts/hook-smoke.mjs docs/research/2026-10-16-implementation-notes.md .context/tasks.jsonl
  ```

---

### Task 14: ADR 0022 through `baton decide`, and `baton compile`

Item `bt-vyr.4`. Claim it first. The ADR comes first and is written with `decide`, which dogfoods the propose → fill → accept path (ADR 0018).

**Files:**
- Create via the CLI: `.context/decisions/0022-compile-writes-agents-md-and-the-claude-md-import-from-rules.md`. The slug is `slugify`'d and cut to 60 characters; use the path `decide` prints.
- Create: `src/core/compile.ts`
- Modify: `src/commands/compile.ts`
- Test: `test/compile.test.ts`
- Read first: `src/commands/compile.ts`, `src/core/init.ts` (Phase 1 Task 16: `renderAgentsMd`, `ensureLines`), `templates/AGENTS.md`, ADR 0006, ADR 0017

**Interfaces:**
- Consumes:
  - Task 5: `node dist/baton.mjs decide "<title>" --spec … --paths … --deciders …` (creates a proposed record and prints `created ADR NNNN (proposed): <file>`), and `decide --accept NNNN`.
  - Phase 1 Task 16 (`src/core/init.ts`):
    - `renderAgentsMd(template, rulesMd)`. It replaces the template line `{rules from .context/rules.md}` with `## <title>\n\n<body>` for each marked section of `rules.md`, joined with `\n\n`; with no sections it uses `_No rules yet: edit .context/rules.md._`.
    - `ensureLines(existing: string | null, lines)` → `{ text, added }`. It appends missing lines and keeps CRLF.
    - `scaffold(root, { force })`, in tests only.
  - Phase 1 Task 15: `TEMPLATES["AGENTS.md"]` (`src/core/templates.generated.ts`).
  - Phase 1 Task 6: `requireContext(root)` and `runCli`.
  - Existing: `parseSections` (throws on a bad marker), `writeFileAtomic`, `readTextOrEmpty`, `contextPath`, `findProjectRoot`, `action`, `BatonError` and `ExitCode`.
  - Test helpers: `makeRepo` (the fixture `rules.md` has one marked section, `## Project rules` → `- Tests run with \`npm test\`.`), `makeTempDir`, `runGit`, `writeFiles`.
- Produces:
  ```ts
  // src/core/compile.ts
  export const AGENTS_FILE = "AGENTS.md";
  export const CLAUDE_FILE = "CLAUDE.md";
  export const CLAUDE_IMPORT = "@AGENTS.md";
  export const AGENTS_MAX_LINES = 60;
  export function normalizeText(t: string): string;                      // strip one BOM, CRLF → LF
  export function compileAgentsMd(rulesMd: string): string;              // BatonError exit 2 over 60 lines; exit 1 on a bad marker
  export function unmarkedHeadings(rulesMd: string): { line: number; title: string }[];
  export function firstDifference(a: string, b: string): number | null;  // 1-based line, on normalised text
  export interface CompileFile { path: "AGENTS.md" | "CLAUDE.md"; current: string | null; next: string;
    action: "create" | "update" | "append" | "unchanged"; firstDiff: number | null }
  export async function planCompile(root: string): Promise<{ files: CompileFile[]; warnings: string[] }>;
  export function applyCompile(root: string, files: CompileFile[]): void;
  ```

**Rules (pinned):**
- **`compileAgentsMd(rulesMd)`.**
  - `text = renderAgentsMd(TEMPLATES["AGENTS.md"], normalizeText(rulesMd))`. A `parseSections` error is rethrown as `BatonError(\`.context/rules.md: <first line of the message>\`)` (exit 1).
  - `lines = text.replace(/\n$/, "").split("\n").length`. When `lines > 60`, throw `BatonError(\`AGENTS.md would be ${lines} lines (max 60, ADR 0006); shorten .context/rules.md\`, 2)`.
- **`unmarkedHeadings`.** Every `## ` heading (exactly level 2) whose next line is not a `<!-- baton: … -->` marker. The result is the 1-based line and the title.
- **`firstDifference(a, b)`.** Compare the normalised texts line by line. Return the first index (1-based) where they differ, or `min(length) + 1` when one text is a prefix of the other, or `null` when they are equal.
- **`planCompile(root)`.**
  - `.context/rules.md` must exist, else `BatonError("no .context/rules.md")` (exit 1).
  - **AGENTS.md:** `next = compileAgentsMd(rules)`. `current` is `null` when the file is missing, giving `create`. When `normalizeText(current) === next` → `unchanged`; otherwise `update`, with `firstDiff`.
  - **CLAUDE.md:** missing → `create`, with next `"@AGENTS.md\n"`. Otherwise `ensureLines(current, ["@AGENTS.md"])`: lines added → `append` (next = its text); else `unchanged`.
  - `warnings` holds one entry per unmarked heading: `.context/rules.md:<line>: heading "<title>" has no baton marker; it is not compiled into AGENTS.md`.
- **`applyCompile`.** For each file whose action is not `unchanged`, `writeFileAtomic(join(root, path), next)`.
- **Command `compile [--check]`:**
  1. `root = findProjectRoot()`, `requireContext(root)`, then `planCompile`.
  2. Each warning → stderr `note: <warning>`.
  3. **`--check`:** for each file whose action is not `unchanged`, write to stderr:
     - AGENTS.md `create`: `AGENTS.md is missing`;
     - AGENTS.md `update`: `AGENTS.md is out of date with .context/rules.md (first difference at line <n>)`;
     - CLAUDE.md `create` or `append`: `CLAUDE.md does not import AGENTS.md (@AGENTS.md)`.

     If any, throw `BatonError(\`compile --check: ${n} file(s) out of date; run baton compile\`, 2)`. Otherwise stdout `AGENTS.md and CLAUDE.md are up to date`.
  4. **Without `--check`:** `applyCompile`, then one stdout line per file:
     - `wrote AGENTS.md`, or `AGENTS.md unchanged`;
     - `created CLAUDE.md`, `added @AGENTS.md to CLAUDE.md`, or `CLAUDE.md unchanged`.

     The 60-line refusal (exit 2) applies in both modes, before anything is written.
  5. **Doc comment.** Replace the comment above `registerCompile` in `src/commands/compile.ts`. Today it promises "other harness rule files" and calls the output "compatible with rulesync-class generators". It must say what ADR 0022 decides: compile regenerates AGENTS.md from the marked sections of `.context/rules.md` with the embedded router template (at most 60 lines), and ensures CLAUDE.md imports it with `@AGENTS.md`. It writes no other rule files. `--check` writes nothing and exits 2 on drift. Update the command's `.description()` to match.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-vyr.4 --claim`
- [ ] **Step 2: Create ADR 0022 with `decide`** (proposed):
  ```bash
  node dist/baton.mjs decide "compile writes AGENTS.md and the CLAUDE.md import from rules.md" --spec context-format --paths "src/core/compile.ts,src/commands/compile.ts,.github/workflows/ci.yml" --deciders maintainer
  ```
  Expected: `created ADR 0022 (proposed): .context/decisions/0022-….md`, then a preflight report that lists, among others, ADRs 0006 and 0017 under `CONSTRAINS` (they agree with this record; creation never fails on them), then the `next:` line. If the number differs, use the printed one below.
- [ ] **Step 3: Fill the body.** Use the edit tools on the new file. Replace **only** the placeholders: never touch the frontmatter, and leave "More Information" as written.
  - `{Context: …}` → "ADR 0006 makes AGENTS.md a small router (≤ 60 lines) generated from `.context/rules.md` once `compile` exists, with CLAUDE.md as a one-line `@AGENTS.md` import. ADR 0017 has `init` render AGENTS.md from the embedded router template. The spec lists rules-file sync engines as a non-goal."
  - The two `{Considered option}` bullets → three bullets: `* Render with the embedded router template, as init does`, `* Copy rules.md verbatim without markers`, `* Generate several harness rule files (Cursor, Copilot, GEMINI.md)`.
  - `{Chosen option and why.}` → `Chosen option: "Render with the embedded router template, as init does", because init and compile then produce the same bytes, a freshly initialised project passes compile --check, and each AGENTS.md section keeps its freshness provenance in rules.md.`, followed by these bullets:
    - "AGENTS.md is `renderAgentsMd` of the embedded template and the marked sections of `.context/rules.md`, in order. Text before the first section, and `##` headings without a marker, are not compiled; compile names each such heading in a warning."
    - "More than 60 lines is refused with exit 2 (ADR 0006)."
    - "CLAUDE.md: compile ensures it contains the line `@AGENTS.md`, creating the file or appending the line, and keeps any other content."
    - "No other targets: Codex reads AGENTS.md natively and Gemini through `context.fileName` (Phase 3 `init`); multi-target sync stays a non-goal."
    - "`compile --check` writes nothing and exits 2, naming each out-of-date file and its first differing line. The comparison ignores a BOM and CRLF. CI runs it after the build."
  - The Consequences placeholders → `* Good, because there is one source of rules, checked in CI.` and `* Bad, because a project cannot change the router template itself, only the rules.md sections.`
- [ ] **Step 4: Accept it.** `node dist/baton.mjs decide --accept 22`. Expected: `accepted ADR 0022: <file>`. If it refuses because of placeholders, finish Step 3.
- [ ] **Step 5: Write the failing tests** in `test/compile.test.ts`, with `root = makeRepo()` unless a test says otherwise.
  - `compiles the fixture rules`:
    - `planCompile(root)` gives AGENTS.md `create`, and `next === renderAgentsMd(TEMPLATES["AGENTS.md"], <fixture rules.md>)`;
    - it contains `## Project rules\n\n- Tests run with \`npm test\`.` and `## Continuity`;
    - it contains no `<!-- baton:` and no `{rules from .context/rules.md}`;
    - CLAUDE.md is `create`, with next `"@AGENTS.md\n"`.
  - `command writes, then is idempotent`:
    - `runCli(["compile"], root)` exits 0, with stdout `wrote AGENTS.md\ncreated CLAUDE.md\n`;
    - a second run prints `AGENTS.md unchanged\nCLAUDE.md unchanged\n`;
    - `compile --check` exits 0 with `AGENTS.md and CLAUDE.md are up to date`.
  - `--check finds drift and writes nothing`:
    - after compiling, append `- New rule.` to the `Project rules` section of `.context/rules.md`;
    - `compile --check` exits 2, stderr contains `AGENTS.md is out of date with .context/rules.md (first difference at line` and `run baton compile`, and AGENTS.md is byte-identical.
  - `ignores BOM and CRLF`: rewrite AGENTS.md as `"\uFEFF" + text.replace(/\n/g, "\r\n")`. `compile --check` exits 0, and `compile` prints `AGENTS.md unchanged` without rewriting the file.
  - `keeps other CLAUDE.md content`:
    - `CLAUDE.md` = `"# notes\n"`: `compile` gives `"# notes\n@AGENTS.md\n"` and prints `added @AGENTS.md to CLAUDE.md`;
    - with `CLAUDE.md` = `"# notes\n"` again, `compile --check` exits 2, and stderr contains `CLAUDE.md does not import AGENTS.md`.
  - `refuses more than 60 lines`: give `rules-project` a body of 60 bullet lines. Both `compile` and `compile --check` exit 2, stderr contains `max 60, ADR 0006`, and no AGENTS.md exists.
  - `warns on unmarked headings`: append `\n## Unmarked\n\nText.\n` to `rules.md`. Stderr contains `note: .context/rules.md:` and `heading "Unmarked" has no baton marker`. `Text.` is not in AGENTS.md, and the exit code is 0.
  - `a broken marker exits 1`: the marker's `kind: vibes` gives exit 1, and stderr contains `.context/rules.md:`.
  - `init and compile agree`: `dir = makeTempDir()`, `runGit(dir, "init", "-q")`, `scaffold(dir, { force: false })`, then `runCli(["compile", "--check"], dir)` exits 0.
  - `firstDifference("a\nb\n", "a\nc\n")` → 2; `("a\n", "a\nb\n")` → 2; `("a\r\n", "a\n")` → `null`.
  - `needs .context/`: `compile` in `makeTempDir()` after `runGit(dir, "init", "-q")` exits 1.
- [ ] **Step 6: Run.** `npx vitest run test/compile.test.ts`. Expected: FAIL.
- [ ] **Step 7: Implement** `src/core/compile.ts` and the command.
- [ ] **Step 8: Run.** Expected: PASS. Then `npm run check` and `npm run build`. Do **not** run `compile` on this repo yet; Task 15 migrates `rules.md` first.
- [ ] **Step 9: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-vyr.4
  git add .context/decisions/0022-* src/core/compile.ts src/commands/compile.ts test/compile.test.ts .context/tasks.jsonl
  git commit -m "feat(compile): AGENTS.md and the CLAUDE.md import from rules.md, ADR 0022 via decide" -- .context/decisions/0022-* src/core/compile.ts src/commands/compile.ts test/compile.test.ts .context/tasks.jsonl
  ```

---

### Task 15: Generate this repo's AGENTS.md from rules.md; `compile --check` in CI

Item `bt-vyr.14`. Claim it first.

**Files:**
- Modify: `.context/rules.md` (by hand; it is the source)
- Modify: `AGENTS.md` (written by `node dist/baton.mjs compile` only; never by hand)
- Modify: `.github/workflows/ci.yml` (add one step)
- Modify: `test/dogfood-context.test.ts` (add one test)
- Read first: `AGENTS.md`, `.context/rules.md`, `templates/AGENTS.md`, `.github/workflows/ci.yml`, ADR 0022

**Interfaces:**
- Consumes:
  - Task 14: `node dist/baton.mjs compile [--check]`; `planCompile(root)` → `{ files: { path, action }[] }`. AGENTS.md is the router template (`# Agent guide`, the compiled rules sections, then the template's `## Continuity` block).
  - Phase 1 Task 3: `REPO_ROOT` (`test/helpers/repo.ts`).
  - Existing: `rules-project` and `rules-continuity` keep their ids, their `source_paths` and their current `verified_at` values.
- Produces: an `AGENTS.md` that `compile --check` accepts, and a CI step.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-vyr.14 --claim`
- [ ] **Step 2: Rewrite `.context/rules.md`** so that every part of today's AGENTS.md has a marked section. Keep the `verified_at` values that `rules-project` and `rules-continuity` have now; the new sections start with `verified_at: null`. The target text:
  ````markdown
  # Rules (source of AGENTS.md)

  `baton compile` regenerates AGENTS.md from the marked sections below; text outside them, like this line, is not compiled. CI runs `baton compile --check`.

  ## Orientation
  <!-- baton: {id: rules-orientation, kind: rule, verified_at: null, source_paths: ["docs/roadmap.md"]} -->

  baton is a CLI-first continuity layer for coding agents (TypeScript, Node ≥ 22.13). Read `.context/STATE.md` first, then `docs/roadmap.md` for the current phase.

  ## Commands
  <!-- baton: {id: rules-commands, kind: rule, verified_at: null, source_paths: [package.json]} -->

  - `npm run check`: lint (Biome), typecheck, tests (Vitest). Must pass before a task is done.
  - `npm run build`: bundle to `dist/baton.mjs` and sync `plugin/dist/`.
  - `npm run validate:skills`: Agent Skills spec check for `plugin/skills/`.
  - `node dist/baton.mjs --help`: the CLI contract. `node dist/baton.mjs task ready`: what to work on next.
  - `node dist/baton.mjs verify <id>`: run a task's check and close it. `node dist/baton.mjs compile`: regenerate AGENTS.md from `.context/rules.md`.
  - In this repo, `baton` in any rule or skill means `node dist/baton.mjs` (no global install).

  ## Project rules
  <!-- baton: {id: rules-project, …keep the existing marker exactly…} -->

  …keep the existing six bullets exactly…

  ## Continuity rules
  <!-- baton: {id: rules-continuity, …keep the existing marker exactly…} -->

  - Do not edit `.context/STATE.md`, `.context/tasks.jsonl` or `.context/memories.jsonl` by hand: use `baton handoff`, `baton task …` and `baton remember`. The PreToolUse hook denies direct edits.
  - Decisions go through `baton decide` (MADR, append-only): never edit decision frontmatter or accepted records; fill a proposed record's body. `baton decide --accept` or a superseding record changes a status.
  - Load-bearing choices (dependencies, storage formats, hook semantics) get a decision before code; run `baton decide --preflight` first.
  - No markdown TODO lists; work items live in the task store (`baton task ready`). Claim before you start (`baton task update <id> --claim`): verify's diff counts from the claim. New work: `baton task create "…" --check "<cmd>"`.
  - A task is done when `baton verify <id>` passes its check; `baton task close` refuses a checked task without `--force`.
  - Generated files: `AGENTS.md` (`baton compile`) and `.context/STATE.md` (`baton handoff`).

  ## Where things are
  <!-- baton: {id: rules-where, kind: rule, verified_at: null, source_paths: []} -->

  - Design: `docs/design/` (architecture, context format, metrics) · Evidence: `docs/research/` · Plans: `docs/superpowers/plans/`
  ````
  Notes on the target text:
  - Today's "Where things are" line about `.context/spec.md`, decisions and knowledge is dropped on purpose: the template's `## Continuity` block already says it.
  - `rules-where` has `source_paths: []`. With `["docs/**"]` and the rule threshold of 5, it would go stale after a handful of doc commits.
  - Nothing in this file may contain the word "commander" (Global Constraints).
- [ ] **Step 3: Compile.** `node dist/baton.mjs compile`. Expected: `wrote AGENTS.md` and `CLAUDE.md unchanged`, with no `note:` lines. Then `node dist/baton.mjs compile --check`, which exits 0. Read the new AGENTS.md. It must:
  - be ≤ 60 lines, and start with the generated-file comment;
  - still contain every command of the old file: `npm run check`, `npm run build`, `npm run validate:skills`, `node dist/baton.mjs --help` and `node dist/baton.mjs task ready`;
  - still contain the task-store workflow: `baton task update <id> --claim` and `baton task create`. Closing now goes through `baton verify <id>` instead of the old `baton task close <id>`;
  - still contain every project rule (the six `rules-project` bullets), and the never-edit rule for `STATE.md`, `tasks.jsonl`, `memories.jsonl` and decision records;
  - keep the pointers: `.context/spec.md`, `.context/decisions/` and `.context/knowledge/` (in the template's `## Continuity` block), plus `docs/design/` and `docs/research/`.

  If any of these is missing, fix `.context/rules.md` and compile again.
- [ ] **Step 4: Add the CI step.** In `.github/workflows/ci.yml`, directly after `- run: npm run build`, add `- run: node dist/baton.mjs compile --check`.
- [ ] **Step 5: Add a dogfood test** to `test/dogfood-context.test.ts`, "AGENTS.md is compiled from rules.md": every entry of `(await planCompile(REPO_ROOT)).files` has `action` `"unchanged"`, and the `warnings` are `[]`.
- [ ] **Step 6: Verify.** `npm run check` and `node dist/baton.mjs drift`. Expected: PASS. `drift` shows the three new rules sections as unverified, and no dead references among them.
- [ ] **Step 7: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-vyr.14
  git add .context/rules.md AGENTS.md .github/workflows/ci.yml test/dogfood-context.test.ts .context/tasks.jsonl
  git commit -m "chore(rules): AGENTS.md generated from rules.md, compile --check in CI" -- .context/rules.md AGENTS.md .github/workflows/ci.yml test/dogfood-context.test.ts .context/tasks.jsonl
  ```

---

### Task 16: Skills call the real `decide` and `verify`

Item `bt-vyr.15`. Claim it first. Its two check labels (`npm run check`, `npm run validate:skills`) both run under `verify`.

**Files:**
- Modify: `plugin/skills/decide/SKILL.md`, `plugin/skills/checkpoint/SKILL.md`, `plugin/skills/init-spec/SKILL.md`, `plugin/skills/doc-audit/SKILL.md`
- Modify: `templates/context/rules.md` (continuity bullets), `src/core/templates.generated.ts` (regenerated by `npm run embed:templates`)
- Modify: `test/skills.test.ts`, `test/skills-e2e.test.ts` (Phase 1 Task 19)
- Read first: the four SKILL.md files, `test/skills.test.ts`, `test/skills-e2e.test.ts`, ADR 0011

**Interfaces:**
- Consumes:
  - Task 5: `decide "<title>" [--status accepted --context … --outcome … --considered … --consequence …] [--spec] [--paths] [--supersedes]`, `decide --preflight` (exit 2 when something constrains), `decide --accept NNNN` (exit 2 while placeholders remain), and `decide` with no arguments (the list). Create prints `created ADR NNNN (<status>): <file>`.
  - Task 7: `verify <id> [--no-diff]`, printing `closed <id> (checks passed: …)`, with exit 2 for a failed check or an empty diff and exit 1 for no check label.
  - Phase 1 Task 19's tests:
    - `test/skills.test.ts`: every `` `baton <name> `` must name a registered command; `init-spec` must contain `baton task create` and `exits 3`; `checkpoint` must contain `baton task close` and `exits 3`.
    - `test/skills-e2e.test.ts`: `init --no-hooks`, a `storage` section, `verify-doc`, a decide fallback through `task create "Decide: SQLite per user"`, step 7 (which Task 7 already switched to `verify <id>` after appending to `src/db/store.ts`), `handoff`, `drift --fail-on stale`, and `mission`, which contains `Decide: SQLite per user` and `Spec section "Storage"`.
  - Phase 1 Task 10's packet lines: `Decision ADR <NNNN> (accepted): <title> (<file>)` for accepted, injectable ADRs whose `spec_sections` meet the tasks' `spec:` labels.
- Produces: the skill bodies, and the updated skill tests.

**Skill edits (pinned).** Keep every frontmatter unchanged, and the bodies well under 500 lines.
- **`decide`.** Replace the Steps and Rules with:
  1. "Preflight: `baton decide "<short title>" --preflight --spec <section-ids> --paths <paths it touches>`. Exit 2 lists the accepted decisions and load-bearing spec sections that constrain the change (`CONSTRAINS`). Read each one, and the `RELATED` ones."
  2. "If the choice contradicts an accepted decision, stop and tell the user which record and why. Proceed only if they want to supersede it."
  3. "Write the record: `baton decide "<title>" --spec <section-ids> --paths <paths> [--supersedes <NNNN>]`. It creates a proposed record with `{…}` placeholders. Replace each placeholder in the body (Context, Considered Options, Decision Outcome, Consequences) with what the user said, using the edit tools; keep it under a page. Never touch the frontmatter or its status line."
  4. "When the user confirms, run `baton decide --accept <NNNN>`. It refuses while placeholders remain, stamps the record and marks the record it supersedes."
  5. "A choice the user has already confirmed can be recorded in one step: `baton decide "<title>" --status accepted --spec <ids> --context "<why now>" --outcome "<the choice and why>"`, adding `--considered "<option>"` per option and `--consequence "Good, because …"`."
  6. "If decide prints a note about a load-bearing spec section, update that section's text to agree, and run `baton verify-doc <id>` once the user confirms."

  Rules:
  - "Decisions are append-only. To change one, supersede it with a new record. The PreToolUse hook denies hand edits to accepted records and hand-made record files."
  - Keep the existing "Load-bearing: …" bullet.
  - "`baton decide` with no arguments lists every record with its status."
- **`checkpoint`, Step 1,** replaced with: "For each task you finished this session, run `baton verify <task-id>`. It runs the task's `check:` commands and closes the task only if they pass on a non-empty diff since the task was started. Exit 2 means the check failed or nothing changed: leave the task open and say why. Exit 1 saying `no check: label` means the task has no check: ask the user for one, add it with `baton task update <task-id> --add-labels "check:<command>"`, then verify. Use `--no-diff` only for a task that by design changes no files (an investigation), and say so. Never mark a task done any other way."
- **`init-spec`, Step 5,** replaced with: "For every load-bearing choice the user states (storage, framework, auth model, hosting), run `baton decide "<title>" --status accepted --spec <section-ids> --context "<why, in the user's words>" --outcome "<the choice>"`. If the user has not confirmed it yet, leave out `--status accepted`, `--context` and `--outcome`: the record stays proposed (see the decide skill)."
- **`init-spec`, the Rules bullet** `- Never edit \`.context/decisions/\` or \`.context/STATE.md\` directly.` is replaced with: "- Never edit `.context/STATE.md`, decision frontmatter or accepted records; fill a proposed record's body (decide skill)."
- **`doc-audit`, Step 3:** change "or supersede via `baton decide`" to "or supersede it with `baton decide "<title>" --supersedes <NNNN>` (decide skill)".
- **`templates/context/rules.md`,** in `rules-continuity`. Leave the marker, the second bullet (the load-bearing-choices bullet, `` - Load-bearing choices get a decision record before code (`baton decide --preflight` first). ``) and the third bullet exactly as they are.
  - Replace the first bullet, `` - Do not edit `.context/STATE.md` or `.context/decisions/` directly; use `baton handoff` and `baton decide`. ``, with: "- Do not edit `.context/STATE.md` directly; `baton handoff` regenerates it. Decision records come from `baton decide`: never edit decision frontmatter or accepted records; fill a proposed record's body."
  - Append the bullet: "- A task is done when `baton verify <id>` runs its check and closes it."
  - Then `npm run embed:templates`.

**Test edits (pinned):**
- **`test/skills.test.ts`.** Keep the command-name check, now over all five skills (`decide` included). Replace the two Phase 1 assertions with:
  - `init-spec` contains `baton decide` and `--status accepted`, and does not contain `exits 3`;
  - `checkpoint` contains `baton verify` and does not contain `exits 3`;
  - `decide` contains `--preflight`, `--accept` and `status line`.
- **`test/skills-e2e.test.ts`.** Steps 1–5 are unchanged. Replace steps 6–10 with:
  6. **decide.** `decide "SQLite per user" --status accepted --spec storage --context "One file per user keeps backups simple." --outcome "Use one SQLite file per user."` exits 0, and stdout contains `created ADR 0001 (accepted)`.
  7. **checkpoint's verify.**
     - `task create "Add store" --spec storage --check "node -e 0" --json`; take the id from the JSON.
     - `task update <id> --claim` → exit 0.
     - Append a line to `src/db/store.ts`.
     - `verify <id>` → exit 0, and stdout contains `closed <id>`.
  8. **Handoff.** `handoff --reason manual` → exit 0. STATE.md contains `reason: "manual"`, and lists `Add store` under `## Recently closed`.
  9. **Gate.** `drift --fail-on stale` → exit 0. `storage` is aging (uncommitted change), and that does not fail.
  10. **Packet.** `task create "Migrate store" --spec storage` (left open). `mission` stdout contains `Spec section "Storage"` and `Decision ADR 0001 (accepted): SQLite per user`.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-vyr.15 --claim`
- [ ] **Step 2: Edit the tests first.** `npx vitest run test/skills.test.ts test/skills-e2e.test.ts`. Expected: FAIL (the skill text is not updated yet).
- [ ] **Step 3: Edit the four SKILL.md files and the template** as pinned, then run `npm run embed:templates`.
- [ ] **Step 4: Run.** Expected: PASS. Then `npm run validate:skills` (expected: a `✓` line per skill, no failures), `npm run check` and `npm run build`.
- [ ] **Step 5: Close through `verify`** (both checks run), then commit.
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-vyr.15
  git add plugin/skills/decide/SKILL.md plugin/skills/checkpoint/SKILL.md plugin/skills/init-spec/SKILL.md plugin/skills/doc-audit/SKILL.md templates/context/rules.md src/core/templates.generated.ts test/skills.test.ts test/skills-e2e.test.ts .context/tasks.jsonl
  git commit -m "feat(skills): decide, checkpoint and init-spec call the real decide and verify" -- plugin/skills/decide/SKILL.md plugin/skills/checkpoint/SKILL.md plugin/skills/init-spec/SKILL.md plugin/skills/doc-audit/SKILL.md templates/context/rules.md src/core/templates.generated.ts test/skills.test.ts test/skills-e2e.test.ts .context/tasks.jsonl
  ```

---

### Task 17: Docs: command contract, roadmap, README

Item `bt-vyr.16`. Claim it first.

**Files:**
- Modify: `docs/design/architecture.md` (the command contract table; one source-layout line), `docs/design/context-format.md` (one cell), `docs/roadmap.md`, `README.md` (the status line only)
- Read first: those files, the ADRs 0018–0022 titles, and `node dist/baton.mjs --help`

**Interfaces:**
- Consumes: the commands as built in Tasks 5, 7, 9, 11, 12 and 14, and the record number of ADR 0022 (Task 14).
- Produces: docs only.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-vyr.16 --claim`
- [ ] **Step 2: Edit the command contract** in `docs/design/architecture.md`.
  1. Set the Phase cell to `done` for every row now built: `init`, `mission`, `handoff`, `drift`, `verify-doc`, `stats`, `decide`, `verify`, `compile` and `hook`. `mcp` stays `3`; `task`, `remember` and `explain` keep their cells.
  2. Replace these rows:
     - `| decide [title] [--preflight] [--supersedes] [--status] [--accept] [--spec] [--paths] [--context] [--considered] [--outcome] [--consequence] [--deciders] | decisions, spec and the other sections (index), git HEAD | new ADR (exclusive create); status and verified_at of the accepted record and of the record it supersedes (ADR 0018) | 0, 1, 2 when preflight finds a constraint or a status change is refused | done |`
     - `| verify <task> [--no-diff] | the task's check: labels, git log --since, git status | closes the task in the store (ADR 0019) | 0, 1, 2 on a failed check or an empty diff, 3 for non-native backends | done |`
     - `| compile [--check] | .context/rules.md | AGENTS.md (generated), CLAUDE.md (@AGENTS.md line ensured) (ADR 0022) | 0, 1, 2 on --check drift or over 60 lines | done |`
     - `| hook <event> [--harness] | stdin JSON | per handler; .context/.cache/guard.jsonl and touched.jsonl | 0 always; structured deny (PreToolUse) and block (Stop) | done |`
  3. In the `task create|list|…` row, change the exit-codes cell to `0, 1, 2 on refused state change (claimed, blocked, cycle, closing a checked task without --force; ADR 0019)`.
  4. In the source layout, change the `compile.ts` line Task 2 added to end with `(ADR 0022)`.
- [ ] **Step 3: Edit `docs/design/context-format.md`.** In the Mutation rules table, set the `rules.md → AGENTS.md` row's Enforced-by cell to `compile --check in CI (ADR 0022)`.
- [ ] **Step 4: Edit `docs/roadmap.md`.**
  1. Replace the sentence "Done so far: scaffold (all commands stubbed, exit 3) and the native task store (ADR 0009)." with "Done so far: scaffold, the native task store (ADR 0009), the Phase 1 MVP and the Phase 2 gates. Both phases' gates are dogfood measurements still to be taken."
  2. Under the Phase 2 heading, add the line: "Built: epic `bt-vyr` (plan: [phase 2](superpowers/plans/2026-10-21-phase2-gates.md); ADRs 0018–0022). The gate is measured by hand: `bt-vyr.18`."
  3. Append to open question 4: " Resolved: yes by default; `--no-diff` opts out (ADR 0019)."
- [ ] **Step 5: Edit `README.md`'s status line**, the `> Status:` blockquote near the top. Replace the whole line with: "> Status: **pre-alpha.** Phases 1–2 are built: mission packet, handoff, drift, stats, init, decide, verify, compile and the hook guards, plus the task store and `baton explain` (also as `/baton explain`). Their dogfood gates are still being measured. See [docs/roadmap.md](docs/roadmap.md)." Leave every other line of the README alone.
- [ ] **Step 6: Verify.** `npm run check`. Expected: PASS.
- [ ] **Step 7: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-vyr.16
  git add docs/design/architecture.md docs/design/context-format.md docs/roadmap.md README.md .context/tasks.jsonl
  git commit -m "docs: Phase 2 command contract, roadmap open question 4 resolved, README status" -- docs/design/architecture.md docs/design/context-format.md docs/roadmap.md README.md .context/tasks.jsonl
  ```

---

### Task 18: Stamp the Phase 2 sections and regenerate STATE.md

Item `bt-vyr.17`. Claim it first. This is the last task: the stamps must reflect the final tree.

**Files:**
- Modify by hand: the `source_paths` lists in `.context/spec.md` markers (Step 2). Only when its text is inaccurate: `.context/spec.md`, `.context/rules.md` (then `node dist/baton.mjs compile`, which rewrites `AGENTS.md`), and `.context/knowledge/*.md`.
- Modify through the CLI only: the `verified_at` stamps (`verify-doc`), `AGENTS.md` (`compile`), and `.context/STATE.md` (`handoff`).
- Read first: every section `node dist/baton.mjs drift --format json` lists as unverified, aging or stale, and the files its `source_paths` and body point to.

**Interfaces:**
- Consumes:
  - Phase 1 Task 6: `drift [--format json] [--fail-on]`, which lists `id`, `file`, `level`, `reason`, `deadRefs` and `sourcePaths` per section.
  - Phase 1 Task 7: `verify-doc <ids...>`, printing `verified <id> at <sha12> (<file>)`.
  - Phase 1 Task 12: `handoff`; Phase 1 Task 10: `mission`; Task 14: `compile [--check]`; Task 13: `npm run smoke:hooks`.
  - Commits that change only `.context/` files never age a section (ADR 0013). Uncommitted changes outside `.context/` do (ADR 0021), so stamp with a clean tree.
- Produces: stamped sections, and a regenerated STATE.md.

- [ ] **Step 1: Claim and build.** `node dist/baton.mjs task update bt-vyr.17 --claim`, then `npm run build`. `git status --porcelain` must list only `.context/tasks.jsonl`; commit or finish anything else first.
- [ ] **Step 2: Bring the spec's `source_paths` up to date.** Edit only the marker lists in `.context/spec.md`. Quote every glob, then run `node dist/baton.mjs drift`: no section may show a dead `source_paths` reference.
  - `decisions`: add `src/core/preflight.ts` and `src/core/decide.ts`.
  - `tasks`: add `src/core/verify.ts` and `src/commands/verify.ts`.
  - `context-format`: add `src/core/compile.ts` and `src/commands/compile.ts`.
  - `hooks`: `src/hooks/**` already covers the new handlers.
  - `freshness`: `src/core/drift.ts` is already there (Phase 1).
- [ ] **Step 3: Review each section** that is unverified, aging or stale after this plan:
  - ADRs 0018–0021, and 0022 if it is aging;
  - `rules-orientation`, `rules-commands`, `rules-project`, `rules-continuity` and `rules-where`;
  - the spec sections `decisions`, `tasks`, `hooks`, `freshness`, `context-format` and `skills`;
  - `knowledge-harness-limits`.

  For each, read its text against the code it describes:
  - **Spec, rules or knowledge that is wrong:** fix the text. For rules, run `node dist/baton.mjs compile` afterwards. If the fix changes a load-bearing statement in `.context/spec.md`, do not edit it: run `node dist/baton.mjs decide "<what changes>" --spec <id>`, leave that record proposed, and leave the section unstamped.
  - **An ADR that is wrong:** never edit it. Leave it unstamped, and run `node dist/baton.mjs task create "Supersede ADR <NNNN>: <why>" -t decision --spec <its spec_sections>`.
  - **Not sure:** leave it unstamped.
- [ ] **Step 4: Commit the marker and text fixes first,** so that the stamps point at a commit that contains them:
  ```bash
  git add .context/spec.md .context/rules.md AGENTS.md .context/knowledge/ .context/decisions/ .context/tasks.jsonl
  git commit -m "docs(context): Phase 2 source_paths and section fixes before verification" -- .context/spec.md .context/rules.md AGENTS.md .context/knowledge/ .context/decisions/ .context/tasks.jsonl
  ```
  Skip this commit if nothing changed.
- [ ] **Step 5: Stamp the confirmed sections.** `node dist/baton.mjs verify-doc <confirmed ids...>`. Expected: one `verified <id> at <sha12> (<file>)` line per id, exit 0.
- [ ] **Step 6: Check.**
  - `node dist/baton.mjs drift`: the confirmed sections are `fresh`; only the ones deliberately left out are unverified, plus `state`.
  - `node dist/baton.mjs compile --check`: exit 0.
  - `node dist/baton.mjs decide`: lists 0001–0022, with 0007 shown as superseded.
- [ ] **Step 7: Commit the stamps.**
  ```bash
  git add .context/spec.md .context/rules.md .context/knowledge/ .context/decisions/
  git commit -m "chore(context): stamp verified_at on confirmed Phase 2 sections" -- .context/spec.md .context/rules.md .context/knowledge/ .context/decisions/
  ```
- [ ] **Step 8: Final checks.**
  - `npm run check`, `npm run validate:skills`, `npm run smoke:hooks` and `node dist/baton.mjs compile --check`: all pass.
  - `node dist/baton.mjs mission`: the packet is ≤ 9,000 characters, starts with `# baton mission brief`, and lists every unstamped id under "Withheld as unverified".
- [ ] **Step 9: Close through `verify`, then regenerate STATE and commit.** The stamp commits since the claim are the diff (`.context/spec.md` and friends are not in the ignore list). `verify` runs `npm run check`: set the shell tool's `timeout` to 600000 ms.
  ```bash
  node dist/baton.mjs verify bt-vyr.17
  node dist/baton.mjs task comment bt-vyr "Phase 2 deliverables landed (ADRs 0018-0022). Gate pending: bt-vyr.18, measured by hand over 10 sessions."
  node dist/baton.mjs handoff --reason manual
  git add .context/STATE.md .context/tasks.jsonl
  git commit -m "chore(context): regenerate STATE.md with baton handoff after Phase 2" -- .context/STATE.md .context/tasks.jsonl
  ```
  `bt-vyr.18` and the epic `bt-vyr` stay open. Expected: `handoff` prints `wrote .context/STATE.md (manual)`, and STATE lists `bt-vyr.18` as ready.
