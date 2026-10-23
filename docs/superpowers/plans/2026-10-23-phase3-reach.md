# Phase 3 · Reach: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Task 1 creates the plan's task-store items, and Task 3 the follow-ups. Every task claims its item first (`node dist/baton.mjs task update <id> --claim`) and closes it with `node dist/baton.mjs verify <id>`, the command Phase 2 built; `task close` refuses a task with a `check:` label unless `--force` is given, and no step here forces a close. **Controllers:** give each implementer the Global Constraints and Review Focus sections together with its task text. Every task restates the contracts it consumes, so it can be done without reading other tasks.

**Goal:** Build the Phase 3 deliverables from `docs/roadmap.md`, with the gate ("benchmark published") waived for the build and left open as a human task:
- the MCP adapter: four read-only tools implemented over core, served on stdio, with the SDK kept off the hook path;
- `baton init --harness codex|gemini`: Codex and Gemini CLI hook config, Gemini's AGENTS.md wiring, and the skills in `.agents/skills/`;
- the skills checked statically for every Agent Skills harness (spec keys only, every CLI call real);
- the package and the plugin marketplace entry made publish-ready, but not published;
- a paired A/B benchmark harness, built and run locally on synthetic fixtures, not published.

The last task stamps the new sections and regenerates STATE.md with `baton handoff`. Everything outward-facing (npm publish, git push, marketplace listing, live Codex/Gemini/Claude sessions, the real benchmark) becomes a human task in the store. Human tasks carry the label `human`, which keeps them out of the mission packet and the claim queue (Task 3).

**Architecture:** As in Phases 1–2, logic lives in `src/core/` as pure functions plus small IO wrappers, and commands stay thin.
- **MCP:** `core/search.ts` (new, also `baton search`) plus the existing `buildMission`, `runPreflight` and `evaluateFreshness` → `mcp/server.ts` (four tools, no writes) → `commands/mcp.ts` (lazy import, stdio). `mcp/inmemory.ts` connects a server to the SDK's `InMemoryTransport` for tests and for the benchmark's overhead count. `scripts/bundle-check.mjs` reads the build's metafile and fails when the hook path can reach the SDK.
- **Harnesses:** `core/harness.ts` (pure config builders and merge rules) and `core/skills.generated.ts` (skills embedded like the templates) → `commands/init.ts`. `hooks/guards.ts` and `hooks/io.ts` learn Codex's `apply_patch` field and Gemini's JSON-only stdout. `scripts/hook-smoke.mjs` runs the generated command strings through a shell.
- **Publish:** `package.json`, a package-root `.claude-plugin/plugin.json`, the marketplace entry, `CHANGELOG.md`, `scripts/third-party.mjs` (license notices from the metafile, plus the code the MCP SDK vendors inside its own `dist/`, found through the source maps) and `scripts/pack-check.mjs` (`npm pack --dry-run` file list and size, plus an offline unpack smoke test).
- **Benchmark:** `core/bench.ts` (manifest, per-task pairing, sign test, gate, rendering) → `commands/bench.ts`; `scripts/bench-synth.mjs` generates `bench/synthetic/`.
- **Human tasks:** `core/tasks/snapshot.ts` and `TaskService.ready` leave `human`-labelled tasks out of the packet, STATE's lists and `task ready --unassigned`/`--claim` (Task 3).

**Tech Stack:** TypeScript (ESM, Node ≥ 22.13), commander 15, yaml 2, zod 4, `@modelcontextprotocol/server` 2.3.1 (already a dependency; Task 13 moves it to devDependencies because it is bundled), vitest 5, Biome 2, tsup 9. No new dependencies of any kind.

**Spec:** `.context/spec.md`, sections `hooks`, `skills`, `measurement`, `scope` and `purpose`. Also `docs/roadmap.md` (Phase 3 bullets: the acceptance bar), `docs/design/architecture.md` (principle 5, the `mcp` command row, the hook wiring table's Codex and Gemini columns, Integrations, the performance budget), `docs/design/metrics.md` (the five metrics, the paired A/B method, the decision rule), `docs/research/2026-10-16-implementation-notes.md` §2, §3, §5 and §6, and ADRs 0001–0022.

**Starting state.** The plans run one after another in this worktree: the explain side track (done), the Phase 1 MVP (`docs/superpowers/plans/2026-10-20-phase1-mvp.md`, Tasks 1–21, ADRs 0012–0017), Phase 2 Gates (`docs/superpowers/plans/2026-10-21-phase2-gates.md`, Tasks 1–18, ADRs 0018–0022), then this plan. Phase 3 starts from "Phase 1 and Phase 2 fully implemented as written". Every interface used below is cited as "P1 Task N" or "P2 Task N" and restated where it is consumed. Phase 1 Tasks 1–17 had landed when this plan was revised, and those citations were checked against `src/`. Landed facts that matter here:
- `renderDriftText(report)` (`src/core/drift.ts`) ends its text with `"\n"`.
- `src/core/transcript.ts` redacts more secret shapes and shortens more out-of-repo path forms than P1 Task 11 pinned (Git Bash, WSL, UNC and `file://` paths, URL credentials, `curl -u`); summaries are never less redacted than pinned.
- `biome.json` excludes `.context/.cache` and `src/core/templates.generated.ts`; `vitest.config.ts` sets 30 s test and hook timeouts.
- Biome rewrites a `﻿` escape in a string or regex into a literal BOM character. Source files keep the literal form that Biome writes (as `src/core/init.ts` does); tests build the BOM with `String.fromCharCode(0xfeff)`.
- `init` (P1 Task 16) prints `… or /plugin install baton@baton-dev` and exits 3 for `codex` and `gemini`; the hook fast path (P1 Task 17) is in place.

**Roadmap open questions:**
- Q3, "Is `search` in the MCP adapter worth its tool-definition tokens?", stays open. This plan keeps `search` and makes the benchmark report the tool-definition cost (ADR 0026), so the live A/B run can answer it.
- Q1, Q2 and Q4 are untouched; Q5 is resolved (ADR 0011).

**Phase gate.** Waived for the build. Task 1 replaces the `bt-jx6 blocks bt-vyr` link with a `related` link. Task 3 creates the gate measurement ("run the live paired A/B benchmark and publish it") as a human task, `bt-jx6.23`, which stays open after this plan.

**Not in this plan:**
- `npm publish`, `git push`, the marketplace listing or directory submission, `npm link`, `npm install -g`, and any live or nested `claude`, `codex` or `gemini` session. Each becomes a human task (Task 3).
- PostToolUse/AfterTool and Stop/AfterAgent wiring for Codex and Gemini CLI, and preflight context on their pre-tool hooks: their output handling is not observed yet. Task 3 files it as `bt-jx6.24`.
- Codex and Gemini transcript readers for `stats` and `bench` (both read Claude Code transcripts only).
- A Codex plugin or a Gemini extension package. Codex can load plugins that bundle `hooks/hooks.json` (implementation notes §5), but its handlers take a command string, not exec-form `args`, so the Claude plugin's hooks file would not run there unchanged.
- Antigravity CLI, which replaced Gemini CLI for some users (implementation notes §5).

## Global Constraints

- **Starting state.** Phase 1 and Phase 2 are fully implemented, and every interface they declare under **Interfaces → Produces** exists. If a restated interface differs from the code, stop and report; do not adapt silently.
- **Layering.**
  - `src/core/` never imports from `commands/`, `hooks/` or `mcp/`.
  - Hook handler modules keep Phase 2's import rule: statically only `src/hooks/guards.ts`, `src/hooks/io.ts`, `src/core/glob.ts`, `src/core/paths.ts`, `src/core/decisions.ts`, `src/core/errors.ts` and Node built-ins.
  - The MCP SDK is imported only by `src/mcp/**`, and `src/mcp/**` is loaded only through `await import()` (from `src/commands/mcp.ts` and `src/commands/bench.ts`). From Task 6 on, `npm run check:bundle` enforces this on the build.
  - `src/program.ts` changes only where a task says so: Task 4 registers `search`, Task 16 registers `bench`.
- **Exit codes.** 0 ok, 1 error, 2 check failed or blocked, 3 not implemented. Throw `new BatonError(message, ExitCode.X)` (`src/core/errors.ts`); `action()` (`src/commands/_shared.ts`) maps it to stderr plus `process.exitCode`. Hooks always exit 0; only a structured deny or block changes agent behaviour (ADR 0008). MCP tools never throw to the SDK: an error is a tool result with `isError: true`.
- **Checks.**
  - `npm run check` (Biome, `tsc --noEmit`, vitest) passes at the end of every task.
  - Any task that changes `src/`, `templates/`, `plugin/skills/` or `scripts/embed-templates.mjs` runs `npm run build` before closing its item.
  - `npm run validate:skills` keeps passing; skill tasks run it.
  - From Task 6 on, `npm run check:bundle` passes after every build. From Task 14 on, `npm run check:pack` passes too.
- **TypeScript.** `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on. Set optional properties only when you have a value; never assign `undefined`. ESM imports use `.js` suffixes.
- **Dependencies.** No new runtime or dev dependencies. In particular, do not add `@modelcontextprotocol/client`: tests talk to the server through `InMemoryTransport` with the small JSON-RPC client in `src/mcp/inmemory.ts` (Task 5).
- **Hand-edit rules.**
  - Never hand-edit `.context/tasks.jsonl`, `.context/memories.jsonl` or `.context/STATE.md`. Use `baton task …`, `baton remember …` and `baton handoff`.
  - Never edit an existing ADR (0001–0022). Decision records are created only through `node dist/baton.mjs decide` (P2 Task 5). The one allowed hand edit is replacing the `{…}` placeholders in the body of a proposed record that `decide` created (Tasks 2–3), with the edit tools. Never touch decision frontmatter; `decide --accept` changes the status.
  - `AGENTS.md` is generated: change `.context/rules.md`, then run `node dist/baton.mjs compile` (P2 Task 14).
  - **Never write the word "commander"** in any text that ends up under `.context/`: ADR bodies, rules, spec, knowledge, task titles, descriptions and comments. The explain dogfood test asserts that no `.context/` text mentions that dependency.
- **Explain files.** Do not touch `src/core/explain/**`, `src/commands/explain.ts`, `test/explain-*.test.ts` or `test/helpers/explain-fixture.ts`. `plugin/skills/baton/SKILL.md` changes only in Task 12 (one sentence).
- **No outward-facing steps.** No `npm publish`, no `git push`, no marketplace submission, no `npm link`, no `npm install -g`, no live or nested `claude`, `codex` or `gemini` session, and no network call in a test or script. `npm pack` writes its tarball only into a temp folder (Task 14). Reading public docs is research, already done for this plan (implementation notes, Task 1).
- **npm calls.** From Task 1 on, the repo's `.npmrc` sets `update-notifier=false`, so no npm command in a step, a script or CI checks the registry for npm's own updates. Scripts and the commands pinned in Tasks 13–14 also pass `--no-update-notifier` explicitly, and `npm pack` passes `--offline`.
- **Home folder.** The user's home (`C:\Users\jeswi`) is itself a git repo and holds the real Codex and Gemini config. Code that writes user-level harness config resolves the home as `process.env.BATON_HOME ?? homedir()` (the explain track's rule), and Codex's folder as `process.env.CODEX_HOME ?? join(home, ".codex")` (Task 8). Every test file that runs `init` or the harness planner sets `process.env.BATON_HOME` to a `makeTempDir()` and deletes `process.env.CODEX_HOME` in `beforeEach` (init tests also set `BATON_BUNDLE`, Task 10), and restores them in `afterEach`; every script that runs `init` passes a temp `BATON_HOME` and no `CODEX_HOME`. Nothing in this plan writes under the real home.
- **Windows.**
  - Every file read that is parsed first strips one leading UTF-8 BOM, then normalises CRLF to LF: `text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")` (in source files Biome stores that BOM literally; in tests build it with `String.fromCharCode(0xfeff)`).
  - Repo paths are POSIX. Paths written into JSON config or shell command strings use forward slashes.
  - Path comparisons against the project root are case-insensitive on `win32` only; functions that compare paths take a `platform` parameter (default `process.platform`).
  - Run npm from Node with `execSync("<npm command>", …)` (a shell), never `spawn("npm")`: on Windows npm is `npm.cmd`, which Node will not spawn without a shell.
  - Extract tarballs with `%SystemRoot%\System32\tar.exe` on Windows (Task 14), because a GNU `tar` from Git Bash misreads `C:` as a host name.
- **Writes.** Regenerated files under `.context/` use `writeFileAtomic(path, text)` (sync, temp file + rename, `src/core/tasks/native/jsonl.ts`), LF. Harness config files (`.codex/hooks.json`, `.gemini/settings.json`) and skill copies use `writeFileAtomic` too, after `mkdirSync(dirname(path), { recursive: true })`, written as two-space JSON plus `"\n"`, LF, no BOM. The benchmark writes only into `.context/.cache/bench/<name>/` (git-ignored) or a folder given with `--out`.
- **Tests.**
  - Temp dirs come only from `makeTempDir()` or `makeRepo()` in `test/helpers/repo.ts` (P1 Task 3). Loading that module sets `GIT_CEILING_DIRECTORIES` to the OS temp folder. A dir that must count as "no project" gets `runGit(dir, "init", "-q")` first (`emptyTmp` below).
  - **Stamped fixture** means `root = makeRepo()`, then `stampFixture(root, commitAll(root, "base").slice(0, 12))`, then `commitAll(root, "stamp")` (P1 Task 3 helpers). Its sections: `rules-project` (`.context/rules.md:3`), `auth` (`.context/spec.md:3`, `Authentication`, `["src/auth/**"]`, body ``Users sign in with passkeys (`src/auth/login.ts`).``), `billing` (`.context/spec.md:8`), `state`, `knowledge-windows` (`.context/knowledge/windows.md:1`), `adr-0001` (`.context/decisions/0001-use-passkeys.md:1`, `Use passkeys for sign-in`, accepted, `spec_sections: [auth]`) and `adr-0002` (`Use passwords`, superseded by `adr-0001`). All are fresh except `adr-0002`.
  - Tests that touch tasks set `process.env.BATON_ACTOR = "tester"`. Tests never write this repo's `.context/`; dogfood tests only read it.
  - Tests that `process.chdir` (through `runCli`, P1 Task 6) restore the cwd in `finally`.
  - Each bullet in a test list that builds a fixture is its own `it`, with a fresh fixture, unless it says it continues the previous one.
- **Expected-text blocks.** A fenced block inside a list item is indented for markdown only; each expected line starts at the block's left edge.
- **Hook budgets.** Median wall time on the built CLI, measured by `scripts/hook-smoke.mjs`: `pre-tool-use` < 150 ms, the other events < 1000 ms, and Codex `SessionEnd` must finish well inside Codex's 3 s cap. vitest timing checks stay loose (< 3000 ms).
- **Closing items.**
  - Claim first: a claim sets the task's `started_at`, and `verify`'s diff rule counts from there (P2 Task 6).
  - Close with `node dist/baton.mjs verify <id>` after `npm run build` and **before** the commit, so the uncommitted work is the diff. `verify` runs every `check:` label (`npm run check` at least): allow up to 10 minutes and set the shell tool's `timeout` to 600000 ms.
  - If `verify` exits 2, the task is not done: fix it and run `verify` again. Never use `--no-diff`, `task close` or `--force` instead.
- **Live hooks.** If this session loaded the baton plugin (`claude --plugin-dir ./plugin`), its hooks run the code you build. No step edits a protected file directly. If you see a deny, its reason names the baton command to use: use that command. Do not set `guards.protectState: false`.
- **Commits.** End each task with a path-scoped commit: `git add <paths>`, then `git commit -m "<message>" -- <paths>`, with the same paths both times, always including `.context/tasks.jsonl`. Never `git add -A` or a bare `git commit`. Commits carry **no attribution trailers** anywhere (no `Co-Authored-By`, no Claude line). This plan file is untracked when execution starts; Task 1 commits it.
- **Human tasks.** Follow-ups that need a person carry the label `human` and the description opener "Agents: do not claim this task." Never claim one; from Task 3 on, `task update <id> --claim` refuses them without `--force`, which only a person passes.
- **Free-text arguments.** These contain none of `>`, `;`, `|` or `&`: commit messages, `--reason`, task titles, `-d` descriptions, task comments, and `decide` titles and options. The PreToolUse shell guard splits commands on those characters (P2 Task 8). Matcher patterns such as `^(Bash|apply_patch)$` therefore appear only in files written with the edit tools, never in a CLI argument.
- **Task ids.** This plan assumes the ids in the Task-store map. If Task 1 recorded different printed ids (in a comment on `bt-jx6`), use those.

## Review Focus

1. **The MCP adapter only reads, and stays off the hook path.**
   - Task 5: a snapshot test proves that calling all four tools changes no file outside `.context/.cache/` and leaves `git status` clean; `mission` writes no packet cache and `drift` no drift log; there is no `decide`, `verify` or other writing tool (`tools/call decide` is JSON-RPC error -32602).
   - Task 4 and Task 5: `search` and `preflight` never return the title or text of a stale, unverified or superseded section, only its id, location and reason (`(title withheld)`), so nothing the packet withholds reaches the model through the adapter.
   - Task 5: the real `serveStdio` path is exercised over in-process streams, not only the in-memory pair.
   - Task 6: `scripts/bundle-check.mjs` fails when the SDK is reachable from `src/hooks/entry.ts` or from the entry's static imports, or when the bundle leaves any import other than a Node built-in external, with negative tests on fake metafiles.
2. **Harness config never loses the user's own config, and tests never touch the real home.**
   - Task 8: merging keeps every non-baton key, group and handler, is idempotent, rewrites baton handlers only with `--refresh-harness`, and refuses unparseable JSON (including JSON with comments) with exit 1. `--force` keeps its Phase 1 meaning and never touches harness files.
   - Task 10: an invalid `.gemini/settings.json` means nothing at all is written (not even `.context/`); `--scope user` writes only under `BATON_HOME` (or `CODEX_HOME`), with an absolute `node` command, and warns when the other scope already has baton hooks.
3. **Per-harness hook I/O matches the documented formats, and fails safe where they are silent.**
   - Task 7: Codex sends the patch in `tool_input.command` (Phase 2 read only `input`), `exec_command` counts as a shell tool, Gemini no-ops print `{}`, and pre-tool preflight context is suppressed under Codex and Gemini until a live session shows they accept it.
   - Task 8: anchored regex matchers (`^(Bash|apply_patch)$`, `^(write_file|replace|run_shell_command)$`), no matcher on lifecycle events, Codex timeouts in seconds with SessionEnd at 3, Gemini timeouts in milliseconds, Codex `additionalContextLimit: 4000`.
   - Task 11: the generated command strings run through a real shell with a PATH shim (plus informational PowerShell rows on Windows), and deny, context and STATE writes all work.
4. **The publishable package is complete, self-contained and correctly attributed.**
   - Task 13: no `private`, no runtime dependencies, the lockfile stays in sync (`npm ls`), and the two plugin manifests and the marketplace entry agree on name and version.
   - Task 14: the exact `npm pack` file list (no source maps, no `src/`, no `plugin/dist/`), the size caps, an unpacked copy that runs `--version`, `init`, a hook and the stdio MCP server, and notices for every package the metafile says is bundled **and** every package the MCP SDK vendors in its own `dist/` (ajv and friends, found in the source maps).
5. **The benchmark cannot be mistaken for a result.**
   - Task 15: pairs are tasks (per-task medians), exact sign-test vectors, the gate needs scored quality and at least 6 paired tasks, the metrics.md stop rule, and the baseline arm is defined (pre-`baton init` commit, plugin disabled).
   - Task 16: the synthetic fixtures regenerate byte for byte and follow that baseline definition, every report from them says it validates the harness and not baton (the gate status reads `… (synthetic)`), and the output stays in a git-ignored folder.

---

## Decisions in this plan

All four are created with `baton decide` (propose, fill the placeholders, accept), the flow P2 Task 14 dogfooded.

| ADR | Title | Task |
|---|---|---|
| 0023 | MCP adapter: four read-only tools over core, served on stdio | 2 |
| 0024 | Codex and Gemini CLI hook config written by init | 2 |
| 0025 | Publish baton-ctx as one bundled package and plugin root | 3 |
| 0026 | Paired A/B benchmark over session transcripts | 3 |

## File structure

| File | Responsibility | Task |
|---|---|---|
| `docs/research/2026-10-16-implementation-notes.md`, `.context/knowledge/harness-limits.md` | Codex, Gemini, plugin-source, MCP and npm facts with sources | 1, 11, 17 |
| `.npmrc` | `update-notifier=false` for every npm call in the repo | 1 |
| `.context/decisions/0023-…` – `0026-…` (via `decide`) | Phase 3 decisions | 2, 3 |
| `src/core/tasks/snapshot.ts`, `src/core/tasks/native/service.ts`, `src/commands/task.ts` | `human`-labelled tasks stay out of the packet, STATE and the claim queue | 3 |
| `src/core/search.ts`, `src/commands/search.ts`, `src/program.ts` | Full-text search over the section index; `baton search` | 4 |
| `src/mcp/server.ts`, `src/mcp/inmemory.ts`, `src/commands/mcp.ts` | Four read-only tools; in-memory client; `baton mcp [--root]` | 5 |
| `tsup.config.ts`, `scripts/bundle-check.mjs` | Build metafile; the SDK stays out of the hook path | 6 |
| `src/hooks/guards.ts`, `src/hooks/io.ts`, `src/hooks/dispatch.ts` | Codex `apply_patch`/`exec_command` input; Gemini `{}` output | 7 |
| `src/core/harness.ts` | Codex/Gemini hook config, merge rules, Gemini context, scope paths, skill copies | 8 |
| `scripts/embed-templates.mjs`, `src/core/skills.generated.ts` | Skills embedded in the bundle | 9 |
| `src/core/init.ts`, `src/commands/init.ts` | `init --harness codex\|gemini [--scope]` | 10 |
| `scripts/hook-smoke.mjs` | Codex and Gemini command strings through a shell | 11 |
| `plugin/skills/baton/SKILL.md`, `test/skills-harness.test.ts` | Harness-neutral arguments; static check of every skill's CLI calls | 12 |
| `package.json`, `package-lock.json`, `.claude-plugin/plugin.json` (new), `.claude-plugin/marketplace.json`, `plugin/.claude-plugin/plugin.json`, `CHANGELOG.md` | Publish-ready package and plugin manifests | 13 |
| `scripts/third-party.mjs`, `scripts/pack-check.mjs`, `THIRD_PARTY_NOTICES.md`, `.github/workflows/ci.yml` | Bundled-code notices; `npm pack` check; CI | 6, 14 |
| `src/core/bench.ts` | Benchmark manifest, pairing, sign test, gate, rendering | 15 |
| `scripts/bench-synth.mjs`, `bench/synthetic/**`, `src/commands/bench.ts`, `biome.json` | Synthetic fixtures and `baton bench` | 16 |
| `docs/design/*.md`, `docs/roadmap.md`, `README.md`, `.context/spec.md` | Docs and spec text | 17, 18 |

## Task-store map

Task 1 creates `bt-jx6.1`–`bt-jx6.16`, in this order (the epic has no children yet). Task 3 creates the follow-ups `bt-jx6.17`–`bt-jx6.25` once `human` tasks stay out of the packet. If `task create` prints different ids, the task that created them records the mapping in a comment on `bt-jx6`, and every later task uses the printed ids.

| Plan task | Item | Plan task | Item |
|---|---|---|---|
| 1–3 Facts, ADRs 0023–0026, `human` label, follow-ups | bt-jx6.1 | 11 Hook smoke for Codex and Gemini | bt-jx6.9 |
| 4 `baton search` | bt-jx6.2 | 12 Skills cross-harness check | bt-jx6.10 |
| 5 MCP server | bt-jx6.3 | 13 Package and plugin manifests | bt-jx6.11 |
| 6 Bundle check | bt-jx6.4 | 14 Notices and pack check | bt-jx6.12 |
| 7 Codex and Gemini hook I/O | bt-jx6.5 | 15 Benchmark core | bt-jx6.13 |
| 8 Harness config core | bt-jx6.6 | 16 `baton bench` and fixtures | bt-jx6.14 |
| 9 Embedded skills | bt-jx6.7 | 17 Docs | bt-jx6.15 |
| 10 `init --harness codex\|gemini` | bt-jx6.8 | 18 Stamp and STATE | bt-jx6.16 |

Follow-ups (created in Task 3, left open by this plan; every `human` item carries the label `human`):

| Item | What | Who |
|---|---|---|
| bt-jx6.17 | Publish `baton-ctx` 0.1.0 to npm (blocked by `bt-jx6.25`) | human |
| bt-jx6.18 | Push, add the `baton` marketplace in Claude Code, install, optional directory submission | human |
| bt-jx6.19 | Observe the Codex hooks in a live Codex session | human |
| bt-jx6.20 | Observe the Gemini CLI hooks in a live Gemini session | human |
| bt-jx6.21 | Try the baton skills in Codex and Gemini CLI | human |
| bt-jx6.22 | Register `baton mcp` in an MCP client and observe the four tools | human |
| bt-jx6.23 | Run the live paired A/B benchmark and publish it (the Phase 3 gate) | human |
| bt-jx6.24 | Wire PostToolUse, Stop and pre-tool preflight context for Codex and Gemini once their outputs are observed | agent, later |
| bt-jx6.25 | Confirm the vendored license texts in THIRD_PARTY_NOTICES.md against upstream | human |

The epic `bt-jx6` stays open after Task 18.

---

### Task 1: Task-store items and harness facts

Item `bt-jx6.1` (created here). The ADRs in Tasks 2–3 cite these facts, so they land first. The follow-ups for people are created in Task 3, after `human` tasks stay out of the packet.

**Files:**
- Task store, through the CLI only → `.context/tasks.jsonl`
- Modify: `docs/research/2026-10-16-implementation-notes.md` (§2, §5, §6; a new §11)
- Modify: `.context/knowledge/harness-limits.md` (append four bullets; leave the frontmatter alone)
- Create: `.npmrc` (one line, `update-notifier=false`; npm never packs `.npmrc`)
- Commit: `docs/superpowers/plans/2026-10-23-phase3-reach.md` (this plan; untracked until now)
- Read first: `docs/research/2026-10-16-implementation-notes.md` (all of it), `.context/knowledge/harness-limits.md`

**Interfaces:**
- Consumes: the existing CLI `task create|dep add|dep remove|comment|update` (`task create` prints `created <id>: <title>`; options `--parent`, `-t`, `-p`, `--spec`, `--check`, `--labels`, `--deps`, `-d`).
- Produces: items `bt-jx6.1` … `bt-jx6.16`; the facts the ADRs cite.

- [ ] **Step 1: Build, unblock the epic, create the items.**
  1. Run `npm run build` if `dist/baton.mjs` is missing.
  2. Replace the phase-gate link and record why:
     ```bash
     node dist/baton.mjs task dep remove bt-jx6 bt-vyr
     node dist/baton.mjs task dep add bt-jx6 bt-vyr -t related
     node dist/baton.mjs task comment bt-jx6 "Phase gates waived by the user for the build. The Phase 3 gate (benchmark published) stays open as a human task created in Task 3. Plan: docs/superpowers/plans/2026-10-23-phase3-reach.md"
     ```
  3. Run these one at a time, in order. They are expected to print `bt-jx6.1` to `bt-jx6.16`. If an id prints differently, substitute the printed id wherever it appears later in this step.
     ```bash
     node dist/baton.mjs task create "Phase 3 decisions: harness facts, ADRs 0023-0026, human-task label" --parent bt-jx6 -t chore -p 1 --spec hooks,skills,measurement,tasks --check "npm run check"
     node dist/baton.mjs task create "baton search: full-text search over the section index" --parent bt-jx6 -p 2 --spec hooks --check "npm run check" --deps blocks:bt-jx6.1
     node dist/baton.mjs task create "MCP adapter: four read-only tools over core" --parent bt-jx6 -p 2 --spec hooks --check "npm run check" --deps blocks:bt-jx6.2
     node dist/baton.mjs task create "Bundle check: the MCP SDK stays out of the hook path" --parent bt-jx6 -p 2 --spec hooks --check "npm run check" --labels "check:npm run check:bundle" --deps blocks:bt-jx6.3
     node dist/baton.mjs task create "Codex and Gemini hook input and output" --parent bt-jx6 -p 2 --spec hooks --check "npm run check" --deps blocks:bt-jx6.1
     node dist/baton.mjs task create "Harness config core: Codex and Gemini hook files and merge rules" --parent bt-jx6 -p 2 --spec hooks --check "npm run check" --deps blocks:bt-jx6.1
     node dist/baton.mjs task create "Embed the skills in the bundle" --parent bt-jx6 -p 2 --spec skills --check "npm run check" --deps blocks:bt-jx6.1
     node dist/baton.mjs task create "init --harness codex and gemini" --parent bt-jx6 -p 2 --spec hooks,skills,context-format --check "npm run check" --deps blocks:bt-jx6.6,blocks:bt-jx6.7
     node dist/baton.mjs task create "Hook smoke test for Codex and Gemini command strings" --parent bt-jx6 -p 2 --spec hooks --check "npm run check" --labels "check:npm run smoke:hooks" --deps blocks:bt-jx6.5,blocks:bt-jx6.8
     node dist/baton.mjs task create "Skills cross-harness static check" --parent bt-jx6 -p 2 --spec skills --check "npm run check" --labels "check:npm run validate:skills" --deps blocks:bt-jx6.7
     node dist/baton.mjs task create "Publish-ready package metadata and plugin manifests" --parent bt-jx6 -p 2 --spec skills --check "npm run check" --deps blocks:bt-jx6.1
     node dist/baton.mjs task create "Bundled-code notices and the npm pack check" --parent bt-jx6 -p 2 --spec skills --check "npm run check" --labels "check:npm run check:pack" --deps blocks:bt-jx6.4,blocks:bt-jx6.11
     node dist/baton.mjs task create "Benchmark core: per-task pairing, sign test, gate" --parent bt-jx6 -p 2 --spec measurement --check "npm run check" --deps blocks:bt-jx6.1
     node dist/baton.mjs task create "baton bench and the synthetic fixtures" --parent bt-jx6 -p 2 --spec measurement --check "npm run check" --deps blocks:bt-jx6.3,blocks:bt-jx6.13
     node dist/baton.mjs task create "Phase 3 docs: contract, hook wiring, roadmap, README, metrics" --parent bt-jx6 -p 3 --spec hooks,skills,measurement --check "npm run check" --deps blocks:bt-jx6.4,blocks:bt-jx6.9,blocks:bt-jx6.10,blocks:bt-jx6.12,blocks:bt-jx6.14
     node dist/baton.mjs task create "Stamp Phase 3 sections and regenerate STATE.md" --parent bt-jx6 -p 3 --spec context-format --check "npm run check" --deps blocks:bt-jx6.15
     ```
  4. If any printed id differed, record the mapping: `node dist/baton.mjs task comment bt-jx6 "Phase 3 plan ids: plan bt-jx6.1 = <printed>, …"`.
  5. Claim: `node dist/baton.mjs task update bt-jx6.1 --claim`.
- [ ] **Step 2: Update the implementation notes, §2 (Claude Code plugins).**
  1. Replace the "Local testing:" bullet with: "Local testing: `claude --plugin-dir ./plugin` (the local build) and `claude plugin validate ./plugin [--strict]`. The repo's own marketplace is `baton` (`/plugin marketplace add ./`, then `/plugin install baton@baton`); its entry installs the npm release, not the local build (ADR 0025). ✅"
  2. After the "Marketplace:" bullet, add these bullets, in this order:
     - "**Plugin sources** ([marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference), read 2026-10-23) ✅: an entry's `source` is a `./` path inside the marketplace, or an object of type `github`, `url`, `git-subdir`, `npm` (`package`, `version`, `registry`), `archive` or `command`. An `npm` source is fetched with the user's npm client without install scripts, and dependencies are installed only when the package ships a lockfile. Relative paths resolve only when the marketplace itself came from `github`, `git`, `file` or `directory`. The marketplace names `npm`, `github`, `gh` and the official names are reserved; `baton` is free. → ADR 0025"
     - "A git checkout of this repo has no `plugin/dist/` (it is git-ignored), so an entry with source `./plugin` in a GitHub-hosted marketplace would install hooks whose bundle is missing. 🟡 inferred from the source rules above. → the public entry uses the `npm` source (ADR 0025)"
     - "**Manifest paths** ([manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference), read 2026-10-23) ✅: `skills` adds directories to the default `skills/` scan; `hooks` files merge with `hooks/hooks.json`; every component path starts with `./` and must stay inside the plugin root. `${CLAUDE_PLUGIN_ROOT}` is the installed version's absolute path, substituted with forward slashes on Windows. Plugin names that start with `claude-` or equal `claude` or `anthropic` are rejected. → the package root's `.claude-plugin/plugin.json` points `skills` and `hooks` into `./plugin/` (ADR 0025)"
- [ ] **Step 3: Rewrite §5 (Codex CLI and Gemini CLI).** Replace the two bullets that start `**Codex hooks**` and `**Gemini CLI hooks**` with the three nested bullets below. Keep the `**AGENTS.md:**` bullet and append to it: " Gemini's `context.fileName` takes a string or a list of strings. 🟡 (list form from the settings docs, not re-read 2026-10-23) → ADR 0024".
  - "**Codex hooks** ([docs](https://learn.chatgpt.com/docs/hooks.md), read 2026-10-23):
    - Locations: `~/.codex/hooks.json`, `~/.codex/config.toml`, `<repo>/.codex/hooks.json` and `<repo>/.codex/config.toml`; plugins can bundle `hooks/hooks.json` and get `PLUGIN_ROOT` (plus `CLAUDE_PLUGIN_ROOT` for compatibility). Hooks are on by default; `[features] hooks = false` turns them off. ✅ Whether a `CODEX_HOME` variable moves the user folder: ❓ (not in the hooks docs) → baton honours it for `--scope user` and falls back to `~/.codex`.
    - Shape: event → matcher groups `{matcher, hooks: [...]}` → handlers `{type: "command", command, timeout, statusMessage?, additionalContextLimit?, commandWindows?}`. `command` is a string; no exec-form `args` is documented. ✅ Whether `command` runs through a shell, and which shell on Windows: ❓ (the examples use `$(…)`).
    - `timeout` is in seconds, default 600; SessionEnd and Interrupt default to 1 s and allow at most 3 s. ✅
    - Matchers are regexes; the docs do not say whether they are anchored (examples use both `^apply_patch$` and `Edit|Write`). 🟡 → baton writes anchored patterns. Stop, UserPromptSubmit and Interrupt ignore matchers. ✅
    - Events: SessionStart (`source` `startup|resume|clear|compact|fork`), PreCompact and PostCompact (`trigger` `manual|auto`), SessionEnd (`reason`, only `other` today), PreToolUse, PostToolUse, PermissionRequest, UserPromptSubmit, SubagentStart, SubagentStop, Stop, Interrupt. ✅
    - Tools: the shell matches as `Bash`, and unified exec (`exec_command`) also matches as `Bash`; patches match as `apply_patch`, `Edit` or `Write` but are reported as `tool_name: "apply_patch"`. `Bash` and `apply_patch` both carry `tool_input.command` (for `apply_patch`, the patch text). ✅ The `tool_name` and `tool_input` fields reported for `exec_command`: ❓ → baton treats `exec_command` as a shell tool and reads `command` or `cmd`.
    - stdin: `session_id`, `transcript_path`, `cwd`, `hook_event_name` and `model`; tool events add `turn_id`, `tool_name`, `tool_use_id`, `tool_input` (and `tool_response` after the call); Stop adds `stop_hook_active` and `last_assistant_message`. ✅
    - Output: SessionStart takes `hookSpecificOutput.additionalContext`, or plain stdout as developer context; PreToolUse denies with `hookSpecificOutput.permissionDecision: "deny"` and `permissionDecisionReason` (legacy `decision: "block"` and exit 2 also work; `ask` is not supported yet). ✅ Whether PreToolUse accepts `hookSpecificOutput.additionalContext` without a decision: ❓ → baton sends no preflight context under Codex until `bt-jx6.19` observes it.
    - What Codex does when a PreToolUse command fails (exit 127 or 9009 because `baton` is not on PATH, a timeout, or stdout that is not JSON): ❓. Only exit 2 is documented as blocking, so a failure probably lets the tool run, which is baton's fail-open intent; `bt-jx6.19` checks it.
    - SessionStart context larger than the handler's `additionalContextLimit` (default 2,500 tokens) is saved to a file, and the model sees a head-and-tail preview with the path. ✅ → baton sets 4000, which covers a 10,000-character packet at 2.5 characters per token.
    - Trust: non-managed hooks run only after review in `/hooks`; project hooks load only when the project `.codex/` layer is trusted; trust is recorded against each hook's hash, so a changed hook needs review again. ✅"
  - "**Gemini CLI hooks** ([reference](https://geminicli.com/docs/hooks/reference/), [overview](https://geminicli.com/docs/hooks/), read 2026-10-23):
    - Settings layers, highest first: project `.gemini/settings.json`, user `~/.gemini/settings.json`, system `/etc/gemini-cli/settings.json`, extensions. ✅ Whether `settings.json` may contain comments: ❓ → baton parses strict JSON and refuses a file it cannot parse, saying comments are not supported.
    - Shape: `hooks.<Event>: [{matcher?, sequential?, hooks: [{type: "command", command, name?, timeout?, description?}]}]`. `command` is a shell command; there is no `args` field. ✅ The shell used on Windows: ❓
    - `timeout` is in milliseconds, default 60000. ✅
    - Events: SessionStart, SessionEnd, BeforeTool, AfterTool, BeforeAgent, AfterAgent, BeforeModel, BeforeToolSelection, AfterModel, Notification, PreCompress. ✅ SessionStart's `source` is `startup`, `resume` or `clear`: there is no `compact` source, so the packet is not re-injected after PreCompress. ✅
    - Matchers: tool events take regexes (`read_.*`); lifecycle matchers are exact strings. ✅ → baton anchors tool matchers and gives lifecycle events no matcher.
    - stdin: `session_id`, `transcript_path`, `cwd`, `hook_event_name` and `timestamp`; BeforeTool adds `tool_name` and `tool_input` (the model's raw arguments). ✅ The argument names of `write_file`, `replace` and `run_shell_command` are not in the reference: ❓ → baton reads `file_path`, `absolute_path` or `path`, `content`, `old_string`/`new_string` and `command`.
    - Output: on exit 0 stdout is parsed as JSON and must hold only that JSON; exit 2 blocks with stderr as the reason; other codes are warnings. BeforeTool denies with `decision: "deny"` (alias `block`) and a required `reason`, which reaches the agent as a tool error. SessionStart's `hookSpecificOutput.additionalContext` is injected as the first turn. ✅ → baton prints `{}` for a no-op under Gemini. Whether BeforeTool accepts `hookSpecificOutput.additionalContext`: ❓ → baton sends no preflight context under Gemini until `bt-jx6.20` observes it.
    - Enablement: no master setting is documented; `/hooks enable-all`, `/hooks disable-all` and per-hook toggles exist. Project hooks are fingerprinted by name and command, and a new or changed one is announced before it runs. ✅
    - Environment: hooks run with a sanitized environment that includes `GEMINI_PROJECT_DIR`, `GEMINI_SESSION_ID`, `GEMINI_CWD` and `CLAUDE_PROJECT_DIR`. ✅ Whether `PATH` survives the sanitizing: ❓ (baton's project hooks call `baton` from PATH; `bt-jx6.20` checks it).
    - The reference says Gemini CLI was replaced by Antigravity CLI for unpaid-tier and Google One users on 2026-06-18. ✅ Antigravity CLI is not covered here. ❓"
  - "**Running `baton` from a hook shell on Windows** (both harnesses), all ❓ until the live checks:
    - npm installs `baton.cmd` and `baton.ps1` side by side. If a harness runs hooks through PowerShell, `baton` may resolve to `baton.ps1`, which Windows 11 Home's default execution policy (Restricted) refuses to run. `npm run smoke:hooks` runs informational PowerShell rows.
    - `cmd.exe` looks in the current directory before PATH, so a hook command `baton …` run in an untrusted repo could start that repo's own `baton.cmd`. For a project-scope config that is the repo's own choice (and the harness asks you to trust it); for `--scope user`, baton writes an absolute `node "<bundle>"` command instead (ADR 0024).
    - Handoff reads tool calls only from Claude Code transcripts. A Codex or Gemini `transcript_path` parses to no tool calls, and without one the handoff falls back to the newest Claude Code transcript of the project, which may belong to another session."
- [ ] **Step 4: Extend §6 (MCP).** Append these bullets:
  - "`InMemoryTransport.createLinkedPair()` is exported by `@modelcontextprotocol/server` 2.3.1. An `McpServer` connected to one end answers `initialize` (protocol `2025-06-18`), `tools/list` (JSON Schema 2020-12 input schemas) and `tools/call` from a hand-written JSON-RPC client on the other end. Argument validation failures come back as `isError: true` results whose text starts `Input validation error:`; an unknown tool is JSON-RPC error -32602. `LATEST_PROTOCOL_VERSION` is `2025-11-25`. 🟡 observed 2026-10-23 with a probe against the installed package. The client package (`@modelcontextprotocol/client`) is not installed, so tests use the in-memory pair with a small client. → ADR 0023"
  - "`serveStdio(factory, { transport? })` defaults to `legacy: "serve"`, which serves a 2025-era `initialize` opening from the same factory; `StdioServerTransport(stdin?, stdout?)` takes any streams. 🟡 from the package type declarations; the stdio test in `test/mcp.test.ts` observes it."
  - "On Windows, an MCP client that starts `baton mcp` without a shell may not find `baton.cmd` and need command `cmd` with args `["/c", "baton", "mcp"]`. ❓ (`bt-jx6.22` checks it)"
- [ ] **Step 5: Add §11 at the end of the file:**
  ```markdown
  ## 11. npm packaging

  - `npm pack --dry-run --json` (npm 11.6.4) lists every packed file with its size, plus `size` (packed) and `unpackedSize`, and writes no tarball. On 2026-10-23 the package was 1.53 MB packed and 7.8 MB unpacked, mostly source maps and the duplicate `plugin/dist/`. 🟡 observed. → ADR 0025
  - The bundle (`noExternal: [/.*/]` in `tsup.config.ts`) holds the installed packages `@modelcontextprotocol/server` and `@modelcontextprotocol/core` (Apache-2.0, with MIT for contributions not yet relicensed), `zod` (MIT), `commander` (MIT) and `yaml` (ISC). 🟡 from `npm ls --omit=dev` on 2026-10-23; the build metafile is the authority (ADR 0025).
  - The SDK's own `dist/` is pre-bundled. It inlines the SDK's internal `@modelcontextprotocol/core-internal` and six packages that are not installed in `node_modules`: `ajv` 8.18.0, `ajv-formats` 3.0.1, `fast-deep-equal` 3.1.3, `json-schema-traverse` 1.0.0, `content-type` 1.0.5 (all MIT) and `fast-uri` 3.1.0 (BSD-3-Clause). They appear only in the `sources` of `dist/*.mjs.map`, under `node_modules/.pnpm/<pnpm segment>/node_modules/<name>/`, where the segment is `<name>@<version>` optionally followed by peer suffixes (`ajv-formats@3.0.1_ajv@8.18.0`), with a scoped name's `/` written as `+`. 🟡 observed 2026-10-23 in the current build's source maps. Their license texts in THIRD_PARTY_NOTICES.md are reconstructed from the SPDX license and the upstream copyright line, not copied from the packages: 🟡 until `bt-jx6.25` confirms them.
  - tsup 9 writes the esbuild metafile to `<outDir>/metafile-<format>.json` when `metafile: true` is set. ✅ (`node_modules/tsup/dist/index.js`)
  ```
- [ ] **Step 6: Append to `.context/knowledge/harness-limits.md`** (four bullets at the end; frontmatter and existing bullets unchanged; no word "commander"):
  - "Codex: SessionStart context over 2,500 tokens becomes a file path plus a preview unless the handler sets `additionalContextLimit`; baton sets 4000."
  - "Codex and Gemini CLI matchers are regexes: anchor them, as in `^(Bash|apply_patch)$`. Gemini compares lifecycle matchers as exact strings, so baton gives those none."
  - "Gemini CLI parses hook stdout as JSON only; a baton no-op prints `{}` there."
  - "Codex sends the apply_patch text in `tool_input.command`."
- [ ] **Step 7: Create `.npmrc`** at the repo root with the single line `update-notifier=false` (LF, final newline).
- [ ] **Step 8: Verify.** `npm run check`. Expected: PASS.
- [ ] **Step 9: Commit.** Leave `bt-jx6.1` in progress; Task 3 closes it.
  ```bash
  git add .npmrc docs/superpowers/plans/2026-10-23-phase3-reach.md docs/research/2026-10-16-implementation-notes.md .context/knowledge/harness-limits.md .context/tasks.jsonl
  git commit -m "docs: Phase 3 plan, harness facts and task items" -- .npmrc docs/superpowers/plans/2026-10-23-phase3-reach.md docs/research/2026-10-16-implementation-notes.md .context/knowledge/harness-limits.md .context/tasks.jsonl
  ```

---

### Task 2: ADRs 0023–0024 through `baton decide`

Item `bt-jx6.1` (claimed in Task 1). Both records go propose → fill → accept, as in P2 Task 14.

**Files:**
- Create via the CLI: `.context/decisions/0023-mcp-adapter-four-read-only-tools-over-core-served-on-stdio.md`, `.context/decisions/0024-codex-and-gemini-cli-hook-config-written-by-init.md` (use the paths `decide` prints; slugs are cut at 60 characters)
- Read first: `.context/decisions/0022-*` (a record made this way), `.context/decisions/0008-hooks-exec-form-fail-open.md`, `.context/decisions/0011-skills-call-a-globally-installed-baton.md`, implementation notes §5–§6 (Task 1)

**Interfaces:**
- Consumes (P2 Task 5): `node dist/baton.mjs decide "<title>" --spec <ids> --paths <globs> --deciders <names>` creates a proposed record, prints `created ADR NNNN (proposed): <file>`, a preflight report, and `next: replace the {…} placeholders in the body, then run baton decide --accept NNNN`. Creation never fails on a constraint. The placeholders (P2 Task 3) are `{Context: the problem, and why a decision is needed now.}`, two `* {Considered option}` bullets, `{Chosen option and why.}`, `* Good, because {…}` and `* Bad, because {…}`. `decide --accept NNNN` refuses (exit 2) while placeholders remain, then sets `status: accepted` and stamps `verified_at`.
- Produces: `adr-0023`, `adr-0024`.

Rules for filling: replace **only** the placeholders, with the edit tools; never touch the frontmatter or "More Information". Inline-code paths in the bodies must be real repo paths or paths this plan creates (`drift` checks them; they all exist by Task 18). Paths that live in a *user's* project or home, never in this repo, are written with a placeholder (`<project>/.codex/hooks.json`), which `drift`'s extractor skips; otherwise they would be dead references by construction.

- [ ] **Step 1: Create ADR 0023.**
  ```bash
  node dist/baton.mjs decide "MCP adapter: four read-only tools over core, served on stdio" --spec hooks --paths "src/mcp/**,src/commands/mcp.ts,src/core/search.ts,src/commands/search.ts,scripts/bundle-check.mjs" --deciders maintainer
  ```
  Expected: `created ADR 0023 (proposed): …`. If the number differs, use the printed one here and in Step 3.
- [ ] **Step 2: Fill ADR 0023.**
  - Context → "Principle 5 in `docs/design/architecture.md` says hooks enforce, skills guide and the MCP only exposes queries; the CLI is the one writer of state. The research report sketched four tools (mission, decide, verify, search), but `decide` records a decision and `verify` closes a task, and `verify` also runs check commands for minutes under a client's tool-call timeout. Every tool definition costs input tokens in each session where the adapter is configured. `src/mcp/server.ts` held four stubs."
  - Considered Options → three bullets: `* Four read-only tools: mission, preflight, drift and search`, `* The research report's mission, decide, verify and search, with decide and verify writing state`, `* No MCP adapter, only the CLI and skills`.
  - Decision Outcome → `Chosen option: "Four read-only tools: mission, preflight, drift and search", because principle 5 keeps one write path, a query cannot leave state half-written, and each tool mirrors a CLI command, so skills and the adapter agree.` followed by these bullets:
    - "`mission` (`budget`, `task`): the packet from `buildMission`. It does not write the packet cache."
    - "`preflight` (`title`, `paths`, `spec`, `supersedes`): `decide --preflight` as a query. It records nothing, and ends with the `baton decide` command that records a decision. A related section that is stale, unverified or superseded is listed with its title withheld."
    - "`drift`: the text report of `baton drift`. It does not append to the drift log."
    - "`search` (`query`, `limit`): full-text search over the section index, also available as `baton search`. A hit in a stale, unverified or superseded section shows its id, location and reason, never its title or text, so nothing the packet withholds reaches the model through the adapter."
    - "Writes stay CLI commands: `baton decide`, `baton verify`, `baton task`. Each tool has a one-line description."
    - "Transport: stdio, `baton mcp [--root <dir>]`, served by the SDK's `serveStdio`. The project root is `--root`, else the nearest project above the server's working directory. In a project without `.context/`, each tool returns an error result."
    - "Errors are tool results with `isError`, never a crash; the server keeps serving. An unexpected error also writes its stack to stderr, which MCP clients keep apart from the protocol on stdout."
    - "The SDK stays in a lazily imported chunk. `scripts/bundle-check.mjs` fails the build when the hook path or the entry's static imports can reach it."
    - "Tests run the server in process over the SDK's in-memory transport with a minimal JSON-RPC client, because the SDK's client package is not a dependency. No network is involved."
    - "The plugin ships no MCP config: the adapter stays opt-in."
  - Consequences → `* Good, because the adapter cannot bypass the checks of verify or the append-only rules of decide, and it works in harnesses without hooks.`, `* Bad, because agents still need a shell to record a decision or close a task.` and `* Bad, because roadmap question 3 (whether search is worth its tokens) stays open until the A/B benchmark measures the tool-definition cost.`
- [ ] **Step 3: Accept it.** `node dist/baton.mjs decide --accept 23`. Expected: `accepted ADR 0023: <file>`. If it refuses because of placeholders, finish Step 2.
- [ ] **Step 4: Create ADR 0024.**
  ```bash
  node dist/baton.mjs decide "Codex and Gemini CLI hook config written by init" --spec hooks,skills --paths "src/core/harness.ts,src/core/init.ts,src/commands/init.ts,src/hooks/guards.ts,src/hooks/io.ts,scripts/embed-templates.mjs" --deciders maintainer
  ```
  Expected: the preflight lists ADR 0008 under `CONSTRAINS` (spec `hooks`), together with the other accepted hooks records (such as ADRs 0015, 0020, 0021 and 0023). This record amends nothing in them: it does **not** supersede ADR 0008, which keeps governing Claude Code; the Context below says how the two fit together. Do not pass `--supersedes`.
- [ ] **Step 5: Fill ADR 0024.**
  - Context → "The hook wiring table in `docs/design/architecture.md` lists Codex and Gemini CLI equivalents, and ADR 0017 made `init --harness codex|gemini` exit 3 until Phase 3. Implementation notes §5 (read 2026-10-23): both harnesses take an event → matcher group → handler shape whose `command` is a shell string with no documented exec form; their matchers are regexes; Codex timeouts are seconds (SessionEnd at most 3) and Gemini's milliseconds; Codex runs project hooks only once trusted, and Gemini fingerprints them; Codex replaces SessionStart context over 2,500 tokens with a preview unless `additionalContextLimit` is raised; Gemini parses stdout as JSON only. ADR 0022 left Gemini's AGENTS.md wiring to init. ADR 0008 still holds for Claude Code: its hooks run exec-form `node` with no shell, and its matchers are plain `A|B|C` lists, because Claude Code treats a letters-only matcher as an exact list. Codex and Gemini offer neither: they have no exec form, and every matcher is a regex. For them a shell command string is the only form, and an anchored pattern is the equivalent safeguard against unanchored matching. The fail-open rule of ADR 0008 applies unchanged."
  - Considered Options → `* Project files that call baton from PATH, with an opt-in user scope that calls node with an absolute bundle path`, `* User files only, calling node with the absolute path of the bundle that ran init`, `* Inline tables in the harnesses' TOML config`.
  - Decision Outcome → `Chosen option: "Project files that call baton from PATH, with an opt-in user scope that calls node with an absolute bundle path", because a project file works on every machine and for every teammate, both harnesses document it, skills and MCP config already call the global binary (ADR 0011), and a per-machine user file can name the bundle directly.` followed by these bullets:
    - "Codex, in `<project>/.codex/hooks.json`: SessionStart (timeout 10, `additionalContextLimit: 4000`), PreCompact (30), SessionEnd (3) and PreToolUse on `^(Bash|apply_patch)$` (5)."
    - "Gemini CLI, in `<project>/.gemini/settings.json`: SessionStart (10000 ms), PreCompress (30000), SessionEnd (10000) and BeforeTool on `^(write_file|replace|run_shell_command)$` (5000), each handler named `baton-<event>`."
    - "Project handlers run `baton hook <event> --harness codex` or `--harness gemini`. Tool matchers are anchored regexes; lifecycle events get no matcher, because Gemini compares lifecycle matchers as exact strings."
    - "`--scope user` writes the same events to `<home>/.codex/hooks.json` (or `<CODEX_HOME>/hooks.json`) and `<home>/.gemini/settings.json`, where `BATON_HOME` overrides the home folder as for explain templates. Its handlers run `node "<bundle>" hook <event> --harness <h>` with the absolute, forward-slash path of the bundle that ran init: a per-machine file needs no PATH, and a repo cannot plant its own `baton.cmd` in front of it (Windows `cmd.exe` searches the current folder first). init warns when the other scope already has baton handlers, since each event would then run twice."
    - "Skills always go to the project's `<project>/.agents/skills/<name>/SKILL.md`, which both harnesses discover, also with `--scope user`. The skills are embedded in the bundle like the templates (ADR 0017)."
    - "Merging: init keeps every other key, group and handler of an existing file, and appends a baton group for each event that has no baton handler yet. A baton handler is one whose command runs `baton hook` (bare, or as `baton.mjs`). Only `--refresh-harness` rewrites baton handlers and the skill copies; `--force` keeps its ADR 0017 meaning and never touches harness files. Unparseable JSON (including JSON with comments), or a `hooks` value that is not an object, exits 1 before anything is written. Files are written as two-space JSON with LF endings."
    - "Gemini's `context.fileName` gains `AGENTS.md` (a new file gets `["AGENTS.md", "GEMINI.md"]`), so Gemini reads the compiled router."
    - "Hook I/O: the guards read Codex's patch text from `tool_input.command`, and treat `exec_command` as a shell tool. Under Gemini, a no-op hook prints `{}`. Pre-tool preflight context is not sent under Codex or Gemini until a live session shows they accept `additionalContext` there; denies are sent."
    - "PostToolUse/AfterTool and Stop/AfterAgent are not wired until their output handling is observed in live sessions."
    - "Fallbacks, named now. If PowerShell resolves `baton` to the `baton.ps1` shim and the execution policy refuses it, or if pre-tool-use misses 150 ms through the shell and the shim (the exec-form baseline is already 144 ms, implementation notes §1), the remedy is the user-scope form, whose absolute `node` command skips both, and for Codex a `commandWindows` entry. Changing the project-scope command form needs a superseding record."
  - Consequences → `* Good, because one set of handlers serves three harnesses, and a team commits one config.`, `* Bad, because project hooks need a global baton (npm install -g baton-ctx); without it the harness reports a failing hook command and nothing is enforced.`, `* Bad, because the formats come from documentation, not live sessions; each fact stays marked in the implementation notes until a live check observes it.`, `* Bad, because a shell plus the npm command shim may push pre-tool-use past 150 ms on Windows; npm run smoke:hooks measures it.` and `* Bad, because the handoff reads tool calls only from Claude Code transcripts, so a Codex or Gemini handoff lists none, or falls back to the newest Claude Code transcript of the project.`
- [ ] **Step 6: Accept it.** `node dist/baton.mjs decide --accept 24`.
- [ ] **Step 7: Verify.** `npm run check` and `node dist/baton.mjs decide` (it lists 0001–0024, with 0023 and 0024 accepted). Expected: PASS.
- [ ] **Step 8: Commit.**
  ```bash
  git add .context/decisions/0023-* .context/decisions/0024-* .context/tasks.jsonl
  git commit -m "docs: ADRs 0023-0024 (MCP adapter, Codex and Gemini hooks) via decide" -- .context/decisions/0023-* .context/decisions/0024-* .context/tasks.jsonl
  ```

---

### Task 3: ADRs 0025–0026, human tasks out of the packet, and the follow-ups

Item `bt-jx6.1` (claimed in Task 1). This task closes it. The follow-ups for people are created last, once a `human` label keeps them out of the packet and the claim queue.

**Files:**
- Create via the CLI: `.context/decisions/0025-publish-baton-ctx-as-one-bundled-package-and-plugin-root.md`, `.context/decisions/0026-paired-a-b-benchmark-over-session-transcripts.md` (use the printed paths)
- Modify: `src/core/tasks/snapshot.ts` (P1 Task 8), `src/core/tasks/native/service.ts` (`ReadyFilter` and `ready` only), `src/commands/task.ts` (`formatIssueLine`, and the `ready` and `update` actions only)
- Test: `test/human-tasks.test.ts`
- Task store, through the CLI only → `.context/tasks.jsonl` (items `bt-jx6.17`–`bt-jx6.25`)
- Read first: `.context/decisions/0002-typescript-node-single-package.md`, `.context/decisions/0014-mission-packet-assembly.md`, `.context/decisions/0016-stats-metric-definitions-and-snapshots.md`, `docs/design/metrics.md`, implementation notes §2, §5 and §11 (Task 1), `src/core/tasks/snapshot.ts`, `src/core/tasks/native/service.ts`, `src/commands/task.ts`

**Interfaces:**
- Consumes:
  - The `decide` flow restated in Task 2.
  - P1 Task 8 (`src/core/tasks/snapshot.ts`, landed): `readTaskSnapshot(root, config, { readyLimit, closedLimit })` opens the native store with actor `baton-read`; `inProgress = service.list({ status: ["in_progress"] })` without epics; `ready = service.ready({ limit: READY_FETCH_LIMIT /* 200 */ })` without epics, cut to `readyLimit`; `blocked` maps `service.blocked()`. `mission` (P1 Task 10) builds its task block from `inProgress` and `ready`; `handoff` (P1 Task 12) renders STATE's In progress, Ready next and Blocked lists from them.
  - `src/core/tasks/native/service.ts` (landed): `interface ReadyFilter { limit?; sort?; labels?; assignee?; unassigned?; parent?; includeDeferred?; now? }`; `ready(f)` builds a `where` list of SQL conditions (each label in `f.labels` adds `i.id IN (SELECT issue_id FROM labels WHERE label = ?)`); `claimNext(f)` claims the first of `ready({ ...f, unassigned: true })`. `Issue.labels: string[]`.
  - `src/commands/task.ts` (landed): `task ready [-n] [--sort] [-l] [--parent] [--unassigned] [--include-deferred] [--claim] [--json]` builds a `ReadyFilter` and calls `s.claimNext(f)` with `--claim`, else `s.ready(f)`, printing each issue with `formatIssueLine`; with nothing to claim it throws `BatonError("nothing ready to claim", ExitCode.Blocked)`. `export function formatIssueLine(i: Issue): string` returns `` `${id.padEnd(12)} P${priority}  ${status.padEnd(11)} ${issueType.padEnd(8)} ${title}${who}${labels}` ``, where `labels` is `  [<labels joined ", ">]` when there are any. `task update <id> [--title …] … [--add-labels] [--remove-labels] [--claim] [--json]` calls `s.claim(id)` when `--claim` is set; it has no `--force` today.
  - Test helpers: `makeRepo`, `CONTEXT_FIXTURE` (P1 Task 3), `withService(root, actor, fn)` (P1 Task 8), `runCli` (P1 Task 6); `buildMission` (P1 Task 10); `loadConfig`.
- Produces:
  ```ts
  // src/core/tasks/snapshot.ts
  export const HUMAN_LABEL = "human";
  //   inProgress, ready and blocked leave out issues whose labels include HUMAN_LABEL
  // src/core/tasks/native/service.ts
  export interface ReadyFilter { /* existing fields */ excludeLabels?: string[] }
  //   each label adds the condition: i.id NOT IN (SELECT issue_id FROM labels WHERE label = ?)
  // CLI: task ready --unassigned and task ready --claim pass excludeLabels: [HUMAN_LABEL]; plain task ready does not
  // src/commands/task.ts
  //   formatIssueLine: a human-labelled issue gets "[human] " in front of its title (the label list at the end is unchanged),
  //     so plain `task ready` and `task list` mark them
  //   task update <id> --claim [-f, --force]: refuses an issue labelled human unless --force, before claiming:
  //     BatonError(`${id} is labelled human: it is work for a person, not an agent; pass --force to claim it anyway`, ExitCode.Blocked)
  //     --force description: "claim even a task labelled human"; it changes nothing else about update
  ```
  `adr-0025`, `adr-0026`; items `bt-jx6.17` … `bt-jx6.25`.

- [ ] **Step 1: Create ADR 0025.**
  ```bash
  node dist/baton.mjs decide "Publish baton-ctx as one bundled package and plugin root" --spec skills --paths "package.json,package-lock.json,.claude-plugin/**,plugin/.claude-plugin/plugin.json,THIRD_PARTY_NOTICES.md,CHANGELOG.md,tsup.config.ts,scripts/pack-check.mjs,scripts/third-party.mjs" --deciders maintainer
  ```
  The preflight lists ADR 0002 under `CONSTRAINS` (path `package.json`); this record agrees with it.
- [ ] **Step 2: Fill ADR 0025.**
  - Context → "ADR 0002 names the package `baton-ctx` and bundles everything into one ESM bundle; ADR 0011 needs a global install. `package.json` is marked private and lists the bundled libraries as runtime dependencies, so an install would download code the bundle already contains. The marketplace entry `baton-dev` points at `./plugin`, whose `dist/` folder is git-ignored, so an install from the git repository would have no bundle (implementation notes §2). The bundle contains MIT, ISC, BSD-3-Clause and Apache-2.0 code whose notices must ship with it, including code the MCP SDK vendors inside its own build (§11)."
  - Considered Options → `* A publish-ready package with no runtime dependencies whose root is also the plugin root, and a marketplace entry with an npm source`, `* Keep the dependencies, commit the plugin bundle, and point the marketplace at the git repository`, `* A second npm package for the plugin`.
  - Decision Outcome → `Chosen option: "A publish-ready package with no runtime dependencies whose root is also the plugin root, and a marketplace entry with an npm source", because the published tarball then carries the bundle the hooks run, installs nothing else, and one version number covers the CLI and the plugin.` followed by these bullets:
    - "`private` is removed and `publishConfig.access` is `public`. The version starts at 0.1.0. Publishing (`npm publish`) is a human step, outside the build."
    - "The bundled libraries move to devDependencies. The build metafile must show no external import other than Node built-ins, and a packed and unpacked copy runs `--version`, `init`, a hook and the stdio MCP server, which together prove the bundle is self-contained."
    - "Files: the bundle chunks without source maps, `.claude-plugin/plugin.json`, `plugin/hooks/hooks.json`, `plugin/skills/`, `CHANGELOG.md` and `THIRD_PARTY_NOTICES.md` (npm adds the README, LICENSE and `package.json`). `scripts/pack-check.mjs` checks the exact list and caps the size at 900 KB packed and 3.5 MB unpacked."
    - "Plugin root: a second manifest at the package root, `.claude-plugin/plugin.json`, points `skills` and `hooks` into `./plugin/`, so the hooks' `${CLAUDE_PLUGIN_ROOT}/dist/baton.mjs` resolves to the package's own bundle. `plugin/.claude-plugin/plugin.json` stays for `claude --plugin-dir ./plugin`. Both manifests carry the package version, and a test compares them."
    - "Marketplace: `.claude-plugin/marketplace.json` becomes the marketplace `baton`, with one entry whose source is the npm package `baton-ctx` at `^<version>`. Local development uses `--plugin-dir ./plugin`."
    - "Notices: `THIRD_PARTY_NOTICES.md` lists every package in the bundle with its license text: the installed packages found in the build metafile, and the packages the MCP SDK vendors in its own `dist/` (ajv and five more), found through the source maps and described by a pinned table in `scripts/third-party.mjs`. CI fails when a bundled package is missing from the notices."
    - "`CHANGELOG.md` follows Keep a Changelog."
  - Consequences → `* Good, because installing baton is one package with no dependency tree, and the plugin and the CLI never disagree on a version.`, `* Bad, because users get no npm audit advisories for bundled code, so a security fix in a bundled library needs a baton release.`, `* Bad, because the vendored license texts are reconstructed until a person checks them against upstream.` and `* Bad, because two plugin manifests must stay in sync.`
- [ ] **Step 3: Accept it.** `node dist/baton.mjs decide --accept 25`.
- [ ] **Step 4: Create ADR 0026.**
  ```bash
  node dist/baton.mjs decide "Paired A/B benchmark over session transcripts" --spec measurement,tasks --paths "src/core/bench.ts,src/commands/bench.ts,scripts/bench-synth.mjs,bench/**,src/core/tasks/snapshot.ts" --deciders maintainer
  ```
  Expected: the preflight lists ADR 0009 (spec `tasks`, path `src/core/tasks/**`) and ADR 0014 (spec `tasks`, path `src/core/tasks/snapshot.ts`) under `CONSTRAINS`, with ADR 0016 (spec `measurement`) and the other accepted `tasks` records (such as ADR 0019); creation never fails on them. This record amends none of them: it adds the `human` label to the store of ADR 0009 and leaves those tasks out of the packet blocks of ADR 0014, and it reads the metrics of ADR 0016. Do not pass `--supersedes`.
- [ ] **Step 5: Fill ADR 0026.**
  - Context → "`docs/design/metrics.md` defines five metrics and a paired A/B method: the same task set with and without baton, several runs each, a sign test on output quality, and baton's own overhead counted against the savings. It does not say what 'without baton' means. A real run needs live agent sessions, which the build cannot start. ADR 0016 defines how each metric is read from a Claude Code transcript, counting only `.context/` reads as documentation, which a project without baton does not have. The gate run itself is work for a person, and ADR 0014's packet would offer it to agents as ready work."
  - Considered Options → `* A replay harness over recorded transcripts listed in a manifest, with exact sign tests over tasks, run on synthetic fixtures until real sessions exist`, `* A script that drives live agent sessions`, `* A static estimate of the characters loaded at session start, with and without baton`.
  - Decision Outcome → `Chosen option: "A replay harness over recorded transcripts listed in a manifest, with exact sign tests over tasks, run on synthetic fixtures until real sessions exist", because it reuses the stats definitions, runs offline and the same on every machine, and the same command later scores the real sessions.` followed by these bullets:
    - "The baseline arm is the same repo at the commit before `baton init`, with the baton plugin disabled: the pre-baton docs setup, whatever README, CLAUDE.md and docs it had. The baton arm runs the same task after `baton init`, with the plugin enabled."
    - "`baton bench <dir>` reads `<dir>/bench.json`: the tasks; per run its arm (`baseline` or `baton`), run number, transcript path, an optional quality score from 0 to 1 and an optional `root` (the clone or worktree it ran in); and `docs`, the globs whose reads count as documentation in both arms (default `.context/**`)."
    - "Pairs are tasks. For each task with runs in both arms, each metric takes the median over that arm's runs. The report gives, per metric, the median of those per-task medians in each arm, the change in percent, better, worse and tied tasks, and a two-sided exact sign test over tasks. The metrics are tokens at session start, doc tokens (estimate, ADR 0016 with the `docs` globs), corrections, seconds to first edit and output quality. Drift caught is not part of the A/B; `baton stats` reports it."
    - "Gate, from the spec's purpose and the roadmap: pass when the median tokens at session start fall by at least 30%, the mean corrections per session fall, and quality is scored and not significantly worse (sign test, p < 0.05). Fewer than 6 paired tasks, or no quality scores, is insufficient data. The stop rule of `docs/design/metrics.md` is printed next to it."
    - "Overhead: the packet's characters, the SessionStart hook output and the MCP tool definitions (from an in-process tools/list) are reported with every run."
    - "Output: `<out>/report.json` and `<out>/report.md`, by default under the git-ignored `.context/.cache/bench/<name>/`. Nothing is uploaded."
    - "Fixtures: `bench/synthetic/` is generated by `scripts/bench-synth.mjs` from a fixed seed and follows the baseline definition above; a test regenerates it byte for byte. Every report on it says it validates the harness, not baton, and its gate status reads `(synthetic)`."
    - "The real benchmark (recording the sessions, then publishing the report) is a human task, and the Phase 3 gate stays open until it is done. Human tasks carry the label `human`: the mission packet, STATE's lists and the claim queue (`baton task ready --unassigned` and `--claim`) leave them out, so an agent never picks one up; plain `baton task ready` still lists them for people, marked `[human]`, and `baton task update <id> --claim` refuses one unless `--force` is given."
  - Consequences → `* Good, because the gate is computed the same way every time, and a fixture run cannot pass for a result.`, `* Bad, because quality needs a score per run from a person or a check command.`, `* Bad, because transcript parsing is specific to Claude Code; Codex and Gemini sessions need readers of their own.` and `* Bad, because a human task is invisible to agents, so a blocked one is noticed only through baton task ready or task list.`
- [ ] **Step 6: Accept it.** `node dist/baton.mjs decide --accept 26`.
- [ ] **Step 7: Write the failing tests** in `test/human-tasks.test.ts`. `BATON_ACTOR = "tester"`; `root = makeRepo()`; inside `withService(root, "tester", s => …)`:
  - `H = s.create({ title: "Publish to the registry", labels: ["human"] })`;
  - `A = s.create({ title: "Write code" })`;
  - `P = s.create({ title: "Measure by hand", labels: ["human"] })`, then `s.claim(P.id)`;
  - `D = s.create({ title: "Later by hand", labels: ["human"], deps: [["blocks", A.id]] })`.

  Then:
  - `snapshot`: `readTaskSnapshot(root, await loadConfig(root), { readyLimit: 5, closedLimit: 0 })` has `ready` ids `[A.id]`, `inProgress` `[]`, and no `blocked` entry for `D`.
  - `service filter`: `s.ready({ excludeLabels: ["human"] })` ids are `[A.id]`; `s.ready({})` contains `H.id`.
  - `packet`: `(await buildMission(root, await loadConfig(root))).text` contains `Write code` and none of `Publish to the registry`, `Measure by hand` or `Later by hand`.
  - `CLI`: `runCli(["task", "ready", "--unassigned"], root)` stdout contains `A.id` and not `H.id`; `task ready` stdout contains `H.id`; `task ready --claim` prints `claimed <A.id>`, and a second `task ready --claim` exits 2 with `nothing ready to claim`, leaving `H` open and unassigned.
  - `tag`: the `task ready` stdout line for `H` contains `[human] Publish to the registry`, and the line for `A` contains `Write code` without `[human]`. `formatIssueLine` on `H` (from `s.get(H.id)`) contains `[human] Publish to the registry` and still ends with `  [human]` (its label list).
  - `claim refusal`: `runCli(["task", "update", H.id, "--claim"], root)` exits 2 with stderr containing `is labelled human` and `--force`, and `H` stays open and unassigned. `task update <H.id> --claim --force` exits 0, and `H` is `in_progress` with assignee `tester`. `task update <A.id> --claim` (no human label) exits 0 without `--force`.
- [ ] **Step 8: Run.** `npx vitest run test/human-tasks.test.ts`. Expected: FAIL.
- [ ] **Step 9: Implement** `HUMAN_LABEL`, `ReadyFilter.excludeLabels`, the snapshot filters (`inProgress` and `blocked` filtered on `issue.labels`; `ready` through `excludeLabels: [HUMAN_LABEL]`) the CLI rule (add `excludeLabels: [HUMAN_LABEL]` to the filter when `--unassigned` or `--claim` is set), the `[human] ` title tag in `formatIssueLine`, and the `--force` option with the claim refusal in `update` (read the issue with `s.get(id)` first; an unknown id keeps today's error). Nothing else changes; `test/task-snapshot.test.ts`, `test/tasks-native.test.ts`, `test/tasks.test.ts`, `test/mission*.test.ts` and `test/handoff.test.ts` still pass.
- [ ] **Step 10: Run.** Expected: PASS. Then `npm run check` and `npm run build`.
- [ ] **Step 11: Create the follow-ups.** Run these one at a time, in order. They are expected to print `bt-jx6.17` to `bt-jx6.25`; if an id differs, substitute the printed one below and record the mapping in a comment on `bt-jx6`. Then: `node dist/baton.mjs task dep add bt-jx6.17 bt-jx6.25`.
  ```bash
  node dist/baton.mjs task create "Publish baton-ctx 0.1.0 to npm" --parent bt-jx6 -t chore -p 2 --spec skills --labels human --deps blocks:bt-jx6.16 -d "Agents: do not claim this task. Human step. Run npm login, then npm view baton-ctx (an E404 means the name is free), then npm run build and npm run check:pack, then npm publish. Afterwards run npm install -g baton-ctx in a fresh shell and check baton --version. Record the published version in a comment, then close with task close."
  node dist/baton.mjs task create "Push the repo and install baton from its marketplace in Claude Code" --parent bt-jx6 -t chore -p 2 --spec hooks,skills --labels human --deps blocks:bt-jx6.17 -d "Agents: do not claim this task. Human step after the npm release. git push, then in Claude Code run /plugin marketplace add NIGHTFURY609/baton and /plugin install baton@baton. Check that a new session shows the baton mission brief and that claude plugin validate passes on the repo root. Optionally submit the plugin to the Anthropic plugin directory. Record the results in implementation notes section 2."
  node dist/baton.mjs task create "Observe the Codex hooks in a live Codex session" --parent bt-jx6 -t chore -p 2 --spec hooks --labels human --deps blocks:bt-jx6.16 -d "Agents: do not claim this task. Human step. Put baton on PATH (npm link in this repo, or the npm release), run baton init --harness codex in a scratch git project, open Codex there, trust the hooks with /hooks, and check: the SessionStart brief arrives, echo x into .context/STATE.md through the shell is denied, an apply_patch on .context/STATE.md is denied, and PreCompact and SessionEnd rewrite STATE.md. Also record: which shell Codex runs hooks in on Windows, the stdin of an exec_command call (tool_name and tool_input fields), what Codex does when the hook command fails (rename baton off PATH, then try a timeout), and whether a PreToolUse additionalContext without a decision reaches the model. Write the results into implementation notes section 5."
  node dist/baton.mjs task create "Observe the Gemini CLI hooks in a live Gemini session" --parent bt-jx6 -t chore -p 2 --spec hooks --labels human --deps blocks:bt-jx6.16 -d "Agents: do not claim this task. Human step. With baton on PATH, run baton init --harness gemini in a scratch git project, start Gemini CLI there, accept the new project hooks, and check: the SessionStart brief arrives, write_file on .context/STATE.md is denied, PreCompress rewrites STATE.md, AGENTS.md is loaded through context.fileName, the no-op output of {} raises no warning, and PATH survives the sanitized hook environment. Also record: which shell Gemini runs hooks in on Windows (and whether baton resolves to the ps1 shim there), the argument names of write_file, replace and run_shell_command in BeforeTool stdin, whether a BeforeTool additionalContext reaches the model, and whether settings.json may hold comments. Write the results into implementation notes section 5."
  node dist/baton.mjs task create "Try the baton skills in Codex and Gemini CLI" --parent bt-jx6 -t chore -p 3 --spec skills --labels human --deps blocks:bt-jx6.16 -d "Agents: do not claim this task. Human step. In the scratch projects of the two live hook checks, confirm that Codex and Gemini CLI list the skills from .agents/skills, and run the baton, checkpoint and handoff skills once each. Note how each harness passes the arguments the baton skill calls ARGUMENTS. Record the results in implementation notes section 3."
  node dist/baton.mjs task create "Register baton mcp in an MCP client and observe the four tools" --parent bt-jx6 -t chore -p 3 --spec hooks --labels human --deps blocks:bt-jx6.16 -d "Agents: do not claim this task. Human step. With baton on PATH, add an MCP server with command baton and args mcp to Claude Code, Codex or Gemini CLI (on Windows, try command cmd with args /c baton mcp if baton alone is not found), then check that tools/list shows mission, preflight, drift and search, and that each answers in a project with .context/. Record the client, the command form that worked, the result and the client tool-call timeout in implementation notes section 6."
  node dist/baton.mjs task create "Run the live paired A/B benchmark and publish it" --parent bt-jx6 -t chore -p 1 --spec measurement --labels human --deps blocks:bt-jx6.16 -d "Agents: do not claim this task. This is the Phase 3 gate and a human measurement. Pick at least 6 tasks. Run each 3 times in the baseline arm, which is the repo at the commit before baton init with the baton plugin disabled (the pre-baton docs setup), and 3 times in the baton arm, after baton init with the plugin enabled, each run in a fresh clone or worktree. Score each run's quality from 0 to 1, list the transcripts, their roots and the docs globs in a bench.json as docs/design/metrics.md describes, and run baton bench on that folder. Review report.md, then publish it with the derived numbers only, never the transcripts. Close by hand with the gate status as the reason."
  node dist/baton.mjs task create "Wire PostToolUse, Stop and pre-tool preflight context for Codex and Gemini once their outputs are observed" --parent bt-jx6 -p 3 --spec hooks --check "npm run check" --deps blocks:bt-jx6.19,blocks:bt-jx6.20
  node dist/baton.mjs task create "Confirm the vendored license texts in THIRD_PARTY_NOTICES.md against upstream" --parent bt-jx6 -t chore -p 2 --spec skills --labels human --deps blocks:bt-jx6.12 -d "Agents: do not claim this task. Human step, needs the network. For ajv, ajv-formats, fast-deep-equal, json-schema-traverse, content-type and fast-uri at the versions listed in the bundled section, compare the license text and copyright line with the LICENSE file each package publishes. Fix any difference in the VENDORED table of scripts/third-party.mjs, run npm run notices, and mark the implementation notes section 11 bullet as confirmed."
  ```
- [ ] **Step 12: Close through `verify`, then commit.** The Task 1–3 commits since the claim, and this task's uncommitted work, are the diff.
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-jx6.1
  git add .context/decisions/0025-* .context/decisions/0026-* src/core/tasks/snapshot.ts src/core/tasks/native/service.ts src/commands/task.ts test/human-tasks.test.ts .context/tasks.jsonl
  git commit -m "feat(tasks): ADRs 0025-0026 via decide, human tasks kept out of the packet and the claim queue" -- .context/decisions/0025-* .context/decisions/0026-* src/core/tasks/snapshot.ts src/core/tasks/native/service.ts src/commands/task.ts test/human-tasks.test.ts .context/tasks.jsonl
  ```

---

### Task 4: `baton search` over the section index

Item `bt-jx6.2`. Claim it first.

**Files:**
- Create: `src/core/search.ts`, `src/commands/search.ts`
- Modify: `src/program.ts` (add `import { registerSearch } from "./commands/search.js";` and call `registerSearch(program)` directly after `registerDrift(program)`; nothing else)
- Test: `test/search.test.ts`
- Read first: `src/core/drift.ts` (`evaluateFreshness`, `renderDriftText`), `src/core/freshness.ts` (`isInjectable`), `src/commands/drift.ts` (command style), ADR 0023

**Interfaces:**
- Consumes:
  ```ts
  // P1 Task 3: src/core/sections.ts
  export type ContextDoc = "rules" | "spec" | "state" | "knowledge" | "decision";
  export interface IndexedSection extends Section { doc: ContextDoc; adr?: AdrInfo }   // Section: { meta: { id, kind, verifiedAt, sourcePaths, supersededBy? }, title, body, file, line }
  export async function loadSectionIndex(root: string, opts?: { lenient?: boolean }): Promise<SectionIndex>;   // { root, sections, byId, problems: { file, message }[] }
  //   whole-file docs (STATE, knowledge, decisions): body = everything after the frontmatter, trimmed, INCLUDING the "# title" line
  // P1 Task 5 (+ P2 Task 10): src/core/drift.ts
  export async function evaluateFreshness(scope: { root: string; sections: readonly IndexedSection[] }, config: Config): Promise<FreshnessReport>;
  //   FreshnessReport { head, sections: SectionFreshness[] (input order), counts }; SectionFreshness { section, result: { level, commitsSince, reason }, deadRefs, commitsOutsideContext, uncommitted? }
  //   reasons seen in tests: "never verified" (unverified), "superseded by adr-0001" (superseded)
  // existing: src/core/freshness.ts
  export function isInjectable(level: FreshnessLevel): boolean;   // fresh | aging
  // P1 Task 6: src/commands/_shared.ts — requireContext(root) (exit 1 without .context/), action(fn); test/helpers/cli.ts — runCli(args, cwd)
  // existing: loadConfig, findProjectRoot, BatonError, ExitCode; commander's Option for --format choices
  ```
  Test helpers: `makeRepo`, `stampFixture`, `commitAll`, `writeFiles`, `makeTempDir`, `runGit`, `CONTEXT_FIXTURE` (P1 Task 3).
- Produces:
  ```ts
  // src/core/search.ts
  export const SEARCH_DEFAULT_LIMIT = 5;
  export const SEARCH_MAX_LIMIT = 20;
  export const SNIPPET_MAX = 160;
  export interface SearchHit {
    id: string; doc: ContextDoc; file: string; line: number;
    title: string | null;                // null unless the level is injectable: a stale title is stale content
    level: FreshnessLevel; reason: string; score: number;
    snippet: string | null;              // null unless the level is injectable
  }
  export interface SearchResult {
    query: string; terms: string[]; searched: number; total: number; limit: number;
    hits: SearchHit[]; problems: string[];
  }
  export function searchTerms(query: string): string[];
  export function countOccurrences(haystack: string, needle: string): number;
  export function scoreSection(s: { meta: { id: string }; title: string; body: string }, terms: readonly string[]): number;
  export function snippetFor(body: string, terms: readonly string[]): string;
  export function parseLimit(value: string | number | undefined): number;
  export async function searchContext(root: string, config: Config, query: string, opts?: { limit?: number }): Promise<SearchResult>;
  export function renderSearchText(r: SearchResult): string;
  // src/commands/search.ts
  export function registerSearch(program: Command): void;
  ```

**Rules (pinned):**
- **`searchTerms(q)`.** `q.toLowerCase().split(/[^\p{L}\p{N}_-]+/u)`, then strip leading and trailing hyphens from each part (`/^-+|-+$/g`), keep parts of length ≥ 2, dedupe in first-appearance order, and keep the first 8. Pure; it returns `[]` when nothing qualifies.
- **`countOccurrences(h, n)`.** `n === ""` → 0; otherwise non-overlapping occurrences, `h.split(n).length - 1`.
- **`scoreSection(s, terms)`.** `head = (s.meta.id + "\n" + s.title).toLowerCase()`, `body = s.body.toLowerCase()`. For each term: `h = countOccurrences(head, t)`, `b = countOccurrences(body, t)`. If `h + b === 0` for any term, return 0 (every term must occur). Otherwise the score is the sum of `3 * h + b`.
- **`snippetFor(body, terms)`.** Lines of `body.split("\n")`, trimmed, dropping empty lines, lines that start with `#` and lines that start with `<!--`. Take the first line whose lowercase form contains any term, else the first remaining line, else `""`. Collapse whitespace runs to one space. Longer than 160 characters → the first 159 characters plus `…`.
- **`parseLimit(v)`.** `undefined` → 5. A number, or a string of digits only, from 1 to 20 → that number. Anything else → `BatonError("limit must be an integer from 1 to 20")` (exit 1).
- **`searchContext(root, config, query, opts)`.**
  1. `terms = searchTerms(query)`; `[]` → `BatonError("search needs a word of at least 2 characters")` (exit 1).
  2. `limit = parseLimit(opts?.limit)`.
  3. `index = await loadSectionIndex(root, { lenient: true })`; `report = await evaluateFreshness(index, config)`.
  4. Score every `report.sections[i].section`; keep scores > 0. Sort by score descending, then by index order (a stable sort).
  5. `total` = the number of matches; `hits` = the first `limit`, each with `level = result.level`, `reason = result.reason`, and, only when `isInjectable(level)`, `title = section.title` and `snippet = snippetFor(body, terms)`; otherwise both are `null`. Matching still looks at the title, but a withheld hit never returns it.
  6. `searched = index.sections.length`; `problems = index.problems.map((p) => p.message)`; `query = query.trim()`.
  7. Reads only: nothing is written.
- **`renderSearchText(r)`,** lines joined with `\n`, no trailing newline:
  - `total === 0`: the single line `no matches for "<query>" in .context/ (<searched> sections searched)`.
  - Otherwise `<total> match(es) for "<query>" in .context/ (<searched> sections searched):`, then per hit two lines:
    - `<id>  <file>:<line>  <level>  <title>` (two spaces between fields), with `(title withheld)` in place of a `null` title;
    - `  <snippet>` when the snippet is set, else `  withheld (<level>): <reason>`.
  - When `total > hits.length`: `<total - hits.length> more match(es) not shown (limit <limit>).`
  - When there are problems: `Problems in .context/ (affected sections skipped): <messages joined "; ">.`
- **Command `search <words...> [--limit <n>] [--format <text|json>]`.** `--format` with choices, default `text`. `root = findProjectRoot()`, `requireContext(root)`, `config = await loadConfig(root)`, `result = await searchContext(root, config, words.join(" "), { limit: parseLimit(o.limit) })`. Print `renderSearchText(result) + "\n"`, or `JSON.stringify(result, null, 2) + "\n"`. Exit 0, also when nothing matched. Description: `full-text search over .context/ sections; stale text is withheld`.

**Expected text** for the stamped fixture and the query `passkeys` (scores: `adr-0001` 5, `auth` 1):
```text
2 match(es) for "passkeys" in .context/ (7 sections searched):
adr-0001  .context/decisions/0001-use-passkeys.md:1  fresh  Use passkeys for sign-in
  Passkeys only.
auth  .context/spec.md:3  fresh  Authentication
  Users sign in with passkeys (`src/auth/login.ts`).
```

**Expected text** for the unstamped fixture (plain `makeRepo()`) and the same query:
```text
2 match(es) for "passkeys" in .context/ (7 sections searched):
adr-0001  .context/decisions/0001-use-passkeys.md:1  unverified  (title withheld)
  withheld (unverified): never verified
auth  .context/spec.md:3  unverified  (title withheld)
  withheld (unverified): never verified
```

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-jx6.2 --claim`
- [ ] **Step 2: Write the failing tests** in `test/search.test.ts`.
  - `searchTerms`: `"Mission packet, budget!"` → `["mission", "packet", "budget"]`; `"a b"` → `[]`; `"mission-packet"` → `["mission-packet"]`; `"-x- ab"` → `["ab"]`; `"A a AA"` → `["aa"]`; nine distinct words give the first 8.
  - `countOccurrences("aaaa", "aa")` → 2; `("abc", "")` → 0.
  - `scoreSection({ meta: { id: "auth" }, title: "Authentication", body: "Users sign in with passkeys." }, …)`: `["passkeys"]` → 1; `["auth"]` → 6; `["passkeys", "stripe"]` → 0.
  - `snippetFor`: `"# T\n\n<!-- x -->\n\nFirst line.\n\nSecond passkeys line."` with `["passkeys"]` → `"Second passkeys line."`, and with `["zzz"]` → `"First line."`; a 300-character line gives a 160-character result ending in `…`.
  - `parseLimit`: `undefined` → 5, `"20"` → 20, `7` → 7; `"0"`, `"21"`, `"x"` and `1.5` each throw a `BatonError` with exit 1.
  - `finds and ranks on the stamped fixture`: `searchContext(root, await loadConfig(root), "passkeys")` gives `total` 2, hit ids `["adr-0001", "auth"]`, scores `[5, 1]`, levels `fresh`, and `renderSearchText` equals the expected text above.
  - `withholds unverified titles and text`: on a plain `makeRepo()` (unstamped), the same query renders exactly the second expected text; it contains neither `Passkeys only.` nor `Use passkeys for sign-in` nor `Authentication`, and both hits have `title` and `snippet` `null` (also in `--format json`).
  - `withholds superseded titles and text`: on the stamped fixture, `"passwords"` gives one hit, `adr-0002`, rendered as `adr-0002  .context/decisions/0002-use-passwords.md:1  superseded  (title withheld)` and `  withheld (superseded): superseded by adr-0001`; the text does not contain `Use passwords`.
  - `limit`: `{ limit: 1 }` gives one hit and the last line `1 more match(es) not shown (limit 1).`
  - `every term must match`: `"stripe passkeys"` renders exactly `no matches for "stripe passkeys" in .context/ (7 sections searched)`.
  - `rejects a short query`: `"a"` rejects with exit 1 and a message containing `at least 2 characters`.
  - `lists index problems`: add `.context/knowledge/dup.md` = `"---\nid: auth\nkind: knowledge\n---\n# Dup\n"`. `problems` has length 1, and the text ends with a line starting `Problems in .context/ (affected sections skipped): .context/knowledge/dup.md`.
  - `command`: `runCli(["search", "passkeys"], root)` exits 0 with stdout equal to the expected text plus `"\n"`; `search passkeys --format json` parses with `total` 2; `search a` exits 1; `search passkeys --limit 0` exits 1; `search passkeys` in `emptyTmp` exits 1 with stderr containing `no .context/`.
- [ ] **Step 3: Run.** `npx vitest run test/search.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `src/core/search.ts`, the command and the registration.
- [ ] **Step 5: Run.** Expected: PASS. Then `npm run check` and `npm run build`. Smoke test: `node dist/baton.mjs search mission packet` on this repo prints a match list and exits 0.
- [ ] **Step 6: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-jx6.2
  git add src/core/search.ts src/commands/search.ts src/program.ts test/search.test.ts .context/tasks.jsonl
  git commit -m "feat(search): full-text search over .context/ that withholds stale text" -- src/core/search.ts src/commands/search.ts src/program.ts test/search.test.ts .context/tasks.jsonl
  ```

---

### Task 5: MCP adapter: four read-only tools over core

Item `bt-jx6.3`. Claim it first.

**Files:**
- Modify: `src/mcp/server.ts` (rewrite), `src/commands/mcp.ts` (add `--root`)
- Create: `src/mcp/inmemory.ts`
- Test: `test/mcp.test.ts`
- Read first: `src/mcp/server.ts`, `src/commands/mcp.ts`, implementation notes §6, ADR 0023

**Interfaces:**
- Consumes:
  ```ts
  // P1 Task 10: src/core/mission.ts
  export async function buildMission(root: string, config: Config, opts?: { maxChars?: number; taskId?: string; now?: Date }): Promise<MissionResult>;   // writes nothing
  //   throws BatonError (exit 1): "budget <n> is too small (minimum <m>)" and "no task <id>"
  // P2 Task 5: src/core/decide.ts
  export async function runPreflight(root: string, q: PreflightQuery): Promise<PreflightReport>;   // lenient index; writes nothing
  // P2 Task 4: src/core/preflight.ts
  export interface PreflightQuery { title?: string; paths: string[]; specIds: string[]; supersedes?: number }
  export interface PreflightReport { hits: PreflightHit[]; counts: { constrains: number; related: number; possibly: number }; unknownSpecIds: string[] }
  export function preflight(index: { sections: readonly IndexedSection[] }, q: PreflightQuery): PreflightReport;   // pure
  export function renderPreflight(r: PreflightReport): string;   // "preflight: <c> constraining, <r> related, <p> possibly related" + one line per hit
  //   a hit line shows hitLabel(h), which quotes h.section.title: `ADR 0001 (accepted) "Use passkeys for sign-in"`, `spec auth "Authentication"`
  export function normalizeQueryPath(p: string): string;
  // P2 Task 3: src/core/decisions.ts
  export function parseAdrRef(ref: string): number;   // BatonError exit 1: not an ADR number: "<ref>"
  // P1 Tasks 3, 5, 6 (landed): loadSectionIndex(root, { lenient: true }); evaluateFreshness(scope, config); renderDriftText(report)
  //   renderDriftText: "<n> sections: <f> fresh, <a> aging, <s> stale, <u> unverified, <x> superseded" + "<LEVEL>  <id>  <file>:<line>  <reason>" per non-fresh section,
  //   joined with "\n" AND ENDING WITH "\n" (src/core/drift.ts)
  // existing: isInjectable(level) (src/core/freshness.ts): fresh | aging
  // Task 4: searchContext(root, config, query, { limit }), renderSearchText(result)
  // existing: loadConfig, findProjectRoot, contextPath, BatonError; pkg from package.json (server version)
  // SDK (@modelcontextprotocol/server 2.3.1): McpServer, InMemoryTransport (createLinkedPair) and `type Transport` from "@modelcontextprotocol/server";
  //   serveStdio(factory, { transport? }) → StdioServerHandle { close(): Promise<void> }, and StdioServerTransport(stdin?: Readable, stdout?: Writable),
  //   both from "@modelcontextprotocol/server/stdio"
  //   server.registerTool(name, { description, inputSchema: z.object(…) }, handler); server.connect(transport); server.close()
  ```
  Test helpers: the stamped fixture, `makeRepo`, `makeTempDir`, `runGit`, `writeFiles` (P1 Task 3), `runCli` (P1 Task 6).
- Produces:
  ```ts
  // src/mcp/server.ts
  export const TOOL_NAMES = ["mission", "preflight", "drift", "search"] as const;
  export interface ServerOptions { root?: string }
  export function createServer(opts?: ServerOptions): McpServer;
  export function startMcpServer(opts?: ServerOptions & { transport?: Transport }): StdioServerHandle;
  //   serveStdio(() => createServer(opts), transport ? { transport } : {}); the default transport is the process's stdio
  export async function toolDefinitions(opts?: ServerOptions): Promise<Record<string, unknown>[]>;   // tools/list over the in-memory pair
  // src/mcp/inmemory.ts
  export interface JsonRpcResponse { id?: number; result?: Record<string, unknown>; error?: { code: number; message: string } }
  export interface ToolText { text: string; isError: boolean }
  export interface InMemoryClient {
    serverInfo: { name: string; version: string };   // from the initialize result
    request(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse>;
    listTools(): Promise<Record<string, unknown>[]>;
    callTool(name: string, args?: Record<string, unknown>): Promise<ToolText>;
    close(): Promise<void>;
  }
  export async function connectInMemory(server: McpServer, opts?: { timeoutMs?: number }): Promise<InMemoryClient>;
  // CLI: mcp [--root <dir>]
  ```

**Rules (pinned):**
- **Tools,** registered in `TOOL_NAMES` order, with these exact one-line descriptions and schemas (`z` from `zod`):

  | Tool | Description | `inputSchema` |
  |---|---|---|
  | `mission` | `Budgeted session brief for this project: state, tasks, fresh spec sections, decisions. Read-only.` | `z.object({ budget: z.number().int().min(1).max(10_000).optional(), task: z.string().min(1).optional() })` |
  | `preflight` | `Accepted decisions and spec sections that a proposed change touches, by path, spec id or title. Records nothing.` | `z.object({ title: z.string().min(3).optional(), paths: z.array(z.string().min(1)).max(50).optional(), spec: z.array(z.string().min(1)).max(50).optional(), supersedes: z.string().min(1).optional() })` |
  | `drift` | `Freshness of every .context/ section: which are aging, stale, unverified or superseded, and why. Read-only.` | `z.object({})` |
  | `search` | `Full-text search over .context/ sections (spec, rules, decisions, knowledge, state); stale text is withheld.` | `z.object({ query: z.string().min(2), limit: z.number().int().min(1).max(20).optional() })` |
- **Root and config, per call.** `root = opts.root ? resolve(opts.root) : findProjectRoot(process.cwd())`. If `!existsSync(contextPath(root))`, throw ``new BatonError(`no .context/ in ${root}; run \`baton init\` first`)``. Then `config = await loadConfig(root)`. Do not import `src/commands/_shared.ts`.
- **Result wrapper.** Every handler runs its body through one helper: a returned string becomes `{ content: [{ type: "text", text }] }`; a `BatonError` becomes `{ isError: true, content: [{ type: "text", text: \`baton: ${err.message}\` }] }`; any other error becomes the same with `baton: unexpected error: <message>`, and also writes `baton mcp: <err.stack ?? String(err)>\n` to stderr (stdout carries the protocol). Nothing is thrown to the SDK.
- **`mission`:** `config = await loadConfig(root)`; `buildMission(root, config, { ...(budget ? { maxChars: budget } : {}), ...(task ? { taskId: task } : {}) })`; return `result.text`. Never call `writePacketCache`.
- **`preflight`:**
  1. With no `title`, and `paths` and `spec` missing or empty → `BatonError("preflight needs a title, paths or spec")`.
  2. `q = { ...(title ? { title } : {}), paths: (paths ?? []).map(normalizeQueryPath).filter(Boolean), specIds: spec ?? [], ...(supersedes ? { supersedes: parseAdrRef(supersedes) } : {}) }`.
  3. `index = await loadSectionIndex(root, { lenient: true })`; `levels` = a map from section id to level, from `await evaluateFreshness(index, config)`; `report = preflight(index, q)` (the same function `runPreflight` calls).
  4. **Titles withheld.** For each hit whose section's level is not `isInjectable`, replace the hit with a copy whose `section` is a copy with `title: "(title withheld)"`. Never mutate the index.
  5. Lines: `renderPreflight(<the copied report>)`; then, when `counts.constrains > 0`, `<c> accepted decision(s) or load-bearing section(s) constrain this change; read them before deciding.`; then, when any title was withheld, `Titles of stale, unverified or superseded sections are withheld; baton drift lists them.`; then always `Recording a decision is a CLI step: baton decide "<title>" --spec <ids> --paths <paths>.` Joined with `\n`.
- **`drift`:** `index = await loadSectionIndex(root, { lenient: true })`, `report = await evaluateFreshness(index, config)`, `text = renderDriftText(report).trimEnd()` (the landed renderer ends with `"\n"`). With index problems, append `\nProblems in .context/ (affected sections skipped): <messages joined "; ">.` Never call `appendDriftLog`. The drift text names ids, files, levels and reasons, never titles or bodies.
- **`search`:** `renderSearchText(await searchContext(root, config, query, limit ? { limit } : {}))`; Task 4 already withholds titles and text.
- **Server.** `new McpServer({ name: "baton", version: pkg.version })`, as today. `startMcpServer(opts)` returns `serveStdio(() => createServer({ ...(opts.root ? { root: opts.root } : {}) }), opts.transport ? { transport: opts.transport } : {})`.
- **`connectInMemory(server, { timeoutMs = 30_000 })`:**
  1. `[clientSide, serverSide] = InMemoryTransport.createLinkedPair()`; `await server.connect(serverSide)`.
  2. A `pending` map from request id to resolver; `clientSide.onmessage` resolves the entry whose `id` matches and ignores other messages; `await clientSide.start()`.
  3. `request(method, params)` sends `{ jsonrpc: "2.0", id: ++n, method, params: params ?? {} }` and resolves with the response. When `timeoutMs` passes first, it rejects with `Error(\`MCP request ${method} timed out\`)`.
  4. Before returning, it sends `initialize` with `{ protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "baton-in-memory", version: "0" } }` (an error response throws `Error(<message>)`), keeps `result.serverInfo` as `serverInfo`, then sends the notification `{ jsonrpc: "2.0", method: "notifications/initialized" }`.
  5. `listTools()` returns `result.tools`. `callTool(name, args)` sends `tools/call` with `{ name, arguments: args ?? {} }`; an `error` response throws `Error(<message>)`; otherwise `text` joins the `text` of the `type: "text"` content blocks with `\n`, and `isError` is `result.isError === true`.
  6. `close()` closes the client transport, then `await server.close()`.
- **`toolDefinitions(opts)`:** connect `createServer(opts)`, `listTools()`, close in `finally`.
- **Command `mcp [--root <dir>]`.** Keep the lazy `await import("../mcp/server.js")`; call `startMcpServer(o.root ? { root: o.root } : {})` and keep serving until stdin closes. Description unchanged.

**Expected preflight text** for `{ title: "Use WebAuthn for login", paths: ["src/auth/**"], spec: ["auth"] }` on the stamped fixture:
```text
preflight: 1 constraining, 2 related, 0 possibly related
CONSTRAINS  ADR 0001 (accepted) "Use passkeys for sign-in"  .context/decisions/0001-use-passkeys.md:1  spec: auth
RELATED     spec auth "Authentication"  .context/spec.md:3  path: src/auth/**; spec: auth
RELATED     knowledge knowledge-windows "Windows gotchas"  .context/knowledge/windows.md:1  path: src/auth/**
1 accepted decision(s) or load-bearing section(s) constrain this change; read them before deciding.
Recording a decision is a CLI step: baton decide "<title>" --spec <ids> --paths <paths>.
```

**Expected preflight text** for the same arguments on the unstamped fixture (plain `makeRepo()`), where all three sections are unverified:
```text
preflight: 1 constraining, 2 related, 0 possibly related
CONSTRAINS  ADR 0001 (accepted) "(title withheld)"  .context/decisions/0001-use-passkeys.md:1  spec: auth
RELATED     spec auth "(title withheld)"  .context/spec.md:3  path: src/auth/**; spec: auth
RELATED     knowledge knowledge-windows "(title withheld)"  .context/knowledge/windows.md:1  path: src/auth/**
1 accepted decision(s) or load-bearing section(s) constrain this change; read them before deciding.
Titles of stale, unverified or superseded sections are withheld; baton drift lists them.
Recording a decision is a CLI step: baton decide "<title>" --spec <ids> --paths <paths>.
```

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-jx6.3 --claim`
- [ ] **Step 2: Write the failing tests** in `test/mcp.test.ts`. Each test builds the stamped fixture `root` (unless it says otherwise), `client = await connectInMemory(createServer({ root }))`, and closes the client in `finally`.
  - `lists exactly four read-only tools`: `client.serverInfo.name` is `"baton"`; the names equal `TOOL_NAMES`; every description is one line of at most 120 characters; every `inputSchema.type` is `"object"`; `search`'s `inputSchema.required` contains `"query"`.
  - `mission returns the packet`: text starts with `# baton mission brief\n`, contains `Superseded: adr-0002 (by adr-0001).`, is at most 9000 characters, and `isError` is false. `{ budget: 3000 }` gives at most 3000 characters. `{ budget: 100 }` gives `isError` with text containing `too small`. `{ task: "bt-zzz" }` gives `isError` and text `baton: no task bt-zzz`. `{ budget: 20000 }` gives `isError` with text starting `Input validation error`.
  - `preflight queries and records nothing`: the arguments above give exactly the first expected text, and `readdirSync(<root>/.context/decisions)` is unchanged.
  - `preflight withholds titles of unverified sections`: on a plain `makeRepo()`, the same arguments give exactly the second expected text, which contains neither `Use passkeys for sign-in`, `Authentication` nor `Windows gotchas`. `{}` gives `isError` and text `baton: preflight needs a title, paths or spec`. `{ title: "Use WebAuthn for login", spec: ["auth"], supersedes: "1" }` gives text starting `preflight: 0 constraining, 2 related, 0 possibly related` and not containing `constrain this change`. `{ title: "abc", supersedes: "x" }` gives `isError` with `not an ADR number`.
  - `drift reports without logging`: the text is exactly `7 sections: 6 fresh, 0 aging, 0 stale, 0 unverified, 1 superseded\nSUPERSEDED  adr-0002  .context/decisions/0002-use-passwords.md:1  superseded by adr-0001`, and `.context/.cache/drift.jsonl` does not exist afterwards.
  - `search withholds stale text`: `{ query: "passkeys" }` gives exactly Task 4's first expected text. On a plain `makeRepo()`, it gives exactly Task 4's second expected text (titles and text withheld).
  - `needs .context/`: with `createServer({ root: emptyTmp })`, each of `mission {}`, `preflight { title: "abc" }`, `drift {}` and `search { query: "passkeys" }` gives `isError` with text starting `baton: no .context/ in`.
  - `serves the real stdio transport`: `input = new PassThrough()`, `output = new PassThrough()`, `handle = startMcpServer({ root, transport: new StdioServerTransport(input, output) })`. Collect `output` into lines (split on `"\n"`, parse each non-empty line as JSON). Write `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}` plus `"\n"`; wait (at most 10 s) for the line with `id` 1, whose `result.serverInfo.name` is `"baton"`; write `{"jsonrpc":"2.0","method":"notifications/initialized"}` and `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`, each plus `"\n"`; the `id` 2 line's tool names equal `TOOL_NAMES`. Then `await handle.close()`.
  - `never writes`: hash every file under `root` except `.git/**` and `.context/.cache/**` (repo path → sha256 of the bytes), call all four tools with valid arguments, and hash again: the maps are equal. `runGit(root, "status", "--porcelain")` is `""` before and after.
  - `has no writing tool`: `client.request("tools/call", { name: "decide", arguments: {} })` returns an `error` with `code` -32602.
  - `toolDefinitions` returns 4 entries, and `JSON.stringify(defs).length` is below 4000 (the overhead every configured session pays).
  - `mcp --help` through `runCli(["mcp", "--help"], root)` exits 0, and stdout contains `--root`.
- [ ] **Step 3: Run.** `npx vitest run test/mcp.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `src/mcp/inmemory.ts`, `src/mcp/server.ts` and the `--root` option. Update the module comment in `server.ts` to say the tools are read-only (ADR 0023).
- [ ] **Step 5: Run.** Expected: PASS. Then `npm run check` and `npm run build`.
- [ ] **Step 6: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-jx6.3
  git add src/mcp/server.ts src/mcp/inmemory.ts src/commands/mcp.ts test/mcp.test.ts .context/tasks.jsonl
  git commit -m "feat(mcp): four read-only tools over core, tested in process" -- src/mcp/server.ts src/mcp/inmemory.ts src/commands/mcp.ts test/mcp.test.ts .context/tasks.jsonl
  ```

---

### Task 6: Bundle check: the MCP SDK stays out of the hook path

Item `bt-jx6.4`. Claim it first. Its labels run `npm run check` and `npm run check:bundle`.

**Files:**
- Modify: `tsup.config.ts` (add `metafile: true`), `package.json` (add the script `"check:bundle": "node scripts/bundle-check.mjs"`), `.github/workflows/ci.yml` (one step)
- Create: `scripts/bundle-check.mjs`
- Test: `test/bundle-check.test.ts`
- Read first: `tsup.config.ts`, `src/cli.ts` (P1 Task 17 fast path), `src/commands/mcp.ts`, `scripts/sync-plugin.mjs` (script style)

**Interfaces:**
- Consumes:
  - P1 Task 17: `src/cli.ts` routes `baton hook <event>` to `await import("./hooks/entry.js")` and everything else to `await import("./program.js")`; `src/hooks/entry.ts` exists.
  - tsup 9 with `metafile: true` writes `dist/metafile-esm.json` (implementation notes §11). Its `outputs` map has keys such as `dist/baton.mjs` and `dist/chunk-<hash>.mjs` (also `.map` entries), each with `imports: { path, kind, external? }[]` (`kind` is `"import-statement"`, `"dynamic-import"` or `"require-call"`; `external: true` marks an import left to Node at runtime, such as `node:fs`) and `inputs: Record<string, …>` whose keys are repo-relative paths such as `src/hooks/entry.ts` or `node_modules/@modelcontextprotocol/server/dist/index.mjs`.
  - Why the external check matters: the OS temp folder sits under the home folder, which has its own `node_modules`, so an unpacked tarball in a temp dir could still resolve a bare import from there; only the metafile proves that nothing but Node built-ins is left external.
  - `scripts/sync-plugin.mjs` copies only `*.mjs`, so the metafile is not copied into `plugin/dist/`.
- Produces: `npm run check:bundle`, and `node scripts/bundle-check.mjs [--metafile <path>]` (default `dist/metafile-esm.json`).

**Script behaviour (pinned):**
1. Read the metafile. Missing → stderr `bundle-check: <path> not found; run npm run build first`, exit 1.
2. Keep only outputs whose key ends in `.mjs`; normalise `\` to `/` in keys, import paths and input paths.
3. `sdk(o)`: some input key contains `node_modules/@modelcontextprotocol/`.
4. Failures, each one stderr line, checked in this order:
   - no output `dist/baton.mjs` → `bundle-check: no dist/baton.mjs in the metafile`;
   - no `sdk` output at all → `bundle-check: MCP SDK not found in the bundle`;
   - an `sdk` output in the closure of `dist/baton.mjs` over `import-statement` edges only (the entry itself included) → `bundle-check: MCP SDK in the entry's static imports: <output>`;
   - no output whose inputs include `src/hooks/entry.ts` → `bundle-check: no output contains src/hooks/entry.ts`;
   - an `sdk` output in the closure of that hook output over **both** kinds of edge → `bundle-check: MCP SDK reachable from the hook path: <output>`;
   - any import (in any kept output) with `external: true` whose `path` is not a Node built-in → `bundle-check: external import <path> in <output> would be resolved from node_modules at runtime`. A built-in is a path that starts with `node:`, or is in `builtinModules` from `node:module`.
   A closure is a breadth-first walk from the start output, following `imports` whose `path` is a kept output (external imports are not followed).
5. On success, print one line and exit 0: `bundle-check: <n> outputs; hook path <k> outputs, <kb> KB; MCP SDK only in <sdk outputs joined ", ">`, where `kb` is the total `bytes` of the hook closure's outputs divided by 1024, rounded.
6. The script is Biome-clean, uses `node:` imports, and has no dependencies.

**Fake metafile `GOOD`** for the tests:
```json
{ "inputs": {}, "outputs": {
  "dist/baton.mjs": { "bytes": 1000, "entryPoint": "src/cli.ts", "inputs": { "src/cli.ts": {}, "src/hooks/io.ts": {} },
    "imports": [{ "path": "dist/entry-H.mjs", "kind": "dynamic-import" }, { "path": "dist/program-P.mjs", "kind": "dynamic-import" }, { "path": "dist/chunk-S.mjs", "kind": "import-statement" }] },
  "dist/baton.mjs.map": { "bytes": 10, "inputs": {}, "imports": [] },
  "dist/entry-H.mjs": { "bytes": 2048, "inputs": { "src/hooks/entry.ts": {}, "src/hooks/dispatch.ts": {} }, "imports": [{ "path": "dist/chunk-S.mjs", "kind": "import-statement" }] },
  "dist/program-P.mjs": { "bytes": 4000, "inputs": { "src/program.ts": {}, "src/commands/mcp.ts": {} }, "imports": [{ "path": "dist/server-M.mjs", "kind": "dynamic-import" }] },
  "dist/server-M.mjs": { "bytes": 9000, "inputs": { "src/mcp/server.ts": {}, "node_modules/@modelcontextprotocol/server/dist/index.mjs": {} }, "imports": [{ "path": "dist/chunk-S.mjs", "kind": "import-statement" }] },
  "dist/chunk-S.mjs": { "bytes": 1024, "inputs": { "node_modules/zod/index.js": {} },
    "imports": [{ "path": "node:fs", "kind": "import-statement", "external": true }, { "path": "events", "kind": "require-call", "external": true }] }
} }
```

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-jx6.4 --claim`
- [ ] **Step 2: Write the failing tests** in `test/bundle-check.test.ts`. Each test writes a metafile into `makeTempDir()` and runs `spawnSync(process.execPath, ["scripts/bundle-check.mjs", "--metafile", <file>], { cwd: REPO_ROOT, encoding: "utf8" })`.
  - `GOOD` exits 0, and stdout is `bundle-check: 5 outputs; hook path 2 outputs, 3 KB; MCP SDK only in dist/server-M.mjs\n`.
  - `GOOD` with `entry-H` gaining `{ "path": "dist/server-M.mjs", "kind": "dynamic-import" }` exits 1, and stderr contains `MCP SDK reachable from the hook path: dist/server-M.mjs`.
  - `GOOD` with `dist/baton.mjs` gaining `{ "path": "dist/server-M.mjs", "kind": "import-statement" }` exits 1, and stderr contains `MCP SDK in the entry's static imports`.
  - `GOOD` without `dist/entry-H.mjs` (and without the edge to it) exits 1 with `no output contains src/hooks/entry.ts`.
  - `GOOD` with the `@modelcontextprotocol` input removed exits 1 with `MCP SDK not found in the bundle`.
  - `GOOD` with `chunk-S` gaining `{ "path": "yaml", "kind": "import-statement", "external": true }` exits 1 with `external import yaml in dist/chunk-S.mjs`. (`node:fs` and `events` in `GOOD` are built-ins and pass.)
  - A missing metafile path exits 1 with `run npm run build first`.
- [ ] **Step 3: Run.** `npx vitest run test/bundle-check.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the script, the tsup option and the npm script. In `.github/workflows/ci.yml`, add `- run: npm run check:bundle` directly after `- run: npm run build`.
- [ ] **Step 5: Run.** Expected: PASS. Then `npm run build` and `npm run check:bundle` on the real build: expected exit 0 and one summary line. Record that line for the commit message's body if you like. If it fails, the hook path really reaches the SDK: find the static import that pulls it in and make it a dynamic import; never weaken the check. Then `npm run check`.
- [ ] **Step 6: Close through `verify`, then commit.**
  ```bash
  # runs npm run check and npm run check:bundle: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-jx6.4
  git add tsup.config.ts package.json .github/workflows/ci.yml scripts/bundle-check.mjs test/bundle-check.test.ts .context/tasks.jsonl
  git commit -m "build: metafile check that the MCP SDK stays off the hook path" -- tsup.config.ts package.json .github/workflows/ci.yml scripts/bundle-check.mjs test/bundle-check.test.ts .context/tasks.jsonl
  ```

---

### Task 7: Codex and Gemini hook input and output

Item `bt-jx6.5`. Claim it first.

**Files:**
- Modify: `src/hooks/guards.ts` (`patchText`, `SHELL_TOOLS`, `shellCommandOf`, and the two `apply_patch` reads), `src/hooks/io.ts` (`renderHookResult`: the Gemini no-op, and tool-event context under Codex and Gemini), `src/hooks/dispatch.ts` (the fail-open stdout under Gemini)
- Test: `test/hooks-harness.test.ts`
- Read first: `src/hooks/guards.ts`, `src/hooks/io.ts`, `src/hooks/dispatch.ts`, `src/hooks/pre-tool-use.ts`, implementation notes §5 (Task 1), ADR 0024

**Interfaces:**
- Consumes:
  - P2 Task 8 (`src/hooks/guards.ts`): `editTargets(tool, input)` (for `apply_patch` it reads the `*** Add|Update|Delete File: <path>` headers of `input.input`), `checkToolCall(tool, input, env)` (its `apply_patch` branch calls `patchTouchesFrontmatter(input.input)`), `patchTouchesFrontmatter(patch)`, `shellCommandOf(tool, input)` (`input.command` as a string, or an array joined with `" "`, for tools in `SHELL_TOOLS`), and `SHELL_TOOLS = ["Bash", "PowerShell", "run_shell_command"]`. The existing test passes `{ input: patch }` and must keep passing.
  - P2 Task 9: `preToolUse(input, ctx)` uses `checkToolCall`, `editTargets`, `shellCommandOf` and `SHELL_TOOLS`; it denies with the Task 8 reasons (state: contains `baton handoff`; tasks: contains `baton task`). For an edit of a `guards.preflightPaths` file (such as `package.json`), or a shell command that adds a dependency (`npm install zod`), it returns `{ kind: "context", text: "baton preflight: …" }`.
  - Implementation notes §5 (Task 1): whether Codex PreToolUse and Gemini BeforeTool accept `hookSpecificOutput.additionalContext` is ❓, and what they do with output they do not expect is not documented.
  - `src/hooks/io.ts`: `renderHookResult(event, result, harness = "claude")`. Today `noop` gives `{ stdout: "", stderr: "", exitCode: 0 }` for every harness; `context` renders `hookSpecificOutput.{hookEventName, additionalContext}`; `deny` renders Gemini's `{ decision: "deny", reason }` and the `permissionDecision` form for Claude and Codex. `NATIVE_EVENT_NAMES` maps `PreCompress` → `pre-compact` and `BeforeTool` → `pre-tool-use`.
  - P1 Task 17: `runHook(event, harness, stdin)` catches every error and returns `{ stdout: "", stderr: "baton hook <event>: <message>\n", exitCode: 0 }`; handlers for `session-start` (packet), `pre-compact` and `session-end` (handoff; reason `session-end:<reason>`).
  - Test helpers: the stamped fixture, `makeRepo`, `makeTempDir`, `runGit`, `writeFiles` (P1 Task 3); `toolUse`, `toJsonl`, `isolateClaudeConfig` (P1 Task 11); `PACKET_HEADER` (P1 Task 9).
- Produces:
  ```ts
  // src/hooks/guards.ts
  export function patchText(input: Record<string, unknown>): string;
  //   typeof input.command === "string" ? input.command : typeof input.input === "string" ? input.input : ""
  export const SHELL_TOOLS: readonly string[];   // ["Bash", "PowerShell", "run_shell_command", "exec_command"]
  //   shellCommandOf: input.command (string, or string array joined " "), else input.cmd (same forms), else null
  // src/hooks/io.ts
  export const GEMINI_NOOP_STDOUT = "{}";
  //   renderHookResult(event, { kind: "noop" }, "gemini") → { stdout: "{}", stderr: "", exitCode: 0 }
  //   renderHookResult("pre-tool-use" | "post-tool-use", { kind: "context", … }, "codex" | "gemini") → that harness's no-op output
  // src/hooks/dispatch.ts: runHook's catch returns stdout "{}" when harness is "gemini", "" otherwise
  ```

**Rules (pinned):**
- `editTargets("apply_patch", input)` and the `apply_patch` branch of `checkToolCall` both read `patchText(input)`. Nothing else in the guard changes.
- `apply_patch` stays out of `SHELL_TOOLS`: its text is a patch, not a shell command.
- The Gemini no-op and fail-open outputs change only for `harness === "gemini"`. Claude and Codex keep `""`.
- **Preflight context is suppressed under Codex and Gemini** (ADR 0024). A `context` result for `pre-tool-use` or `post-tool-use` renders as the harness's no-op (`""` for Codex, `{}` for Gemini) until a live session shows the harness accepts `additionalContext` on tool events (`bt-jx6.24`). Denies are unaffected, and Claude Code keeps its context unchanged. SessionStart context is sent under every harness.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-jx6.5 --claim`
- [ ] **Step 2: Write the failing tests** in `test/hooks-harness.test.ts`. `stdin = (o) => Readable.from([JSON.stringify(o)])`; `isolateClaudeConfig()` and `BATON_ACTOR = "tester"` in `beforeEach`. Codex inputs also carry `model: "gpt-test"` and, for tool events, `turn_id: "t1"` and `tool_use_id: "u1"`; Gemini inputs carry `timestamp: "2026-10-23T00:00:00Z"`. `STATE_PATCH` is `"*** Begin Patch\n*** Update File: .context/STATE.md\n@@\n-Nothing handed off yet.\n+x\n*** End Patch"`.
  - `patchText`: `{ command: "a" }` → `"a"`; `{ input: "b" }` → `"b"`; `{ command: "a", input: "b" }` → `"a"`; `{}` → `""`.
  - `editTargets("apply_patch", { command: STATE_PATCH })` → `[".context/STATE.md"]`, and the existing `{ input: … }` form still works.
  - `shellCommandOf`: `("exec_command", { cmd: ["bash", "-lc", "ls"] })` → `"bash -lc ls"`; `("Bash", { command: "ls" })` → `"ls"`; `("apply_patch", { command: "x" })` → `null`.
  - **Codex, on the stamped fixture, through `runHook(<event>, "codex", stdin(…))`:**
    - `SessionStart` with `source: "startup"`, and again with `source: "compact"`: `JSON.parse(stdout).hookSpecificOutput` has `hookEventName` `"SessionStart"` and `additionalContext` starting with `PACKET_HEADER`.
    - `PreCompact` with `trigger: "auto"` and a `transcript_path` in a separate temp dir: stdout `""`, and `.context/STATE.md` contains `reason: "pre-compact"`.
    - `SessionEnd` with `reason: "other"`: stdout `""`, and STATE.md contains `reason: "session-end:other"`.
    - `PreToolUse` `Bash { command: "echo x > .context/tasks.jsonl" }`: `hookSpecificOutput.permissionDecision` is `"deny"`, and the reason contains `baton task`.
    - `PreToolUse` `apply_patch { command: STATE_PATCH }`: denied, and the reason contains `baton handoff`.
    - With `.context/decisions/0003-draft.md` = `"---\nid: adr-0003\nkind: decision\nstatus: proposed\n---\n# Draft\n\nDraft.\n"`: an `apply_patch` whose `command` updates that file with `-status: proposed` / `+status: accepted` is denied; one that changes `-Draft.` into `+Better.` gives stdout `""`.
    - `PreToolUse` `exec_command { cmd: ["bash", "-lc", "echo x > .context/STATE.md"] }`: denied.
    - `PreToolUse` `Bash { command: "ls" }`: stdout `""`, stderr `""`.
    - **Preflight suppressed:** `PreToolUse` `Bash { command: "npm install zod" }` gives stdout `""`; so does an `apply_patch` whose `command` updates `package.json` (`*** Update File: package.json`). The same `npm install zod` input through `runHook("pre-tool-use", "claude", …)` still gives `hookSpecificOutput.additionalContext` starting `baton preflight:`.
  - **Gemini, on the stamped fixture, through `runHook(<event>, "gemini", stdin(…))`:**
    - `SessionStart` with `source: "startup"`: `hookSpecificOutput.additionalContext` starts with `PACKET_HEADER`.
    - `PreCompress` (event `pre-compact`) with `trigger: "manual"`: stdout `"{}"`, and STATE.md contains `reason: "pre-compact"`.
    - `SessionEnd` with `reason: "exit"`: stdout `"{}"`, and STATE.md contains `reason: "session-end:exit"`.
    - `BeforeTool` `write_file { file_path: join(root, ".context", "STATE.md"), content: "x" }`: stdout parses to `{ decision: "deny", reason: <string containing "baton handoff"> }`.
    - `BeforeTool` `run_shell_command { command: "echo x > .context/STATE.md" }`: `decision` `"deny"`.
    - `BeforeTool` `run_shell_command { command: "ls" }`: stdout `"{}"`, stderr `""`.
    - `BeforeTool` `replace { file_path: join(root, "src", "auth", "login.ts"), old_string: "1", new_string: "2" }`: stdout `"{}"`.
    - **Preflight suppressed:** `BeforeTool` `write_file { file_path: join(root, "package.json"), content: "{}" }` and `run_shell_command { command: "npm install zod" }` both give stdout `"{}"`.
    - `fails open with JSON`: with `.context/config.yaml` = `"packet: [\n"`, `SessionStart` gives stdout `"{}"`, exit 0, and stderr starting `baton hook session-start:`.
  - `renderHookResult("session-end", { kind: "noop" }, "gemini")` equals `{ stdout: "{}", stderr: "", exitCode: 0 }`, and the Claude and Codex forms keep stdout `""`. `renderHookResult("pre-tool-use", { kind: "context", text: "t" }, "codex")` has stdout `""`; with `"gemini"`, `"{}"`; with `"claude"`, the `additionalContext` JSON. `renderHookResult("session-start", { kind: "context", text: "t" }, "gemini")` still carries `additionalContext` `"t"`.
- [ ] **Step 3: Run.** `npx vitest run test/hooks-harness.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the changes. `test/guards.test.ts`, `test/pre-tool-use.test.ts`, `test/post-tool-use.test.ts`, `test/hooks.test.ts` and `test/stop-hook.test.ts` must still pass unchanged.
- [ ] **Step 5: Run.** Expected: PASS. Then `npm run check`, `npm run build` and `npm run check:bundle`.
- [ ] **Step 6: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-jx6.5
  git add src/hooks/guards.ts src/hooks/io.ts src/hooks/dispatch.ts test/hooks-harness.test.ts .context/tasks.jsonl
  git commit -m "feat(hooks): Codex apply_patch and exec_command input, JSON-only Gemini output" -- src/hooks/guards.ts src/hooks/io.ts src/hooks/dispatch.ts test/hooks-harness.test.ts .context/tasks.jsonl
  ```

---

### Task 8: Harness config core: Codex and Gemini hook files and merge rules

Item `bt-jx6.6`. Claim it first.

**Files:**
- Create: `src/core/harness.ts`
- Test: `test/harness-config.test.ts`
- Read first: `src/core/init.ts` (P1 Task 16, landed: `InitAction`, `ensureLines`), implementation notes §5, ADR 0024

**Interfaces:**
- Consumes: `writeFileAtomic(path, text)` (`src/core/tasks/native/jsonl.ts`), `BatonError`, `ExitCode` (`src/core/errors.ts`); `homedir` from `node:os`. Core must not import `src/hooks/` or `src/commands/`, so event and harness names are string literals here.
- Produces:
  ```ts
  // src/core/harness.ts
  export type ExternalHarness = "codex" | "gemini";
  export type HookScope = "project" | "user";
  export const HOOK_SCOPES: readonly HookScope[];                  // ["project", "user"]
  export const CODEX_PRE_TOOL_MATCHER = "^(Bash|apply_patch)$";
  export const GEMINI_BEFORE_TOOL_MATCHER = "^(write_file|replace|run_shell_command)$";
  export const CODEX_CONTEXT_LIMIT = 4000;
  export const GEMINI_CONTEXT_FILES: readonly string[];             // ["AGENTS.md", "GEMINI.md"]
  export const PROJECT_PREFIX = "baton";
  export interface HookHandler { name?: string; type: "command"; command: string; timeout: number; additionalContextLimit?: number }
  export interface HookGroup { matcher?: string; hooks: HookHandler[] }
  export type HookMap = Record<string, HookGroup[]>;
  export function hookCommand(event: string, harness: ExternalHarness, prefix?: string): string;   // `${prefix ?? "baton"} hook ${event} --harness ${harness}`
  export function userCommandPrefix(bundlePath: string): string;   // `node "<forward-slash path>"`
  export function codexHooks(prefix?: string): HookMap;
  export function geminiHooks(prefix?: string): HookMap;
  export function isBatonHandler(h: unknown): boolean;
  export interface MergeResult { value: Record<string, unknown>; added: string[]; replaced: string[]; kept: string[] }
  export function mergeHooks(existing: unknown, wanted: HookMap, opts: { refresh: boolean; file: string }): MergeResult;
  export function ensureGeminiContext(settings: Record<string, unknown>, file: string): { value: Record<string, unknown>; changed: boolean };
  export function parseScope(value: string): HookScope;
  export function harnessHome(env?: NodeJS.ProcessEnv): string;      // env.BATON_HOME ?? homedir()
  export function harnessConfigPath(harness: ExternalHarness, scope: HookScope, root: string, env?: NodeJS.ProcessEnv): { abs: string; shown: string };
  export interface HarnessPlanEntry {
    harness: ExternalHarness; abs: string; shown: string;
    action: "create" | "update" | "skip"; next: string; note: string;
    warning?: string;                     // set only when there is one
  }
  export async function planHarnessConfig(root: string, harnesses: readonly ExternalHarness[],
    opts: { scope: HookScope; refresh: boolean; bundlePath?: string; env?: NodeJS.ProcessEnv }): Promise<HarnessPlanEntry[]>;
  export function applyHarnessConfig(entries: readonly HarnessPlanEntry[]): void;
  ```

**Rules (pinned):**
- **`codexHooks(prefix = "baton")`** returns exactly (key order as written; shown here with the default prefix):
  ```json
  {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "baton hook session-start --harness codex", "timeout": 10, "additionalContextLimit": 4000 }] }],
    "PreCompact": [{ "hooks": [{ "type": "command", "command": "baton hook pre-compact --harness codex", "timeout": 30 }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "baton hook session-end --harness codex", "timeout": 3 }] }],
    "PreToolUse": [{ "matcher": "^(Bash|apply_patch)$", "hooks": [{ "type": "command", "command": "baton hook pre-tool-use --harness codex", "timeout": 5 }] }]
  }
  ```
- **`geminiHooks(prefix = "baton")`** returns exactly:
  ```json
  {
    "SessionStart": [{ "hooks": [{ "name": "baton-session-start", "type": "command", "command": "baton hook session-start --harness gemini", "timeout": 10000 }] }],
    "PreCompress": [{ "hooks": [{ "name": "baton-pre-compact", "type": "command", "command": "baton hook pre-compact --harness gemini", "timeout": 30000 }] }],
    "SessionEnd": [{ "hooks": [{ "name": "baton-session-end", "type": "command", "command": "baton hook session-end --harness gemini", "timeout": 10000 }] }],
    "BeforeTool": [{ "matcher": "^(write_file|replace|run_shell_command)$", "hooks": [{ "name": "baton-pre-tool-use", "type": "command", "command": "baton hook pre-tool-use --harness gemini", "timeout": 5000 }] }]
  }
  ```
  A different `prefix` changes only the `command` strings (`hookCommand(event, harness, prefix)`).
- **`userCommandPrefix(bundlePath)`.** `p = bundlePath.replace(/\\/g, "/")`. When `p` contains any of `"`, `$`, `` ` `` or `%`, throw `BatonError(\`cannot write a hook command for ${p}: the path holds a shell metacharacter\`)` (exit 1). Return `` `node "${p}"` ``. The double quotes keep a path with spaces one word in `sh`, `cmd.exe` and PowerShell (the command starts with the bare word `node`).
- **`isBatonHandler(h)`.** `h` is a plain object whose `command` is a string matching `/(^|[\s"'/\\])baton(\.mjs|\.cmd)?["']?\s+hook\s/`. It matches both command forms.
- **`mergeHooks(existing, wanted, { refresh, file })`.**
  1. `existing` is `null` or `undefined` → start from `{}`. Not a plain object → `BatonError(\`${file}: expected a JSON object\`)`.
  2. `value = structuredClone(existing)`. `value.hooks` undefined → `{}`; not a plain object → `BatonError(\`${file}: "hooks" must be an object\`)`.
  3. For each event of `wanted`, in key order: `groups = value.hooks[event]` (undefined → `[]`; not an array → `BatonError(\`${file}: hooks.${event} must be a list\`)`). `has` = some group has a `hooks` array containing an `isBatonHandler` entry.
     - `has && !refresh` → push the event to `kept`; leave it.
     - `has && refresh` → remove the baton handlers from every group, drop groups left with an empty `hooks` array, append `wanted[event]`'s groups, and push to `replaced`.
     - `!has` → append `wanted[event]`'s groups and push to `added`.
  4. Other events, other keys and other handlers are never touched. Key order of existing objects is kept; new keys go at the end.
- **`ensureGeminiContext(settings, file)`.** `context` undefined → set `context = { fileName: ["AGENTS.md", "GEMINI.md"] }` (changed). `context` not a plain object → `BatonError(\`${file}: "context" must be an object\`)`. `fileName` undefined → `["AGENTS.md", "GEMINI.md"]`; a string `s` → `s === "AGENTS.md" ? unchanged : [s, "AGENTS.md"]`; an array of strings → append `"AGENTS.md"` when absent; anything else → `BatonError(\`${file}: context.fileName must be a string or a list of strings\`)`. Return a new object; never mutate the input.
- **`parseScope(v)`.** `v.trim().toLowerCase()` must be `project` or `user`, else `BatonError(\`unknown scope "${v}" (project or user)\`)` (exit 1).
- **`harnessConfigPath(h, scope, root, env = process.env)`.**
  - Project: Codex `join(root, ".codex", "hooks.json")`, shown `.codex/hooks.json`; Gemini `join(root, ".gemini", "settings.json")`, shown `.gemini/settings.json`.
  - User: Codex `join(env.CODEX_HOME, "hooks.json")`, shown `$CODEX_HOME/hooks.json`, when `env.CODEX_HOME` is a non-empty string (implementation notes §5: ❓), else `join(harnessHome(env), ".codex", "hooks.json")`, shown `~/.codex/hooks.json`; Gemini `join(harnessHome(env), ".gemini", "settings.json")`, shown `~/.gemini/settings.json`.
- **`planHarnessConfig(root, harnesses, { scope, refresh, bundlePath, env })`.** One entry per harness, deduped, in the order `codex`, `gemini`. Reads only; writes nothing.
  1. `prefix = scope === "user" ? userCommandPrefix(bundlePath) : PROJECT_PREFIX`. User scope without `bundlePath` → `Error("user scope needs the bundle path")` (a programming error; the command always passes it).
  2. `{ abs, shown } = harnessConfigPath(h, scope, root, env)`.
  3. `current` = the file's text, or `null` when it does not exist. Parse `current.replace(/^\uFEFF/, "")` (literal BOM in source) with `JSON.parse`; on failure throw `BatonError(\`${shown}: not valid JSON (<first line of the error message>); baton reads strict JSON without comments, so fix or remove the file, then run init again\`)`.
  4. `merged = mergeHooks(parsed, h === "codex" ? codexHooks(prefix) : geminiHooks(prefix), { refresh, file: shown })`. For Gemini, also `ensureGeminiContext(merged.value, shown)`. A new Gemini file is built as `{ context, hooks }` in that key order.
  5. `next = JSON.stringify(value, null, 2) + "\n"`.
  6. Action: `create` when `current === null`; else `update` when anything was added, replaced or the context changed; else `skip`.
  7. Notes: `create` → `4 hook event(s)` for Codex, `4 hook event(s), context.fileName` for Gemini. `update` → the parts `added <events joined ", ">`, `rewrote <events joined ", ">` and `context.fileName now lists AGENTS.md`, those that apply, joined with `"; "`. `skip` → `baton hooks already present; --refresh-harness rewrites them`. With user scope and a `bundlePath` containing `/_npx/` (after `\` → `/`), append `; the bundle runs from an npx cache, so install baton-ctx globally and run init again` to the note.
  8. **The other scope.** Read the same harness's file in the other scope (`harnessConfigPath(h, other, root, env)`), when it exists and parses. When any of its groups for the wanted events holds an `isBatonHandler` entry, set `warning` to `` `${otherShown} also has baton hooks; each event would run twice, so remove one of them` ``. A missing or unparseable other file sets nothing.
- **`applyHarnessConfig(entries)`.** For each entry whose action is not `skip`: `mkdirSync(dirname(abs), { recursive: true })`, then `writeFileAtomic(abs, next)`. A skipped file keeps its bytes and formatting.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-jx6.6 --claim`
- [ ] **Step 2: Write the failing tests** in `test/harness-config.test.ts`. In `beforeEach`, set `process.env.BATON_HOME = makeTempDir("baton-home-")` and delete `process.env.CODEX_HOME`; restore both in `afterEach`. `root = makeTempDir()` with `runGit(root, "init", "-q")` unless a test says otherwise. `BOM = String.fromCharCode(0xfeff)`. `BUNDLE = "/opt/baton/dist/baton.mjs"`.
  - `codexHooks()` and `geminiHooks()` deep-equal the two pinned objects; `Object.keys(codexHooks())` equals `["SessionStart", "PreCompact", "SessionEnd", "PreToolUse"]`, and `JSON.stringify(codexHooks().SessionStart[0].hooks[0])` is `{"type":"command","command":"baton hook session-start --harness codex","timeout":10,"additionalContextLimit":4000}` (key order matters for the files). `codexHooks('node "/opt/b.mjs"').PreToolUse[0].hooks[0].command` is `node "/opt/b.mjs" hook pre-tool-use --harness codex`.
  - `hookCommand("pre-tool-use", "codex")` → `"baton hook pre-tool-use --harness codex"`.
  - `userCommandPrefix`: `"C:\\Users\\a b\\npm\\node_modules\\baton-ctx\\dist\\baton.mjs"` → `node "C:/Users/a b/npm/node_modules/baton-ctx/dist/baton.mjs"`; `"/x/$y/baton.mjs"` and `"C:\\100%\\baton.mjs"` → exit 1.
  - `isBatonHandler`: true for `{ command: "baton hook stop" }`, `{ command: "node \"N:/x/dist/baton.mjs\" hook session-start" }` and `{ command: "C:\\npm\\baton.cmd hook pre-compact" }`; false for `{ command: "echo baton" }`, `{ command: "batonx hook a" }`, `"baton hook a"` (not an object) and `{}`.
  - `merges with a user's own hooks`: existing `{ "model": "x", "hooks": { "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "echo hi" }] }] } }`. `mergeHooks(existing, codexHooks(), { refresh: false, file: "f" })`:
    - `value.model` is `"x"`, and `Object.keys(value)` is `["model", "hooks"]`;
    - `value.hooks.PreToolUse` has 2 groups, the user's first and unchanged;
    - `added` equals `["SessionStart", "PreCompact", "SessionEnd", "PreToolUse"]`, `kept` and `replaced` are `[]`;
    - the input object is not mutated.
  - `is idempotent`: merging the result again gives `added: []` and `kept` with all four events, and the value deep-equals the input.
  - `refresh rewrites baton handlers only`: take the merged value, set its baton PreToolUse handler's `timeout` to 99, and add a user handler `{ type: "command", command: "echo also" }` to the same baton group. With `refresh: true`: `replaced` lists all four events; the baton PreToolUse handler's timeout is 5 again; `echo hi` and `echo also` are both still there; there is exactly one baton handler per event.
  - `rejects bad shapes`: `mergeHooks([], …)` → exit 1 with `expected a JSON object`; `{ hooks: [] }` → `"hooks" must be an object`; `{ hooks: { PreToolUse: {} } }` → `hooks.PreToolUse must be a list`.
  - `ensureGeminiContext`: `{}` → `context.fileName` `["AGENTS.md", "GEMINI.md"]`, changed; `{ context: { fileName: "GEMINI.md" } }` → `["GEMINI.md", "AGENTS.md"]`; `{ context: { fileName: "AGENTS.md" } }` → unchanged, `changed: false`; `{ context: { fileName: ["X.md"], other: 1 } }` → `["X.md", "AGENTS.md"]` with `other` kept; `{ context: { fileName: 3 } }` → exit 1; `{ context: "x" }` → exit 1.
  - `parseScope`: `"project"`, `" User "` → `project`, `user`; `"global"` → exit 1 with `unknown scope "global"`.
  - `harnessConfigPath`: `("gemini", "user", root)` → `{ abs: join(BATON_HOME, ".gemini", "settings.json"), shown: "~/.gemini/settings.json" }`; `("codex", "project", root)` → shown `.codex/hooks.json`; with `env = { ...process.env, CODEX_HOME: dir }`, `("codex", "user", root, env)` → `{ abs: join(dir, "hooks.json"), shown: "$CODEX_HOME/hooks.json" }`.
  - `plans new files`: `planHarnessConfig(root, ["gemini", "codex", "codex"], { scope: "project", refresh: false })` gives two entries, Codex first, both `create`, with notes `4 hook event(s)` and `4 hook event(s), context.fileName`, and no `warning`. `JSON.parse(gemini.next)` deep-equals `{ context: { fileName: ["AGENTS.md", "GEMINI.md"] }, hooks: geminiHooks() }`, and `next` ends with `"}\n"` and has no `\r`. Nothing exists on disk until `applyHarnessConfig`; after it, both files exist with exactly `next`.
  - `plans an update, then a skip`: after applying, parse `.codex/hooks.json`, push `{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }` onto `hooks.PreToolUse`, and write it back with 4-space indentation. Planning again gives Codex `skip` with note `baton hooks already present; --refresh-harness rewrites them`, and applying leaves the file byte-identical (the user's formatting survives). Deleting the baton `PreCompact` group by hand gives `update` with note `added PreCompact`.
  - `refuses invalid JSON and writes nothing`: `.gemini/settings.json` = `"{ nope"`. `planHarnessConfig(root, ["codex", "gemini"], …)` rejects with exit 1, a message starting `.gemini/settings.json: not valid JSON` and containing `without comments`, and `.codex/hooks.json` does not exist. A settings file with a `// comment` line is refused the same way.
  - `accepts a BOM`: `.codex/hooks.json` = `BOM + "{}"` plans as `update` with all four events added.
  - `user scope writes an absolute command under BATON_HOME only`: with `{ scope: "user", refresh: false, bundlePath: BUNDLE }`, the entries' `abs` start with `process.env.BATON_HOME`, `shown` starts with `~/`, every baton `command` in `next` starts with `node "/opt/baton/dist/baton.mjs" hook`, and after applying, `<root>/.codex` does not exist. Without `bundlePath` it rejects.
  - `notes an npx bundle`: `bundlePath: "C:\\Users\\u\\AppData\\Local\\npm-cache\\_npx\\abc\\node_modules\\baton-ctx\\dist\\baton.mjs"` gives notes ending with `install baton-ctx globally and run init again`.
  - `warns about the other scope`: apply a user-scope plan for Codex first; then a project-scope plan for Codex has `warning` `~/.codex/hooks.json also has baton hooks; each event would run twice, so remove one of them`. The reverse (project first, then user scope) warns about `.codex/hooks.json`.
- [ ] **Step 3: Run.** `npx vitest run test/harness-config.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `src/core/harness.ts`.
- [ ] **Step 5: Run.** Expected: PASS. Then `npm run check` and `npm run build`.
- [ ] **Step 6: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-jx6.6
  git add src/core/harness.ts test/harness-config.test.ts .context/tasks.jsonl
  git commit -m "feat(core): Codex and Gemini hook config with non-destructive merging" -- src/core/harness.ts test/harness-config.test.ts .context/tasks.jsonl
  ```

---

### Task 9: Embed the skills in the bundle

Item `bt-jx6.7`. Claim it first.

**Files:**
- Modify: `scripts/embed-templates.mjs` (P1 Task 15), `biome.json` (exclude the new generated file)
- Create (generated, committed): `src/core/skills.generated.ts`
- Test: `test/skills-embedded.test.ts`
- Read first: `scripts/embed-templates.mjs`, `src/core/templates.generated.ts`, `test/templates-embedded.test.ts`, ADR 0017

**Interfaces:**
- Consumes (P1 Task 15): `scripts/embed-templates.mjs` walks `templates/` in sorted order and writes `src/core/templates.generated.ts` (`TEMPLATES`, one `JSON.stringify` line per file, BOM stripped, CRLF → LF), printing `embedded <n> template file(s) -> src/core/templates.generated.ts`. `npm run build` runs it first; `npm run embed:templates` runs it alone. `biome.json` excludes `!src/core/templates.generated.ts`. `REPO_ROOT` (P1 Task 3).
- Produces:
  ```ts
  // src/core/skills.generated.ts
  export const SKILLS: Readonly<Record<string, string>>;
  //   keys: the folder names under plugin/skills/, sorted (plain <): today "baton", "checkpoint", "decide", "doc-audit", "handoff", "init-spec"
  //   values: each SKILL.md with one leading BOM stripped and CRLF → LF
  ```

**Rules (pinned):**
- The same script also writes `src/core/skills.generated.ts`, after the templates:
  ```ts
  // Generated by scripts/embed-templates.mjs from plugin/skills/. Do not edit: run `npm run embed:templates`.
  export const SKILLS: Readonly<Record<string, string>> = {
    "baton": "<JSON.stringify(text)>",
    …one line per skill: `  ${JSON.stringify(name)}: ${JSON.stringify(text)},`
  };
  ```
- Each folder under `plugin/skills/` must contain exactly one file, `SKILL.md`. Any other entry → the script prints `embed-templates: plugin/skills/<name> holds more than SKILL.md; embed the extra files or remove them` to stderr and exits 1, so a skill with references never reaches Codex or Gemini half-copied.
- It prints a second line: `embedded <m> skill(s) -> src/core/skills.generated.ts`. LF endings, Biome-clean.
- `biome.json`: add `"!src/core/skills.generated.ts"` to `files.includes`.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-jx6.7 --claim`
- [ ] **Step 2: Write the failing test** `test/skills-embedded.test.ts`: build `{ <folder>: text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n") }` from `plugin/skills/*/SKILL.md` under `REPO_ROOT`, and expect `SKILLS` to equal it exactly; expect `Object.keys(SKILLS)` to be the six names above.
- [ ] **Step 3: Run.** `npx vitest run test/skills-embedded.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 4: Implement** the script change, run `npm run embed:templates`, then edit `biome.json`.
- [ ] **Step 5: Run.** Expected: PASS, and `test/templates-embedded.test.ts` still passes. Then `npm run check` and `npm run build` (the generated files are unchanged by the build's rerun) and `npm run check:bundle`.
- [ ] **Step 6: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-jx6.7
  git add scripts/embed-templates.mjs src/core/skills.generated.ts biome.json test/skills-embedded.test.ts .context/tasks.jsonl
  git commit -m "build: embed plugin skills in the bundle for init" -- scripts/embed-templates.mjs src/core/skills.generated.ts biome.json test/skills-embedded.test.ts .context/tasks.jsonl
  ```

---

### Task 10: `init --harness codex|gemini`

Item `bt-jx6.8`. Claim it first. This replaces Phase 1's exit 3.

**Files:**
- Modify: `src/core/init.ts` (add `"update"` to `InitAction`; add `planAgentSkills`, `applyAgentSkills` and `bundlePathFrom`), `src/commands/init.ts`
- Modify: `test/init.test.ts` (P1 Task 16: replace one test; add the environment setup)
- Test: `test/init-harness.test.ts`
- Read first: `src/core/init.ts`, `src/commands/init.ts`, `test/init.test.ts`, ADR 0024

**Interfaces:**
- Consumes:
  - P1 Task 16, as landed (`src/core/init.ts`): `InitAction { path; action: "create" | "overwrite" | "skip" | "append"; note? }`, `scaffold(root, { force })` (10 paths in a pinned order, LF, `writeFileAtomic`), `parseHarnesses(value): Harness[]` (comma list, `all`, exit 1 on an unknown name, deduped).
  - The landed command (`src/commands/init.ts`): options `--harness <list>` (default `claude`), `--no-hooks`, `--force`. It resolves the root with `resolveExplainRoot(process.cwd(), process.env.BATON_HOME ?? homedir())` (`src/core/explain/root.ts`; never the home folder) and prints `root: <root>` first when that differs from the cwd. It prints one line per action as `` `${action} ${path}${note ? ` (${note})` : ""}` ``, and with `--hooks` (the default) and `claude` selected prints `hooks: Claude Code hooks ship with the baton plugin (plugin/hooks/hooks.json); load it with claude --plugin-dir <baton>/plugin or /plugin install baton@baton-dev`. Today `codex` or `gemini` calls `notImplemented(…)` (exit 3) before writing.
  - Task 8 (`src/core/harness.ts`): `parseScope`, `planHarnessConfig(root, harnesses, { scope, refresh, bundlePath?, env? })` (reads only; throws exit 1 on unparseable config; user scope needs `bundlePath`), `applyHarnessConfig(entries)`, `HarnessPlanEntry { shown, action, note, warning? }`.
  - Task 9: `SKILLS` (`src/core/skills.generated.ts`).
  - The landed test in `test/init.test.ts`: "--harness codex exits 3 before writing anything", and its `withHome(home, fn)` and `freshDir()` helpers.
  - Test helpers: `makeTempDir`, `runGit`, `writeFiles` (P1 Task 3), `runCli` (P1 Task 6); `codexHooks`, `geminiHooks` (Task 8).
- Produces:
  ```ts
  // src/core/init.ts
  export interface InitAction { path: string; action: "create" | "overwrite" | "skip" | "append" | "update"; note?: string }
  export const AGENT_SKILLS_DIR = ".agents/skills";
  export interface SkillCopy { path: string; abs: string; text: string; action: "create" | "overwrite" | "skip" }
  export function planAgentSkills(root: string, opts: { refresh: boolean }): SkillCopy[];
  export function applyAgentSkills(entries: readonly SkillCopy[]): void;
  export function bundlePathFrom(argv1: string | undefined, env?: NodeJS.ProcessEnv): string;
  // CLI: init [--harness <list>] [--scope <project|user>] [--no-hooks] [--force] [--refresh-harness]
  ```

**Rules (pinned):**
- **`planAgentSkills(root, { refresh })`.** One entry per `SKILLS` key, in key order: `path = ".agents/skills/<name>/SKILL.md"`; missing → `create`; existing and `refresh` → `overwrite`; existing otherwise → `skip`. `applyAgentSkills` writes the non-skipped entries (`mkdirSync` of the parent, then `writeFileAtomic`). Skipped entries become init actions with the note `exists; --refresh-harness overwrites`.
- **`bundlePathFrom(argv1, env = process.env)`.** `env.BATON_BUNDLE` when it is a non-empty string (tests and unusual installs set it); otherwise `realpathSync(argv1)`, which follows the symlink a POSIX global install puts on PATH. When `argv1` is missing or the result's base name is not `baton.mjs`, throw `BatonError("--scope user writes the bundle path into the config; run baton from its installed bundle (dist/baton.mjs) or set BATON_BUNDLE")` (exit 1).
- **Flags.** `--force` keeps its Phase 1 meaning: it overwrites the scaffolded `.context/` files and `AGENTS.md`/`CLAUDE.md`, and never touches harness files or skill copies. `--refresh-harness` rewrites baton's own entries in the Codex and Gemini config and overwrites the `.agents/skills/` copies; it touches nothing else. They combine freely.
- **Command, in this order:**
  1. `harnesses = parseHarnesses(o.harness)`; `scope = parseScope(o.scope ?? "project")` (exit 1 on a bad value, before writing).
  2. Resolve `root` exactly as the landed command does, and print `root: <root>` when it differs from the cwd.
  3. `ext` = the selected `codex` and `gemini`. When `ext` is non-empty and `o.hooks`: `plan = await planHarnessConfig(root, ext, { scope, refresh: Boolean(o.refreshHarness), ...(scope === "user" ? { bundlePath: bundlePathFrom(process.argv[1]) } : {}) })`, else `[]`. An unparseable config, or a missing bundle path, rejects here, so **nothing is written**, not even `.context/`.
  4. `actions = await scaffold(root, { force: o.force === true })`.
  5. When `ext` is non-empty: `skills = planAgentSkills(root, { refresh: Boolean(o.refreshHarness) })`, then `applyAgentSkills(skills)`. Skills always go to the project's `.agents/skills/`, whatever `--scope` and `--no-hooks` say.
  6. `applyHarnessConfig(plan)`.
  7. Print the scaffold actions, then the skill actions, then one line per plan entry as `` `${action} ${shown} (${note})` ``, then `warning: <warning>` for each entry that has one.
  8. Then the notes, each on its own line, only for what applies:
     - `claude` with hooks: the Phase 1 `hooks:` line, with `baton@baton-dev` replaced by `baton@baton` (ADR 0025);
     - a Codex entry: `note: Codex runs project hooks only after you trust them: open /hooks in Codex and review the baton entries.` (user scope: `note: Codex runs these hooks only after you review them in /hooks.`);
     - a Gemini entry: `note: Gemini CLI announces new project hooks before their first run; context.fileName now lists AGENTS.md.`;
     - a project-scope Codex or Gemini entry: `note: the hooks call baton from PATH (npm install -g baton-ctx).`; a user-scope one: `note: the hooks call node with this bundle's path; run init again after moving baton.`;
     - user scope with `ext` non-empty: `note: skills go to the project's .agents/skills/, also with --scope user.`
- Remove the `notImplemented` import and call. Option help: `--harness <list>` keeps its text; `--no-hooks` becomes `do not write or print hook setup`; add `--scope <scope>` with `where Codex and Gemini hook config goes: project (default) or user (home folder)` and `--refresh-harness` with `rewrite baton's Codex/Gemini hook entries and .agents/skills copies`.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-jx6.8 --claim`
- [ ] **Step 2: Write the failing tests.** In both files, `beforeEach` sets `process.env.BATON_HOME = makeTempDir("baton-home-")` and `process.env.BATON_BUNDLE = "/opt/baton/dist/baton.mjs"` and deletes `process.env.CODEX_HOME`; `afterEach` restores all three.
  - **`test/init.test.ts`:** replace the landed test "--harness codex exits 3 before writing anything" with "`--harness codex` writes Codex hooks": `runCli(["init", "--harness", "codex"], dir)` exits 0; `.codex/hooks.json` exists; stdout contains `create .codex/hooks.json (4 hook event(s))` and `note: Codex runs project hooks only after you trust them`, and does not contain `hooks: Claude Code hooks ship`. Keep every other landed test (the `withHome` tests set `BATON_HOME` themselves and still pass).
  - **`test/init-harness.test.ts`** (`dir = makeTempDir()` plus `runGit(dir, "init", "-q")` per test):
    - `codex and gemini`: `init --harness codex,gemini` exits 0.
      - `JSON.parse(.codex/hooks.json)` deep-equals `{ hooks: codexHooks() }`, and `.gemini/settings.json` deep-equals `{ context: { fileName: ["AGENTS.md", "GEMINI.md"] }, hooks: geminiHooks() }`;
      - for each `SKILLS` key, `.agents/skills/<name>/SKILL.md` equals `SKILLS[name]`;
      - `.context/spec.md` exists;
      - stdout contains, in this order: `create .context/config.yaml`, `create .agents/skills/baton/SKILL.md`, `create .codex/hooks.json (4 hook event(s))`, `create .gemini/settings.json (4 hook event(s), context.fileName)`, and `note: the hooks call baton from PATH (npm install -g baton-ctx).`
    - `is idempotent`: a second run prints `skip .codex/hooks.json (baton hooks already present; --refresh-harness rewrites them)` and `skip .agents/skills/baton/SKILL.md (exists; --refresh-harness overwrites)`, and both config files are byte-identical.
    - `keeps the user's Gemini settings`: with `init --harness gemini`, a pre-existing `.gemini/settings.json` = `{ "theme": "dark", "context": { "fileName": "GEMINI.md" } }` ends with `theme` `"dark"`, `context.fileName` `["GEMINI.md", "AGENTS.md"]`, all four baton events, and the action line starts with `update .gemini/settings.json (added SessionStart, PreCompress, SessionEnd, BeforeTool; context.fileName now lists AGENTS.md)`.
    - `invalid config writes nothing`: a pre-existing `.gemini/settings.json` = `"{ nope"` gives exit 1, stderr containing `.gemini/settings.json: not valid JSON`, and neither `.context/` nor `.codex/` nor `.agents/` exists afterwards.
    - `--refresh-harness refreshes skills and hooks only`: after a first `init --harness codex`, overwrite `.agents/skills/decide/SKILL.md` with `"x\n"`, set the Codex PreToolUse timeout to 99, and write `"# Mine\n"` to `.context/spec.md`. `init --harness codex --refresh-harness` restores the skill and the timeout, prints `overwrite .agents/skills/decide/SKILL.md` and `update .codex/hooks.json (rewrote SessionStart, PreCompact, SessionEnd, PreToolUse)`, and leaves `.context/spec.md` as `# Mine\n`.
    - `--force keeps its Phase 1 meaning`: in the same setup, `init --harness codex --force` overwrites `.context/spec.md` with the template, but `.agents/skills/decide/SKILL.md` stays `"x\n"`, the timeout stays 99, and the Codex line is `skip .codex/hooks.json (…)`.
    - `--no-hooks`: `init --harness gemini --no-hooks` writes `.agents/skills/` but no `.gemini/settings.json`.
    - `--scope user`: `init --harness codex --scope user` writes `<BATON_HOME>/.codex/hooks.json`, whose every baton `command` starts with `node "/opt/baton/dist/baton.mjs" hook`; it prints `create ~/.codex/hooks.json (4 hook event(s))`, `note: skills go to the project's .agents/skills/, also with --scope user.`, and `<dir>/.codex` does not exist while `<dir>/.agents/skills/baton/SKILL.md` does.
    - `warns about both scopes`: `init --harness codex --scope user`, then `init --harness codex` in the same `dir`, prints `warning: ~/.codex/hooks.json also has baton hooks; each event would run twice, so remove one of them`.
    - `--scope user needs the bundle`: with `BATON_BUNDLE` deleted (under vitest, `process.argv[1]` is not `baton.mjs`), `init --harness codex --scope user` exits 1 with `set BATON_BUNDLE`, and `.context` does not exist afterwards.
    - `--scope global` exits 1 with `unknown scope "global"`, and `.context` does not exist afterwards.
    - `claude stays as it was`: `init` (default harness) creates no `.agents`, `.codex` or `.gemini`, and prints the `hooks:` line ending `or /plugin install baton@baton`.
    - `all`: `init --harness all` prints the `hooks:` line and creates both config files.
    - `bundlePathFrom`: `(undefined, { BATON_BUNDLE: "/x/baton.mjs" })` → `"/x/baton.mjs"`; `(join(REPO_ROOT, "dist", "baton.mjs"), {})` → that path's `realpathSync` when the build exists (skip the assertion otherwise); `(join(REPO_ROOT, "package.json"), {})` → exit 1.
- [ ] **Step 3: Run.** `npx vitest run test/init.test.ts test/init-harness.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run.** Expected: PASS, and `test/skills-e2e.test.ts` still passes. Then `npm run check`, `npm run build` and `npm run check:bundle`.
- [ ] **Step 6: Bundle smoke test.** In a new scratch dir outside the repo (`git init -q` first), with `BATON_HOME` set to another scratch dir in the same shell command's environment and `CODEX_HOME` unset, run `node <repo>/plugin/dist/baton.mjs init --harness codex,gemini`. It creates `.codex/hooks.json`, `.gemini/settings.json` and `.agents/skills/handoff/SKILL.md`, which proves the skills are embedded. Then `node <repo>/plugin/dist/baton.mjs init --harness codex --scope user` writes `<scratch home>/.codex/hooks.json` whose commands name `<repo>/plugin/dist/baton.mjs` with forward slashes. Delete both scratch dirs.
- [ ] **Step 7: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-jx6.8
  git add src/core/init.ts src/commands/init.ts test/init.test.ts test/init-harness.test.ts .context/tasks.jsonl
  git commit -m "feat(init): Codex and Gemini CLI hook config and skills via init --harness" -- src/core/init.ts src/commands/init.ts test/init.test.ts test/init-harness.test.ts .context/tasks.jsonl
  ```

---

### Task 11: Hook smoke test for Codex and Gemini command strings

Item `bt-jx6.9`. Claim it first. This runs on the Windows 11 build machine, with no live session. Its labels run `npm run check` and `npm run smoke:hooks` (warn-only timing).

**Files:**
- Modify: `scripts/hook-smoke.mjs` (P1 Task 18, P2 Task 13)
- Modify: `docs/research/2026-10-16-implementation-notes.md` (§5: one results bullet)
- Read first: `scripts/hook-smoke.mjs`, `src/core/harness.ts` (Task 8), implementation notes §5 (the Windows bullet)

**Interfaces:**
- Consumes:
  - The script as P1 Task 18 and P2 Task 13 left it: a temp project `baton smoke …` (`git init`, `node <repo>/dist/baton.mjs init --no-hooks`, extra files, one commit), every `hooks.json` entry run against two plugin roots, `--runs` (default 5) with medians, functional checks, budgets (1000 ms; 150 ms for PreToolUse and PostToolUse), `--strict-timing`, `--keep`, a header plus a markdown table `| check | plugin root | median ms | budget ms | result |`, and repo timings with plugin root `-`.
  - Task 10: `baton init --harness codex,gemini` writes `.codex/hooks.json` and `.gemini/settings.json` (Task 8 shapes; each project handler's `command` is `baton hook <event> --harness <h>`); `init --harness codex --scope user` writes `<BATON_HOME>/.codex/hooks.json` whose commands are `node "<BATON_BUNDLE, forward slashes>" hook <event> --harness codex`.
  - Task 7: Codex no-ops print `""`; Gemini no-ops print `{}`; Codex denies render `hookSpecificOutput.permissionDecision: "deny"`; Gemini denies render `{ decision: "deny", reason }`.
- Produces: `npm run smoke:hooks` covering Codex and Gemini (same flags).

**Script changes (pinned):**
1. **Setup.** `home = join(tmp, "home")`; `bundle = join(<repo>, "dist", "baton.mjs")`. Every child process the script starts gets `env.BATON_HOME = home`, `env.BATON_BUNDLE = bundle`, and no `CODEX_HOME`. Directly after the existing `init --no-hooks` and before the commit, run `node <bundle> init --harness codex,gemini` in `project`, then `node <bundle> init --harness codex --scope user` in `project`; exit 0 is a functional check for both, and so is the existence of `.codex/hooks.json`, `.gemini/settings.json`, `.agents/skills/baton/SKILL.md` and `<home>/.codex/hooks.json`. The commit then includes the project files. (The second init prints the both-scopes warning; that is expected.)
2. **PATH shim** (simulates a global install without `npm link`). `shim = join(tmp, "shim")`.
   - win32: write `join(shim, "baton.cmd")` = `@echo off\r\nnode "<bundle>" %*\r\n` and `join(shim, "baton.ps1")` = `& node "<bundle>" @args\r\n` (npm installs both).
   - otherwise: write `join(shim, "baton")` = `#!/bin/sh\nexec node "<bundle>" "$@"\n`, then `chmodSync(…, 0o755)`.
   - `pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH"`; `harnessEnv = { ...process.env, [pathKey]: shim + delimiter + (process.env[pathKey] ?? ""), BATON_HOME: home, BATON_BUNDLE: bundle, CLAUDE_CONFIG_DIR: join(tmp, "claude-config") }`, with `CODEX_HOME` deleted.
3. **Cases.** For each row, read the config named in the row, take the event's baton handler (the command contains `baton hook` or `baton.mjs" hook`), and run its `command` string `--runs` times with `spawnSync(command, { shell: true, cwd: project, input: JSON.stringify(stdin), encoding: "utf8", env: harnessEnv })`. Every stdin has `hook_event_name` (shown per row), `session_id: "smoke"` and `cwd: project`; Codex rows add `model: "smoke"`; Gemini rows add `timestamp: "2026-10-23T00:00:00Z"`; tool rows add `turn_id: "t1"` and `tool_use_id: "u1"`.

   | Check | Config, event | stdin extras | Functional check | Budget ms |
   |---|---|---|---|---|
   | `codex SessionStart` | project Codex, SessionStart | `hook_event_name: "SessionStart", source: "startup"` | `hookSpecificOutput.additionalContext` starts with `# baton mission brief` | 1000 |
   | `codex PreCompact` | project Codex, PreCompact | `hook_event_name: "PreCompact", trigger: "manual"` | stdout `""`; STATE.md has `generated_by: baton handoff` | 1000 |
   | `codex SessionEnd` | project Codex, SessionEnd | `hook_event_name: "SessionEnd", reason: "other"` | stdout `""`; the **maximum** over all runs is below 2500 (Codex's 3 s cap, with a margin) | 1000 |
   | `codex PreToolUse Bash deny` | project Codex, PreToolUse | `hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "echo x > .context/tasks.jsonl" }` | `permissionDecision === "deny"` | 150 |
   | `codex PreToolUse apply_patch deny` | project Codex, PreToolUse | `hook_event_name: "PreToolUse", tool_name: "apply_patch", tool_input: { command: "*** Begin Patch\n*** Update File: .context/STATE.md\n@@\n-a\n+b\n*** End Patch" }` | deny | 150 |
   | `codex PreToolUse Bash allow` | project Codex, PreToolUse | `hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" }` | stdout `""` | 150 |
   | `codex PreToolUse Bash deny (user scope)` | user Codex (`<home>/.codex/hooks.json`), PreToolUse | as the Bash deny row | deny; this is the absolute-`node` fallback form of ADR 0024, with no shim | 150 |
   | `gemini SessionStart` | project Gemini, SessionStart | `hook_event_name: "SessionStart", source: "startup"` | `additionalContext` starts with `# baton mission brief` | 1000 |
   | `gemini PreCompress` | project Gemini, PreCompress | `hook_event_name: "PreCompress", trigger: "manual"` | stdout `"{}"` | 1000 |
   | `gemini SessionEnd` | project Gemini, SessionEnd | `hook_event_name: "SessionEnd", reason: "exit"` | stdout `"{}"` | 1000 |
   | `gemini BeforeTool write_file deny` | project Gemini, BeforeTool | `hook_event_name: "BeforeTool", tool_name: "write_file", tool_input: { file_path: join(project, ".context", "STATE.md"), content: "x" }` | `decision === "deny"` | 150 |
   | `gemini BeforeTool shell allow` | project Gemini, BeforeTool | `hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command: "ls" }` | stdout `"{}"` | 150 |

   Every run must also exit 0 with empty stderr. Rows print with plugin root `- (shell + PATH shim)`, or `- (shell, absolute node)` for the user-scope row. Over-budget medians print `WARN` (exit 1 only with `--strict-timing`), except the Codex SessionEnd maximum, which is always a functional failure.
4. **PowerShell rows (win32 only, informational).** Run the `codex PreToolUse Bash deny` and `gemini SessionStart` commands once more each through `spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], { cwd: project, input, encoding: "utf8", env: harnessEnv })`, `--runs` times. They have the same functional checks, but a failure never fails the script: the row's result is `ok` or `WARN: <first stderr line>` (for example the execution policy refusing `baton.ps1`, implementation notes §5), and the median is still printed. Plugin root `- (PowerShell + PATH shim)`. Caveat: the pinned `baton.ps1` (`& node "<bundle>" @args`) is a stand-in, not npm's generated shim, which pipes `$input` into node; a WARN here may be an artefact of the stand-in, and Step 4 records it as such.
5. **Unchanged:** every existing case, flag, repo timing and the cleanup (`tmp` includes `home` and `shim`).

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-jx6.9 --claim`
- [ ] **Step 2: Edit the script** per the pinned changes. It stays Biome-clean.
- [ ] **Step 3: Run.** `npm run build`, then `npm run smoke:hooks -- --strict-timing`.
  - Expected: every functional check passes. Record the header, the new rows and the PowerShell rows' results.
  - If a 150 ms row misses its budget, do **not** loosen it. Record the numbers and create a task: `node dist/baton.mjs task create "Codex or Gemini pre-tool-use over budget through a shell: <case> <n> ms" -p 2 --spec hooks --deps discovered-from:bt-jx6.9 -d "Measured by npm run smoke:hooks with a PATH shim. ADR 0024 names the fallbacks: the user-scope absolute node command (see its own smoke row) and a commandWindows entry for Codex. Changing the project command form needs a superseding decision."`. Then run `npm run smoke:hooks` without the flag and continue.
- [ ] **Step 4: Record the results.** In §5 of the implementation notes, directly after the Windows bullet, add: "Codex and Gemini command strings, run through `spawnSync(…, { shell: true })` with a PATH shim for `baton` (simulating a global install): all functional checks pass; medians <rows: check = ms>; the user-scope absolute `node` form: <ms>; PowerShell rows: <ok or the warning> (the smoke shim's `baton.ps1` is a one-line `& node … @args`, not npm's generated shim, which also pipes `$input` to node, so a WARN on these rows may come from the stand-in shim rather than from baton or the execution policy). 🟡 simulated <the actual run date>, Windows 11 <os.release()>, Node <version>; not yet observed in a live Codex or Gemini session (`bt-jx6.19`, `bt-jx6.20`)." Fill every `<…>` from the run.
- [ ] **Step 5: Verify.** `npm run check`. Expected: PASS.
- [ ] **Step 6: Close through `verify`, then commit.**
  ```bash
  # runs npm run check and npm run smoke:hooks: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-jx6.9
  git add scripts/hook-smoke.mjs docs/research/2026-10-16-implementation-notes.md .context/tasks.jsonl
  git commit -m "test(hooks): smoke-test Codex and Gemini hook command strings through a shell" -- scripts/hook-smoke.mjs docs/research/2026-10-16-implementation-notes.md .context/tasks.jsonl
  ```

---

### Task 12: Skills cross-harness static check

Item `bt-jx6.10`. Claim it first. Its labels run `npm run check` and `npm run validate:skills`. No Codex or Gemini install and no live session: the live check is `bt-jx6.21`.

**Files:**
- Create: `test/skills-harness.test.ts`
- Modify: `plugin/skills/baton/SKILL.md` (one sentence), `src/core/skills.generated.ts` (regenerated by `npm run embed:templates`)
- Read first: every `plugin/skills/*/SKILL.md`, `scripts/validate-skills.mjs`, `src/program.ts`, implementation notes §3

**Interfaces:**
- Consumes:
  - `buildProgram()` (`src/program.ts`): the command tree. Each command exposes `.commands` (subcommands, with `.name()` and `.aliases()`) and `.options` (each with `.long` such as `--add-labels` or `--no-diff`, and `.short` such as `-t`). Global options are `-V, --version` and `-h, --help`.
  - `scripts/validate-skills.mjs`: spec keys only (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`), `name` equal to the folder, description 1–1024 characters, under 500 lines; exit 0 when all pass.
  - Task 9: `SKILLS` must equal the plugin skills (`test/skills-embedded.test.ts`).
  - Implementation notes §3: Codex discovers `.agents/skills`, Gemini CLI `.gemini/skills` or `.agents/skills`; non-spec keys are a hard error outside Claude Code.
- Produces: the static check, and a harness-neutral `/baton` skill.

**Check algorithm (pinned), per skill file:**
1. **Calls.** Collect every inline-code span matching `` /`(baton(?: [^`]+)?)`/g `` (group 1), plus every line inside fenced code blocks whose trimmed text starts with `baton ` (the trimmed line). Each skill must yield at least one call.
2. **Words.** `call.match(/"[^"]*"|'[^']*'|\S+/g)`, dropping the leading `baton`. Strip leading `[` or `(` and trailing `]` or `)` from each word.
3. **Placeholders.** A bare `` `baton` `` (no words after it) is ok. A first word of `$ARGUMENTS`, or one starting with `<`, ends the check for that call (ok).
4. **Walk.** Start at the program. For each word in order:
   - a word starting with `-`: take the part before `=`; it is valid when it is `--help`, `-h`, `--version` or `-V`, or equals the `long` or `short` of an option of the current command **or of any of its ancestors** (so `--actor`, declared on `task`, is valid in `baton task update x --actor bob`); otherwise the problem is `` `<call>`: <command path> has no option <flag> ``;
   - any other word, while no argument has been seen yet: when the current command has a subcommand with that name or alias, descend into it; otherwise it is an argument, and descending stops for the rest of the call.
   The first non-flag word must name a subcommand of the program; otherwise the problem is `` `<call>`: unknown command <word> ``.
5. **Harness-neutral text.** The file contains neither `CLAUDE_PLUGIN_ROOT` nor `${`.
6. The test collects every problem and asserts the list is empty, so one run reports them all.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-jx6.10 --claim`
- [ ] **Step 2: Write the failing test** `test/skills-harness.test.ts`:
  - `every skill's CLI calls exist`: run the algorithm over all six skills; `problems` equals `[]`. The walker must also report these hand-made calls (a separate `it`, calling the checker function directly): `baton task update x --bogus` → `has no option --bogus`; `baton nope` → `unknown command nope`; `baton explain thing [--as caveman]` → ok; `baton $ARGUMENTS` → ok; `baton --help` → ok; `baton` → ok; `baton task update x --actor bob` → ok; `baton task update x --as y` → `has no option --as`.
  - `skills use spec keys only`: `spawnSync(process.execPath, ["scripts/validate-skills.mjs"], { cwd: REPO_ROOT, encoding: "utf8" })` exits 0.
  - `skills are harness-neutral`: rule 5 holds for every skill, and `plugin/skills/baton/SKILL.md` contains `or in Codex and Gemini CLI the words the user gave with the request, which the steps below also call`.
  - `the embedded copy matches`: `SKILLS.baton` equals the file on disk (normalised).
- [ ] **Step 3: Run.** `npx vitest run test/skills-harness.test.ts`. Expected: FAIL on the missing sentence; any CLI-call problems it lists are real.
- [ ] **Step 4: Fix.**
  - In `plugin/skills/baton/SKILL.md`, under `## Routing`, replace the sentence ``Take the first word of `$ARGUMENTS`.`` with the single sentence: ``Take the first word of the arguments: `$ARGUMENTS` in Claude Code, or in Codex and Gemini CLI the words the user gave with the request, which the steps below also call `$ARGUMENTS`.`` That keeps every later `baton $ARGUMENTS` meaningful in all three harnesses, while the Explain procedure still splits those same arguments into the CLI part and the writer instructions (the explain track's rule). Keep the frontmatter and every other line.
  - For each reported problem: if a skill names a flag or command that does not exist, change the skill text to the real one (frontmatter unchanged). If the walker is wrong about a real flag, fix the walker. Never delete a call to make the test pass.
  - Run `npm run embed:templates`.
- [ ] **Step 5: Run.** Expected: PASS. Then `npm run validate:skills` (a `✓` per skill), `npm run check` and `npm run build`.
- [ ] **Step 6: Close through `verify`, then commit.** Add any other skill files you changed to both path lists.
  ```bash
  # runs npm run check and npm run validate:skills: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-jx6.10
  git add plugin/skills/baton/SKILL.md src/core/skills.generated.ts test/skills-harness.test.ts .context/tasks.jsonl
  git commit -m "test(skills): static cross-harness check of every skill's CLI calls" -- plugin/skills/baton/SKILL.md src/core/skills.generated.ts test/skills-harness.test.ts .context/tasks.jsonl
  ```

---

### Task 13: Publish-ready package metadata and plugin manifests

Item `bt-jx6.11`. Claim it first. Editing `package.json` may add PreToolUse preflight context from Phase 2's guard; ADR 0025 is the decision it asks for.

**Files:**
- Modify: `package.json`, `package-lock.json`, `plugin/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
- Create: `.claude-plugin/plugin.json`, `CHANGELOG.md`
- Test: `test/package.test.ts`
- Read first: `package.json`, both plugin manifests, `.claude-plugin/marketplace.json`, LICENSE, implementation notes §2 and §11, ADR 0025

**Interfaces:**
- Consumes:
  - `package.json` today: name `baton-ctx`, version `0.0.0`, `private: true`, `bin.baton = "dist/baton.mjs"`, `files: ["THIRD_PARTY_NOTICES.md", "dist", "templates", "plugin"]`, `engines.node >=22.13`, the scripts (including Task 6's `check:bundle` and Phases 1–2's `embed:templates` and `smoke:hooks`), runtime `dependencies` on `@modelcontextprotocol/server`, `commander`, `yaml` and `zod`.
  - `tsup.config.ts` bundles every import (`noExternal: [/.*/]`), so `dist/` needs no `node_modules` at runtime (ADR 0002).
  - `plugin/hooks/hooks.json` runs `node ${CLAUDE_PLUGIN_ROOT}/dist/baton.mjs hook <event>`.
  - The git remote: `https://github.com/NIGHTFURY609/baton.git`.
- Produces: the publish shape below.

**Pinned content:**
- **`package.json`.** Keep `name`, `description`, `type`, `bin`, `engines`, `license` and every script. Then:
  - remove `private`; set `"version": "0.1.0"`;
  - add `"keywords": ["coding-agents", "claude-code", "codex", "gemini-cli", "agent-skills", "mcp", "hooks", "continuity", "handoff", "context"]`, `"author": "baton contributors"`, `"homepage": "https://github.com/NIGHTFURY609/baton#readme"`, `"bugs": { "url": "https://github.com/NIGHTFURY609/baton/issues" }`, `"repository": { "type": "git", "url": "git+https://github.com/NIGHTFURY609/baton.git" }`, `"publishConfig": { "access": "public" }`;
  - `"files": ["dist/*.mjs", ".claude-plugin/plugin.json", "plugin/hooks/hooks.json", "plugin/skills/", "CHANGELOG.md", "THIRD_PARTY_NOTICES.md"]`;
  - move the four runtime dependencies into `devDependencies` (same version ranges, keys sorted) and remove the `dependencies` key;
  - add the script `"prepublishOnly": "npm run check && npm run build && npm run check:bundle && npm run check:pack"` (`check:pack` lands in Task 14; nothing in this plan runs `npm publish`).
- **`package-lock.json`.** Run `npm install --package-lock-only --ignore-scripts --offline --no-audit --no-fund --no-update-notifier`. If it fails (it may need the network), edit the lockfile by hand instead: set `version` to `0.1.0` at the top level and in `packages[""]`; in `packages[""]`, move the four names from `dependencies` into `devDependencies` and delete the empty `dependencies`; add `"dev": true` to the entries `node_modules/@modelcontextprotocol/server`, `node_modules/@modelcontextprotocol/core`, `node_modules/yaml`, `node_modules/zod` and `node_modules/commander`. Either way, `npm ls --all --no-update-notifier` must exit 0 with no `invalid`, `missing` or `extraneous`, and `npm ls --omit=dev --no-update-notifier` must list only the root line.
- **`plugin/.claude-plugin/plugin.json`:**
  ```json
  {
    "name": "baton",
    "displayName": "baton",
    "version": "0.1.0",
    "description": "Continuity layer for coding agents: a budgeted, freshness-checked brief at session start and hook-generated handoffs.",
    "author": { "name": "baton contributors" },
    "homepage": "https://github.com/NIGHTFURY609/baton#readme",
    "repository": "https://github.com/NIGHTFURY609/baton",
    "license": "MIT",
    "keywords": ["memory", "continuity", "handoff", "context", "hooks"]
  }
  ```
- **`.claude-plugin/plugin.json`** (new; the package root as plugin root): the same object plus, at the end, `"skills": "./plugin/skills/"` and `"hooks": "./plugin/hooks/hooks.json"`.
- **`.claude-plugin/marketplace.json`:**
  ```json
  {
    "name": "baton",
    "owner": { "name": "baton contributors", "url": "https://github.com/NIGHTFURY609/baton" },
    "description": "The baton continuity plugin for Claude Code.",
    "plugins": [
      {
        "name": "baton",
        "source": { "source": "npm", "package": "baton-ctx", "version": "^0.1.0" },
        "description": "Continuity layer for coding agents: a budgeted, freshness-checked brief at session start and hook-generated handoffs.",
        "category": "productivity",
        "tags": ["memory", "continuity", "handoff", "hooks", "skills"]
      }
    ]
  }
  ```
- **`CHANGELOG.md`:**
  ```markdown
  # Changelog

  All notable changes to `baton-ctx` are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

  ## [0.1.0] - Unreleased

  First release candidate, not yet published to npm.

  ### Added

  - The task store (`baton task`, `baton remember`) and `baton explain`.
  - `baton mission`, `handoff`, `drift`, `verify-doc`, `stats` and `init`: the budgeted session brief, generated STATE.md, section freshness and session metrics.
  - `baton decide`, `verify` and `compile`, and the PreToolUse, PostToolUse and opt-in Stop hooks.
  - `baton search`, and `baton mcp`: an optional MCP adapter with four read-only tools (ADR 0023).
  - `baton init --harness codex|gemini`: Codex and Gemini CLI hook config and the skills in `.agents/skills/` (ADR 0024).
  - `baton bench`: a paired A/B harness over session transcripts (ADR 0026).

  ### Packaging

  - One self-contained bundle and no runtime dependencies; bundled third-party code is listed in THIRD_PARTY_NOTICES.md (ADR 0025).
  - The npm package is also a Claude Code plugin root, so the `baton` marketplace entry installs it from npm.
  ```
- **`src/commands/init.ts` is not touched here:** Task 10 already prints `baton@baton`.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-jx6.11 --claim`
- [ ] **Step 2: Write the failing tests** in `test/package.test.ts` (static: read the JSON files under `REPO_ROOT`):
  - `package.json`: no `private`; `version` matches `/^\d+\.\d+\.\d+$/`; `bin` equals `{ baton: "dist/baton.mjs" }`; `engines.node` is `">=22.13"`; `dependencies` is absent; `devDependencies` has `@modelcontextprotocol/server`, `commander`, `yaml` and `zod`; `files` equals the pinned array; `license` is `"MIT"`; `publishConfig.access` is `"public"`; `repository.url` is `"git+https://github.com/NIGHTFURY609/baton.git"`; `keywords.length` ≥ 5; `scripts.prepublishOnly` contains `check:pack`.
  - `the two plugin manifests agree`: the root `.claude-plugin/plugin.json` minus `skills` and `hooks` deep-equals `plugin/.claude-plugin/plugin.json`; root `skills` is `"./plugin/skills/"` and `hooks` is `"./plugin/hooks/hooks.json"`; both versions equal `package.json`'s.
  - `the marketplace installs the package from npm`: `name` is `"baton"`; exactly one plugin, named `"baton"`; its `source` equals `{ source: "npm", package: <package name>, version: "^" + <package version> }`; it has no `version` key (plugin.json wins).
  - `the manifest paths exist`: `plugin/skills/` and `plugin/hooks/hooks.json` exist under `REPO_ROOT`, and the root has no `bin/` folder (claude.ai and Cowork refuse plugins that ship one, implementation notes §2).
  - `CHANGELOG.md`'s first `## ` line is `## [<version>] - Unreleased`.
  - `the MCP server reports the package version`: `(await connectInMemory(createServer())).serverInfo` (Task 5) equals `{ name: "baton", version: <package version> }`; close the client afterwards.
- [ ] **Step 3: Run.** `npx vitest run test/package.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the pinned content, including the lockfile step and its `npm ls` checks.
- [ ] **Step 5: Run.** Expected: PASS, and `test/explain*.test.ts` still pass (explain indexes `devDependencies` too). Then `npm run check`, `npm run build` and `npm run check:bundle`. Smoke test: `node dist/baton.mjs --version` prints `0.1.0`.
- [ ] **Step 6: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-jx6.11
  git add package.json package-lock.json plugin/.claude-plugin/plugin.json .claude-plugin/plugin.json .claude-plugin/marketplace.json CHANGELOG.md test/package.test.ts .context/tasks.jsonl
  git commit -m "build: publish-ready baton-ctx 0.1.0 with an npm plugin source" -- package.json package-lock.json plugin/.claude-plugin/plugin.json .claude-plugin/plugin.json .claude-plugin/marketplace.json CHANGELOG.md test/package.test.ts .context/tasks.jsonl
  ```

---

### Task 14: Bundled-code notices and the npm pack check

Item `bt-jx6.12`. Claim it first. Its labels run `npm run check` and `npm run check:pack`.

**Files:**
- Create: `scripts/third-party.mjs`, `scripts/pack-check.mjs`
- Modify: `THIRD_PARTY_NOTICES.md` (a generated section), `package.json` (scripts `notices` and `check:pack`), `.github/workflows/ci.yml` (one step)
- Test: `test/notices.test.ts`
- Read first: `THIRD_PARTY_NOTICES.md`, `scripts/bundle-check.mjs` (Task 6, metafile shape), `package.json` (Task 13), implementation notes §11, ADR 0025

**Interfaces:**
- Consumes:
  - Task 6: `dist/metafile-esm.json`; output `inputs` keys such as `node_modules/zod/index.js` or `node_modules/@modelcontextprotocol/core/dist/index.mjs`; `node scripts/bundle-check.mjs` (fails on any non-built-in external import).
  - The build's source maps `dist/*.mjs.map` (`sourcemap: true` in `tsup.config.ts`; never packed): their `sources` arrays also list the files the MCP SDK inlined into its own `dist/`, as paths such as `../node_modules/node_modules/.pnpm/ajv@8.18.0/node_modules/ajv/dist/core.js` and `../node_modules/@modelcontextprotocol/core-internal/src/shared/protocol.ts` (implementation notes §11).
  - Task 13: `package.json` `files`, `version`, `bin`; `.claude-plugin/plugin.json`.
  - Task 5: `baton mcp` serves stdio (newline-delimited JSON-RPC).
  - The installed packages under `node_modules/<name>/`: `package.json` (`version`, `license`, `repository`, `homepage`) and a license file.
- Produces: `npm run notices` (`node scripts/third-party.mjs`), `node scripts/third-party.mjs --check`, `npm run check:pack` (`node scripts/pack-check.mjs`).

**`scripts/third-party.mjs` (pinned):**
1. **Inputs.** Read `dist/metafile-esm.json` and every `dist/*.mjs.map` (missing → exit 1, `run npm run build first`).
2. **Package names.** From a path (with `\` → `/`): split on `/`, find the **last** index `i` where the segment is `node_modules` and segment `i + 1` exists and does not start with `.`; the name is segment `i + 1`, or `segment i + 1` + `/` + `segment i + 2` when segment `i + 1` starts with `@`. No such index → not a package. (The last `node_modules` matters: the SDK's paths contain `node_modules/node_modules/.pnpm/<pnpm segment>/node_modules/<name>/`.) **Vendored version:** when a `.pnpm` segment precedes the name, take the segment right after `.pnpm`; it must start with `<encoded name>@`, where the encoded name writes a scoped name's `/` as `+` (`@scope/pkg` → `@scope+pkg`); the version is the text after that prefix, up to the first `_` or `(` or the end of the segment. Peer suffixes are therefore ignored: `ajv-formats@3.0.1_ajv@8.18.0` gives `3.0.1`, never `8.18.0`. A segment that does not start with the prefix is an error (exit 1, `cannot read the version of <name> from .pnpm/<segment>`). The script exposes this rule as `node scripts/third-party.mjs --pnpm-version <segment> <name>`, which prints the version and exits 0 (or exits 1 with that message), for the tests.
3. **Installed packages:** the names found in the metafile's input keys. **Vendored packages:** the names found in the source maps that are not installed packages.
4. **Installed entries.** For each: `version` and `license` from its `package.json`; `source` from `repository.url` (or `repository` when it is a string), else `homepage`, else `n/a`, normalised: `github:owner/repo` and a bare `owner/repo` become `https://github.com/owner/repo`; `git@github.com:owner/repo` becomes `https://github.com/owner/repo`; a leading `git+` is removed, `git://` becomes `https://`, and a trailing `.git` is removed. License text: the first file in the package folder matching `/^(licen[cs]e|copying)(\.(md|txt))?$/i` (a missing file is an error: exit 1, `<name> has no license file`); a `NOTICE` file's text is added when one exists.
5. **Vendored entries** come from a pinned `VENDORED` table in the script, because these packages are not installed. Each entry: `version`, `license` (SPDX), `source`, `copyright`. The license text is built from the standard SPDX text of `MIT` or `BSD-3-Clause` with the copyright line filled in. Pinned table (🟡, reconstructed; `bt-jx6.25` compares them with upstream):

   | Name | Version | License | Source | Copyright |
   |---|---|---|---|---|
   | `ajv` | 8.18.0 | MIT | https://github.com/ajv-validator/ajv | `Copyright (c) 2015-2021 Evgeny Poberezkin` |
   | `ajv-formats` | 3.0.1 | MIT | https://github.com/ajv-validator/ajv-formats | `Copyright (c) 2020 Evgeny Poberezkin` |
   | `content-type` | 1.0.5 | MIT | https://github.com/jshttp/content-type | `Copyright (c) 2015 Douglas Christopher Wilson` |
   | `fast-deep-equal` | 3.1.3 | MIT | https://github.com/epoberezkin/fast-deep-equal | `Copyright (c) 2017 Evgeny Poberezkin` |
   | `fast-uri` | 3.1.0 | BSD-3-Clause | https://github.com/fastify/fast-uri | `Copyright (c) 2011-2021, Gary Court; Copyright (c) 2021-present The Fastify team` |
   | `json-schema-traverse` | 1.0.0 | MIT | https://github.com/epoberezkin/json-schema-traverse | `Copyright (c) 2017 Evgeny Poberezkin` |
   | `@modelcontextprotocol/core-internal` | (the server's version) | as `@modelcontextprotocol/server` | https://github.com/modelcontextprotocol/typescript-sdk | covered by the `@modelcontextprotocol/server` entry; no separate text |

   A vendored name missing from the table → exit 1 with `<name> is bundled (seen in the source maps) but not in the VENDORED table of scripts/third-party.mjs`. A table version that differs from the `.pnpm` version → exit 1 with `VENDORED <name> says <a> but the bundle has <b>`. Both rules apply in default mode and in `--check`.
6. **The generated block,** LF:
   ````markdown
   <!-- bundled:start -->
   ## Bundled dependencies

   The npm package bundles the packages below into `dist/`; nothing else is installed with it. Generated by `npm run notices` from the build metafile and source maps.

   ### <name>

   - Version: <version>
   - License: <license>
   - Source: <source>

   ```text
   <license text, trimmed>
   ```
   <!-- bundled:end -->
   ````
   Installed packages first, then vendored ones, each group sorted with plain `<`. A NOTICE adds a second `text` block after the license. A vendored section adds, after `Source`, the lines `- Bundled inside: the build of @modelcontextprotocol/server (not installed separately)` and `- License text: reconstructed from the SPDX license and the upstream copyright line`. The `core-internal` section has no `text` block, only `- License: covered by @modelcontextprotocol/server above`.
7. **Default mode:** replace the text from `<!-- bundled:start -->` through `<!-- bundled:end -->` in `THIRD_PARTY_NOTICES.md` with the block, or append `"\n" + block + "\n"` when the markers are missing. The Beads section stays above. Print `notices: <i> installed and <v> vendored package(s) -> THIRD_PARTY_NOTICES.md`.
8. **`--check`:** compare the block with the file's current block (after normalising CRLF); different or missing → stderr `THIRD_PARTY_NOTICES.md is out of date; run npm run notices`, exit 1; equal → `notices: up to date (<i> installed, <v> vendored)`, exit 0.

**`scripts/pack-check.mjs` (pinned):**
1. Require `dist/baton.mjs` and `dist/metafile-esm.json`, else exit 1 with `run npm run build first`.
2. `out = JSON.parse(execSync("npm pack --dry-run --json --ignore-scripts --offline --no-update-notifier", { cwd: repo, encoding: "utf8" }))[0]`.
3. **Exact file list.** `actual` = `out.files.map((f) => f.path.replace(/\\/g, "/"))`, sorted. `expected` = `CHANGELOG.md`, `LICENSE`, `README.md`, `THIRD_PARTY_NOTICES.md`, `package.json`, `.claude-plugin/plugin.json`, `plugin/hooks/hooks.json`, `plugin/skills/<folder>/SKILL.md` for every folder on disk, and `dist/<file>` for every `*.mjs` in `dist/`, sorted. Different → print `missing: …` and `extra: …` lines and exit 1.
4. **Size.** `out.size` ≤ 900,000 and `out.unpackedSize` ≤ 3,500,000, else exit 1 naming the value and the cap.
5. **Self-contained.** Spawn `node scripts/bundle-check.mjs`; its failure fails the check. (The unpacked copy below lives in the OS temp folder, which sits under the home folder and its `node_modules`, so only the metafile's external-import rule proves nothing resolves from there.)
6. **Unpack smoke.** `tmp = mkdtempSync(join(tmpdir(), "baton-pack-"))`.
   - `execSync(\`npm pack --ignore-scripts --offline --no-update-notifier --pack-destination "${tmp}"\`, { cwd: repo })`, then extract `baton-ctx-<version>.tgz` into `tmp` with `execFileSync(tar, ["-xzf", tgz, "-C", tmp])`, where `tar` is `join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")` on win32 when that file exists, else `"tar"`.
   - `bundle = join(tmp, "package", "dist", "baton.mjs")`. No `node_modules` exists anywhere under `tmp`.
   - `node <bundle> --version` prints the package version.
   - In `project = join(tmp, "project")` (created, then `git -c init.defaultBranch=main init -q`): `node <bundle> init --no-hooks` (with `env.BATON_HOME = join(tmp, "home")` and no `CODEX_HOME`) exits 0 and creates `.context/spec.md`.
   - `node <bundle> hook session-start` with stdin `{"hook_event_name":"SessionStart","source":"startup","cwd":<project>}` prints JSON whose `additionalContext` starts with `# baton mission brief`.
   - **Stdio MCP:** spawn `node <bundle> mcp --root <project>`, write `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"pack-check","version":"0"}}}\n`, then, after the id-1 response line arrives, `{"jsonrpc":"2.0","method":"notifications/initialized"}\n` and `{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n`. Read stdout line by line until the id-2 response; its tool names must be `mission, preflight, drift, search`. Then end stdin. A 15 s timeout kills the process and fails the check.
   - `.claude-plugin/plugin.json` exists under `tmp/package` and its `hooks` path resolves to an existing file there.
   - Remove `tmp`.
7. Spawn `node scripts/third-party.mjs --check`; its failure fails the check.
8. On success print `pack: <n> files, <size> bytes packed, <unpacked> unpacked; self-contained; unpacked bundle, hook and MCP stdio ok; notices up to date` and exit 0.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-jx6.12 --claim`
- [ ] **Step 2: Write the failing test** `test/notices.test.ts` (static): `THIRD_PARTY_NOTICES.md` contains `## Beads`, `<!-- bundled:start -->`, `<!-- bundled:end -->`; the headings `### @modelcontextprotocol/core`, `### @modelcontextprotocol/server`, `### commander`, `### yaml`, `### zod`, `### ajv`, `### ajv-formats`, `### content-type`, `### fast-deep-equal`, `### fast-uri`, `### json-schema-traverse` and `### @modelcontextprotocol/core-internal`; the texts `Apache License`, `MIT License` and `BSD-3-Clause`; and every line starting `- Source: ` continues with `https://` or `n/a`. Plus a `.pnpm` version test that spawns `node scripts/third-party.mjs --pnpm-version <segment> <name>` (no build needed): `ajv-formats@3.0.1_ajv@8.18.0` with `ajv-formats` prints `3.0.1`; `ajv@8.18.0` with `ajv` prints `8.18.0`; `fast-uri@3.1.0` with `fast-uri` prints `3.1.0`; `@scope+pkg@1.2.3(peer@1.0.0)` with `@scope/pkg` prints `1.2.3`; `ajv@8.18.0` with `ajv-formats` exits 1 with `cannot read the version of ajv-formats`.
- [ ] **Step 3: Run.** `npx vitest run test/notices.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** both scripts and the npm scripts. Run `npm run build`, then `npm run notices`; read the generated block. It must name the five installed packages and the seven vendored entries of implementation notes §11. If the scan finds more, they are bundled too: add them to `VENDORED` (version from the `.pnpm` path, SPDX and copyright from your best knowledge, marked in §11 as reconstructed) and update §11's bullets with the real list.
- [ ] **Step 5: Add CI.** In `.github/workflows/ci.yml`, after the `npm run check:bundle` step, add `- run: npm run check:pack`. (`compile --check`, P2 Task 15, stays where it is.)
- [ ] **Step 6: Run.** `npx vitest run test/notices.test.ts` (PASS), `npm run check`, `npm run build`, `npm run check:bundle`, then `npm run check:pack`. Expected: one `pack:` line, exit 0. If the file list or size fails, fix `files` in `package.json` (Task 13's list is the target), never the expectation; if the unpack smoke or the self-contained check fails, the bundle is not self-contained: find the runtime import and bundle it.
- [ ] **Step 7: Close through `verify`, then commit.**
  ```bash
  # runs npm run check and npm run check:pack: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-jx6.12
  git add scripts/third-party.mjs scripts/pack-check.mjs THIRD_PARTY_NOTICES.md package.json .github/workflows/ci.yml test/notices.test.ts .context/tasks.jsonl
  git commit -m "build: notices for installed and vendored bundled code, and an npm pack check" -- scripts/third-party.mjs scripts/pack-check.mjs THIRD_PARTY_NOTICES.md package.json .github/workflows/ci.yml test/notices.test.ts .context/tasks.jsonl
  ```

---

### Task 15: Benchmark core: per-task pairing, sign test, gate

Item `bt-jx6.13`. Claim it first.

**Files:**
- Create: `src/core/bench.ts`
- Test: `test/bench.test.ts`
- Read first: `src/core/stats.ts` (`SessionMetrics`, `sessionMetrics`), `src/core/transcript.ts` (`toolUses`), `src/core/config.ts` (the `z.infer` pattern), `docs/design/metrics.md`, ADR 0016, ADR 0026

**Interfaces:**
- Consumes:
  ```ts
  // P1 Task 13 (landed): src/core/stats.ts
  export interface SessionMetrics {
    v: 1; sessionId: string; source: "transcript" | "snapshot"; startedAt: string | null; endedAt: string | null;
    firstTurnContextTokens: number | null; usage: Usage; docReads: number; docReadChars: number;
    packetInjections: number; packetChars: number; docTokensEstimate: number; tasksClosed: string[];
    corrections: number; secondsToFirstEdit: number | null; hookErrors: number; malformedLines: number;
  }
  export function sessionMetrics(records: TranscriptRecord[], opts: { sessionId: string; root: string; malformedLines?: number; platform?: NodeJS.Platform }): SessionMetrics;
  //   docReadChars counts only Read results under <root>/.context/ (ADR 0016); bench recomputes doc reads with its own globs
  // P1 Task 11 (landed): src/core/transcript.ts
  export function parseTranscript(jsonl: string): { records: TranscriptRecord[]; malformedLines: number };
  export function toolUses(records: TranscriptRecord[]): { id: string; name: string; input: Record<string, unknown>; timestamp?: string; isError: boolean }[];
  // existing: matchesAny(path, globs) (src/core/glob.ts), CHARS_PER_TOKEN = 4 (src/core/budget.ts), BatonError, writeFileAtomic, zod
  ```
- Produces:
  ```ts
  // src/core/bench.ts
  export type Arm = "baseline" | "baton";
  export const BENCH_METRICS: readonly ["startTokens", "docTokens", "corrections", "secondsToFirstEdit", "quality"];
  export type BenchMetric = (typeof BENCH_METRICS)[number];
  export const METRIC_LABELS: Record<BenchMetric, string>;   // tokens at session start | doc tokens (estimate) | corrections | seconds to first edit | output quality
  export const MIN_PAIRS = 6;                                  // paired TASKS
  export const BenchManifestSchema;                            // zod schema, below
  export type BenchManifest = z.infer<typeof BenchManifestSchema>;   // as src/core/config.ts does; no hand-written interface
  export interface BenchRunResult { task: string; arm: Arm; run: number; metrics: SessionMetrics; docTokens: number; quality: number | null }
  export interface TaskPair { task: string; baseline: BenchRunResult[]; baton: BenchRunResult[] }
  export interface MetricSummary {
    metric: BenchMetric; better: "lower" | "higher"; pairs: number;      // paired tasks with a value in both arms
    baselineMedian: number | null; batonMedian: number | null; changePct: number | null;
    improved: number; worse: number; ties: number; signTestP: number | null;
  }
  export interface GateResult {
    status: "pass" | "fail" | "insufficient"; statusText: string;        // statusText adds " (synthetic)" for synthetic manifests
    startTokensChangePct: number | null; correctionsDelta: number | null; qualityNotWorse: boolean | null; stop: boolean; reasons: string[];
  }
  export interface OverheadReport { packetChars: number; hookOutputChars: number; mcpToolDefinitionChars: number }
  export interface BenchReport {
    v: 1; name: string; synthetic: boolean; generatedAt: string;
    tasks: number; runs: { baseline: number; baton: number }; pairs: number; unpaired: string[];
    metrics: MetricSummary[]; gate: GateResult; overhead: OverheadReport | null;
  }
  export function signTest(improved: number, worse: number): number;
  export function benchMedian(xs: readonly number[]): number | null;
  export function benchDocChars(records: TranscriptRecord[], root: string, docs: readonly string[], platform?: NodeJS.Platform): number;
  export function metricValue(r: BenchRunResult, m: BenchMetric): number | null;
  export function pairTasks(results: readonly BenchRunResult[]): { pairs: TaskPair[]; unpaired: string[] };
  export function summarizeMetric(pairs: readonly TaskPair[], metric: BenchMetric): MetricSummary;
  export function evaluateGate(metrics: readonly MetricSummary[], pairs: readonly TaskPair[], opts?: { synthetic?: boolean }): GateResult;
  export async function loadBenchManifest(dir: string): Promise<BenchManifest>;
  export async function runBench(dir: string, opts?: { now?: Date; overhead?: OverheadReport | null }): Promise<BenchReport>;
  export function renderBenchText(r: BenchReport): string;
  export function renderBenchMarkdown(r: BenchReport): string;
  export function writeBenchReport(outDir: string, r: BenchReport): { json: string; md: string };   // absolute paths written
  ```

**Rules (pinned):**
- **The arms (ADR 0026).** The baseline arm is the same repo at the commit before `baton init`, with the baton plugin disabled (the pre-baton docs setup); the baton arm runs the same task after `baton init`, with the plugin enabled. The harness does not check this; the manifest states it by its `docs` globs and roots.
- **`BenchManifestSchema`.** `z.object({ v: z.literal(1), name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), synthetic: z.boolean().default(false), description: z.string().default(""), root: z.string().min(1), platform: z.enum(["win32", "linux", "darwin"]).optional(), docs: z.array(z.string().min(1)).min(1).default([".context/**"]), tasks: z.array(z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), title: z.string().min(1), runs: z.array(z.object({ arm: z.enum(["baseline", "baton"]), run: z.number().int().positive(), transcript: z.string().min(1), quality: z.number().min(0).max(1).nullable().default(null), root: z.string().min(1).optional() })).min(1) })).min(1) })`. A run's `root` overrides the manifest's (each run may live in its own clone or worktree).
- **`loadBenchManifest(dir)`.** Read `<dir>/bench.json` (missing → `BatonError(\`no bench.json in ${dir}\`)`), strip a BOM, `JSON.parse`, then the schema. Every error is a `BatonError` (exit 1) whose message starts `bench.json: `: a parse or schema error gives its first message (schema: `<path joined ".">: <message>`). Also rejected: two tasks with one id (`duplicate task <id>`); one task with two runs of the same arm and number (`task <id> has two <arm> runs numbered <n>`); a transcript path for which `win32.isAbsolute(p) || posix.isAbsolute(p)` holds, or whose `posix.normalize(p.replace(/\\/g, "/"))` starts with `..` (`transcript path <p> leaves the bench folder`).
- **`signTest(i, w)`.** Two-sided exact binomial with p = 0.5: `n = i + w`, `k = min(i, w)`; `sum = Σ_{j=0..k} C(n, j)`, computed with `c = 1; sum = 1; for j in 1..k: c = c * (n - j + 1) / j; sum += c`; return `Math.min(1, (2 * sum) / 2 ** n)`. `n > 1000` → `Error("sign test supports at most 1000 pairs")`.
- **`benchMedian`.** `[]` → `null`; sorted copy; odd → the middle; even → the mean of the two middles (no rounding).
- **`benchDocChars(records, root, docs, platform = process.platform)`.** Reads of documentation, with the manifest's globs, in either arm:
  1. `r = root.replace(/\\/g, "/").replace(/\/+$/, "")`. For each `toolUses(records)` entry with `name === "Read"` and a string `input.file_path`: `p = file_path.replace(/\\/g, "/")`; it is under the root when `p.startsWith(r + "/")` (both lowercased on `win32`); `rel = p.slice(r.length + 1)`; it counts when `matchesAny(rel, docs)` (both sides lowercased on `win32`).
  2. Sum the content of the `tool_result` blocks (in user records) whose `tool_use_id` is a counted read: a string counts its length; an array counts the lengths of the `text` of its `type: "text"` blocks.
- **Run values.** `docTokens = Math.ceil((benchDocChars(...) + metrics.packetChars) / CHARS_PER_TOKEN)`. `metricValue`: `startTokens` → `metrics.firstTurnContextTokens`; `docTokens` → `docTokens`; `corrections` → `metrics.corrections`; `secondsToFirstEdit` → `metrics.secondsToFirstEdit`; `quality` → `quality`.
- **`pairTasks(results)`.** A pair is a **task** with at least one run in each arm, as `{ task, baseline: [...runs], baton: [...runs] }`, in first-appearance order of the task. A task with runs in one arm only is listed in `unpaired` as `<task> (<arm> only)`.
- **`summarizeMetric(pairs, m)`.** `better` is `higher` for `quality`, else `lower`. For each pair: `b` = `benchMedian` of the baseline runs' non-null values, `k` = the same for the baton runs; the task is usable when both are non-null. `pairs` counts usable tasks. `baselineMedian` = `benchMedian` of the usable `b` values, `batonMedian` the same for `k`; `changePct = baselineMedian ? Math.round(1000 * (batonMedian - baselineMedian) / baselineMedian) / 10 : null`. `improved` counts tasks where `k` is lower than `b` (higher, for quality); `worse` the opposite; `ties` the equal ones. `signTestP = improved + worse > 0 ? signTest(improved, worse) : null`. With no usable task, the medians and `changePct` are `null`.
- **`evaluateGate(metrics, pairs, { synthetic })`.** `s`, `c`, `q` are the summaries for `startTokens`, `corrections` and `quality`.
  - `correctionsDelta`: over the tasks usable for corrections, `mean(k) - mean(b)` of the per-task medians, rounded to 2 decimals (`Math.round(x * 100) / 100`); `null` with none.
  - `qualityNotWorse`: `q.pairs === 0 ? null : !(q.worse > q.improved && q.signTestP !== null && q.signTestP < 0.05)`.
  - `insufficient` when `s.pairs < 6 || c.pairs < 6 || q.pairs < 6`; else `pass` when `s.changePct !== null && s.changePct <= -30 && correctionsDelta !== null && correctionsDelta < 0 && qualityNotWorse === true`; else `fail`. Quality must be scored for a pass.
  - `statusText`: `pass`, `fail` or `insufficient data`, plus ` (synthetic)` when `synthetic`.
  - `stop` (the metrics.md rule): `(s.changePct === null || s.changePct > -30) && (correctionsDelta === null || correctionsDelta >= 0)`.
  - `reasons`, in order: `tokens at session start: <changePct>% (target -30% or lower)` (or `tokens at session start: no data`); `corrections per session: <delta> (target below 0)` (or `no data`); for quality: `output quality: not scored` when `q.pairs === 0`, else `output quality: scored in <q.pairs> paired task(s), need 6` when below 6, else `output quality: not significantly worse (sign test, p < 0.05)` or `output quality: worse in <w> of <n> tasks (p=<p.toFixed(4)>)`; and, when start tokens or corrections have fewer than 6, `need at least 6 paired tasks with start tokens and corrections (have <s.pairs> and <c.pairs>)`.
- **`runBench(dir, opts)`.** `manifest = await loadBenchManifest(dir)`. For each run: read `join(dir, transcript)` (failure → `BatonError(\`bench.json: cannot read ${transcript}\`)`), `parseTranscript`, then `root = run.root ?? manifest.root`, `platform = manifest.platform ?? process.platform`, `metrics = sessionMetrics(records, { sessionId: \`${task}-${arm}-${run}\`, root, malformedLines, platform })` and `docTokens` as above with `manifest.docs`. Then `pairTasks`, summarise all five metrics in `BENCH_METRICS` order, and `evaluateGate(…, { synthetic: manifest.synthetic })`. `runs` counts each arm's runs; `pairs` is the number of paired tasks. `generatedAt = (opts.now ?? new Date()).toISOString()`; `overhead = opts.overhead ?? null`. Writes nothing.
- **`renderBenchText(r)`,** lines joined with `\n`:
  1. `baton bench: <name> (synthetic fixtures: they validate the harness, not baton)` when `synthetic`, else `baton bench: <name> (recorded sessions)`.
  2. `tasks <tasks>, runs: <baseline> baseline, <baton> baton, paired tasks <pairs>`, plus `; unpaired: <list joined ", ">` when any.
  3. A header row built with the same paddings from the words `metric`, `tasks`, `baseline`, `baton`, `change`, `b/w/t` and `sign test p`, then one row per metric: `label.padEnd(26) + String(pairs).padEnd(7) + fmt(baselineMedian).padEnd(11) + fmt(batonMedian).padEnd(11) + pct.padEnd(9) + \`${improved}/${worse}/${ties}\`.padEnd(14) + fmtP(signTestP)`. `fmt`: `null` → `n/a`; an integer → `toLocaleString("en-US")`; else `toFixed(2)`. `pct`: `null` → `n/a`, else a sign, one decimal and `%` (`-41.7%`, `+3.0%`). `fmtP`: `null` → `n/a`; below 0.0001 → `toExponential(2)`; else `toFixed(4)`.
  4. `gate (spec: >= 30% fewer start tokens, fewer corrections, quality not significantly worse (sign test, p < 0.05)): <statusText>`, then each reason as `  <reason>`.
  5. `stop rule (docs/design/metrics.md): <stop | continue>`.
  6. Overhead: `overhead: packet <c> chars (~<ceil(c/4)> tokens); SessionStart hook output <h> chars; MCP tool definitions <m> chars (~<ceil(m/4)> tokens, only when the MCP adapter is configured)`, or `overhead: not measured`.
- **`renderBenchMarkdown(r)`.** `# baton bench: <name>`; for synthetic reports, `> Synthetic fixtures: these numbers validate the harness and say nothing about baton.`; `Generated <generatedAt>. Tasks <n>, paired tasks <p>. Baseline arm: the repo before baton init, plugin disabled.`; a table with header `| Metric | Paired tasks | Baseline (median) | baton (median) | Change | Better / worse / ties | Sign test p |` and one row per metric (same formatting); then `**Gate:** <statusText>.` followed by the reasons, `**Stop rule (docs/design/metrics.md):** <stop | continue>.` and `**Overhead:** <the overhead text after "overhead: ">`. Blank lines between blocks.
- **`writeBenchReport(outDir, r)`.** `mkdirSync(outDir, { recursive: true })`; `report.json` = `JSON.stringify(r, null, 2) + "\n"`; `report.md` = the markdown + `"\n"`; both with `writeFileAtomic`.

**Test builder** (top of the test file):
```ts
const m = (over: Partial<SessionMetrics> = {}): SessionMetrics => ({
  v: 1, sessionId: "s", source: "transcript", startedAt: null, endedAt: null, firstTurnContextTokens: null,
  usage: { inputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 0 },
  docReads: 0, docReadChars: 0, packetInjections: 0, packetChars: 0, docTokensEstimate: 0, tasksClosed: [],
  corrections: 0, secondsToFirstEdit: null, hookErrors: 0, malformedLines: 0, ...over,
});
const run = (task: string, arm: Arm, n: number, over: Partial<SessionMetrics>, quality: number | null = null, docTokens = 0): BenchRunResult =>
  ({ task, arm, run: n, metrics: m(over), docTokens, quality });
```

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-jx6.13 --claim`
- [ ] **Step 2: Write the failing tests** in `test/bench.test.ts`.
  - `signTest`: `(9, 1)` → `0.021484375`; `(8, 0)` → `0.0078125`; `(5, 5)` → 1; `(3, 0)` → 0.25; `(0, 0)` → 1; `(24, 0)` → `1.1920928955078125e-7`; `(1001, 0)` throws.
  - `benchMedian`: `[]` → `null`; `[3, 1, 2]` → 2; `[1, 2]` → 1.5.
  - **Vector A** (6 tasks `t1`…`t6`, one run per arm): baseline start tokens `[1000, 1200, 1100, 900, 1000, 1300]` with corrections `[1, 1, 2, 0, 1, 1]`; baton start tokens `[600, 700, 650, 800, 500, 700]` with corrections `[0, 1, 0, 0, 0, 1]`; quality 1 in every run.
    - `startTokens`: `pairs` 6, `baselineMedian` 1050, `batonMedian` 675, `changePct` -35.7, `improved` 6, `worse` 0, `ties` 0, `signTestP` 0.03125.
    - `corrections`: `improved` 3, `worse` 0, `ties` 3.
    - `quality`: `pairs` 6, `ties` 6, `signTestP` `null`.
    - gate: `status` `"pass"`, `statusText` `"pass"`, `correctionsDelta` -0.67, `qualityNotWorse` true, `stop` false, `reasons[2]` `"output quality: not significantly worse (sign test, p < 0.05)"`. With `{ synthetic: true }`, `statusText` is `"pass (synthetic)"`.
  - **Vector A without quality** (every `quality` `null`): gate `insufficient`, `statusText` `"insufficient data"`, a reason `output quality: not scored`.
  - **Vector B:** as A, with baton start tokens `[900, 1100, 1000, 850, 950, 1200]`: `changePct` -7.1, gate `fail`, `stop` false.
  - **Vector C** (8 tasks, one run per arm): baseline start tokens all 1000, corrections all 1, quality all 1; baton start tokens all 600, corrections all 0, quality `[0, 0, 0, 0, 0, 0, 0, 1]`. Start tokens give `changePct` -40 and corrections a delta of -1, but `quality` has `worse` 7, `ties` 1, `signTestP` 0.015625; `qualityNotWorse` false; gate `fail`; a reason is `output quality: worse in 7 of 8 tasks (p=0.0156)`.
  - **Per-task medians:** `t1` baseline start tokens `[100, 300, 200]` and baton `[50, 500, 150]`; `t2` baseline `[100, 100, 100]` and baton `[90, 200, 95]` (runs 1–3). `startTokens` has `pairs` 2, `improved` 2, `baselineMedian` 150, `batonMedian` 122.5, `changePct` -18.3 and `signTestP` 0.5 — one outlier run per task does not flip the result.
  - **Insufficient:** 5 paired tasks → `status` `"insufficient"` with the `need at least 6 paired tasks` reason.
  - `pairTasks`: `t1` baseline run 1, `t1` baton runs 1 and 2, `t2` baseline run 1 → 1 pair (`t1`, with 1 baseline and 2 baton runs), `unpaired` `["t2 (baseline only)"]`.
  - `null values are skipped`: a task whose baton runs all have `secondsToFirstEdit` `null` is not counted in that metric's `pairs`.
  - `benchDocChars`: records with `toolUse("r1", "Read", { file_path: "C:\\w\\docs\\a.md" }, …)` + `toolResult("r1", "x".repeat(300), false, …)`, `toolUse("r2", "Read", { file_path: "c:\\W\\.context\\spec.md" }, …)` + `toolResult("r2", "y".repeat(200), false, …)` and `toolUse("r3", "Read", { file_path: "C:\\elsewhere\\b.md" }, …)` + `toolResult("r3", "z".repeat(50), false, …)`: with root `"C:\\w"`, platform `"win32"` and `docs` `["docs/**", ".context/**"]` → 500; with `docs` `[".context/**"]` → 200; with platform `"linux"`, root `"C:/w"` and the two globs → 300 (case-sensitive, so `c:\W` is outside).
  - **Manifest errors,** each a `BatonError` with exit 1 whose message starts `bench.json: `, using a temp dir with a `bench.json`: invalid JSON; `v: 2`; a task id `"T 1"`; two baseline runs numbered 1 in one task (`has two baseline runs numbered 1`); transcripts `"../x.jsonl"`, `"C:\\x.jsonl"` and `"/x.jsonl"` (`leaves the bench folder`); a missing transcript file through `runBench` (`cannot read`). A dir without `bench.json` → `no bench.json in`. A manifest without `docs` gets `[".context/**"]`.
  - **`runBench` end to end:** in a temp dir, write two transcripts with the P1 Task 11 helpers, passing a timestamp to every record (the helpers' default is 2026-10-20, which would move the start): `userPrompt("go", "2026-10-23T09:00:00.000Z")`, then `toolUse("r1", "Read", { file_path: "<R>/.context/spec.md" }, "2026-10-23T09:00:05.000Z", { input_tokens: 6, cache_creation_input_tokens: N - 6, cache_read_input_tokens: 0, output_tokens: 1 })`, `toolResult("r1", "x".repeat(400), false, "2026-10-23T09:00:05.000Z")`, then `toolUse("e1", "Edit", { file_path: "<R>/src/a.ts" }, "2026-10-23T09:01:00.000Z")`. Baseline: N = 2000 and R = `/w`; baton: N = 1200 and R = `/w2`. The manifest has `root: "/w"`, `platform: "linux"`, one task, and the baton run carries `root: "/w2"`. The report has `pairs` 1, `startTokens.baselineMedian` 2000 and `batonMedian` 1200, `docTokens` medians 100 in both arms (the per-run root counts the baton read), `secondsToFirstEdit.baselineMedian` 60, and gate `insufficient`.
  - **Rendering:** for vector A wrapped in a report (`name: "demo"`, `synthetic: true`, `overhead: { packetChars: 8000, hookOutputChars: 8100, mcpToolDefinitionChars: 1600 }`, gate from `{ synthetic: true }`), the text's first line is `baton bench: demo (synthetic fixtures: they validate the harness, not baton)`, it contains `tokens at session start` with `-35.7%` and `6/0/0` on the same line, `gate (spec: >= 30% fewer start tokens, fewer corrections, quality not significantly worse (sign test, p < 0.05)): pass (synthetic)`, `stop rule (docs/design/metrics.md): continue`, and `overhead: packet 8000 chars (~2000 tokens); SessionStart hook output 8100 chars; MCP tool definitions 1600 chars (~400 tokens, only when the MCP adapter is configured)`. The markdown starts with `# baton bench: demo` and contains `> Synthetic fixtures:`, `**Gate:** pass (synthetic).` and the table header. With `overhead: null` the text has `overhead: not measured`.
  - `writeBenchReport` writes both files into a temp dir; `report.json` parses back to the report, with `gate.statusText` `"pass (synthetic)"`.
- [ ] **Step 3: Run.** `npx vitest run test/bench.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `src/core/bench.ts`.
- [ ] **Step 5: Run.** Expected: PASS. Then `npm run check` and `npm run build`.
- [ ] **Step 6: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-jx6.13
  git add src/core/bench.ts test/bench.test.ts .context/tasks.jsonl
  git commit -m "feat(bench): paired A/B core over tasks, exact sign tests and the MVP gate" -- src/core/bench.ts test/bench.test.ts .context/tasks.jsonl
  ```

---

### Task 16: `baton bench` and the synthetic fixtures

Item `bt-jx6.14`. Claim it first.

**Files:**
- Create: `scripts/bench-synth.mjs`, `bench/synthetic/**` (generated by the script and committed), `src/commands/bench.ts`
- Modify: `src/program.ts` (add `import { registerBench } from "./commands/bench.js";` and call `registerBench(program)` directly after `registerStats(program)`; nothing else), `biome.json` (add `"!bench"` to `files.includes`)
- Test: `test/bench-fixtures.test.ts`
- Read first: `src/core/bench.ts` (Task 15), `src/commands/stats.ts` (command style), `test/helpers/transcript.ts` (P1 Task 11 record shapes), ADR 0026

**Interfaces:**
- Consumes:
  - Task 15: `runBench(dir, { now?, overhead? })`, `writeBenchReport(outDir, report)`, `renderBenchText`, `renderBenchMarkdown`, `OverheadReport { packetChars, hookOutputChars, mcpToolDefinitionChars }`, and the manifest format (including `docs` globs and per-run `root`). Pairs are tasks; doc tokens count `Read` results matching `docs` under the run's root, plus the packet; the gate needs 6 paired tasks with scored quality.
  - P1 Task 13 (landed): `sessionMetrics` reads `type: "attachment"` records with `attachment.type === "hook_additional_context"`, `hookEvent === "SessionStart"` and `content: string[]` starting with `# baton mission brief` as packet injections (`packetChars`); the first assistant record's usage as `firstTurnContextTokens`; user prompts after the first that start with a correction phrase (`no`, `actually`, …) as corrections; the first `Edit` tool use's timestamp minus the first timestamp as `secondsToFirstEdit`.
  - ADR 0026: the baseline arm is the repo at the commit before `baton init`, with the plugin disabled, so its sessions read the pre-baton docs (README, `docs/`) and there is no `.context/` and no packet.
  - P1 Task 10: `buildMission(root, config)` → `{ text }`. `src/hooks/io.ts`: `renderHookResult("session-start", { kind: "context", text }, "claude").stdout`.
  - Task 5: `toolDefinitions({ root })` (`src/mcp/server.ts`, loaded with `await import()` only inside the action).
  - Existing: `findProjectRoot`, `contextPath`, `loadConfig`, `action`, `BatonError`.
  - Test helpers: `REPO_ROOT`, `makeTempDir`, the stamped fixture (P1 Task 3), `runCli` (P1 Task 6).
- Produces: `node scripts/bench-synth.mjs [--out <dir>]` (default `<repo>/bench/synthetic`), the committed `bench/synthetic/`, and the command `bench <dir> [--format <text|json|md>] [--out <dir>] [--no-overhead]`.

**`scripts/bench-synth.mjs` (pinned).** Plain Node, no imports beyond `node:fs`, `node:path` and `node:url`; Biome-clean; LF output; overwrites, never deletes.
- PRNG: `const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };`
- Tasks `t01`…`t08`, titled in order: `Add a --limit flag to search`, `Fix CRLF handling in verify-doc`, `Document the MCP tools`, `Cache the parsed config`, `Rename a spec section id`, `Add a drift reason for dead links`, `Split the handoff renderer`, `Report hook errors in stats`. Runs 1–3, arms `baseline` then `baton`.
- Per transcript (task index `i` from 1, run `r`, arm `a`): `rand = mulberry32(20261023 + i * 100 + r * 10 + (a === "baton" ? 1 : 0))`, drawing in exactly this order:
  1. `first = a === "baseline" ? 21000 + Math.floor(rand() * 6000) : 12000 + Math.floor(rand() * 4000)`;
  2. `reads = a === "baseline" ? 4 : 1`, then `reads` sizes `1500 + Math.floor(rand() * 2000)`;
  3. `corrections = a === "baseline" ? 1 + (rand() < 0.5 ? 1 : 0) : rand() < 0.3 ? 1 : 0`;
  4. `editSeconds = a === "baseline" ? 180 + Math.floor(rand() * 120) : 40 + Math.floor(rand() * 110)`;
  5. baton only: `packetChars = 6000 + Math.floor(rand() * 2000)`;
  6. `quality = rand() < (a === "baseline" ? 0.75 : 0.8) ? 1 : 0`.
- Records, one JSON object per line, `sid = \`${task}-${a}-${r}\``, `uuid = \`${sid}-${counter++}\`` (counter from 1 per transcript), `T0 = Date.UTC(2026, 9, 23, 8 + i, r * 10, 0)`, timestamps `new Date(T0 + s * 1000).toISOString()`:
  1. baton only, at s = 0: `{ type: "attachment", uuid, timestamp, attachment: { type: "hook_additional_context", hookEvent: "SessionStart", content: [packet] } }`, with `packet = "# baton mission brief\n" + "p".repeat(packetChars - 22)` (length `packetChars`).
  2. At s = 1: `{ type: "user", uuid, timestamp, message: { role: "user", content: \`Task ${task}: ${title}\` } }`.
  3. For read `k` (0-based), at s = 5 + k, the file is `["README.md", "docs/architecture.md", "docs/decisions.md", "docs/notes.md"][k]` in the baseline arm (the pre-baton docs) and `".context/spec.md"` in the baton arm: `{ type: "assistant", uuid, timestamp, requestId: \`req_${sid}_r${k}\`, message: { id: \`msg_${sid}_r${k}\`, role: "assistant", content: [{ type: "tool_use", id: \`${sid}-r${k}\`, name: "Read", input: { file_path: \`/bench/demo/${file}\` } }] } }`, with `usage: { input_tokens: 6, cache_creation_input_tokens: first - 6, cache_read_input_tokens: 0, output_tokens: 40 }` added to `message` for `k === 0` only; then `{ type: "user", uuid, timestamp, message: { role: "user", content: [{ type: "tool_result", tool_use_id: \`${sid}-r${k}\`, content: "d".repeat(size_k), is_error: false }] } }`.
  4. For correction `c`, at s = 20 + 10c: a user prompt with text `["No, we decided to keep the CLI as the only writer.", "Actually, use the task store for that."][c]`.
  5. At s = `editSeconds`: an assistant `Edit` tool use (id `${sid}-e`, `input: { file_path: "/bench/demo/src/app.ts" }`, `requestId: \`req_${sid}_e\``, `message.id: \`msg_${sid}_e\``), then its `tool_result` (`content: "ok"`).
- Files: `<out>/<task>/<arm>-<run>.jsonl`, and `<out>/bench.json` = `JSON.stringify(manifest, null, 2) + "\n"` with `{ v: 1, name: "synthetic", synthetic: true, description: "Generated by scripts/bench-synth.mjs (seed 20261023). Validates the harness, says nothing about baton. Baseline: the repo before baton init, plugin disabled.", root: "/bench/demo", platform: "linux", docs: ["README.md", "docs/**", ".context/**"], tasks: [{ id, title, runs: [baseline 1–3, then baton 1–3, each { arm, run, transcript: "<task>/<arm>-<run>.jsonl", quality }] }] }` (key order as written).
- It prints `bench-synth: 48 transcript(s) -> <out>`.

**Command `bench <dir> [--format <text|json|md>] [--out <dir>] [--no-overhead]` (pinned):**
1. `root = findProjectRoot()`; `dir = resolve(<dir>)`.
2. Overhead, unless `--no-overhead` or `<root>/.context` is missing (then `null`): `packet = (await buildMission(root, await loadConfig(root))).text`; `packetChars = packet.length`; `hookOutputChars = renderHookResult("session-start", { kind: "context", text: packet }, "claude").stdout.length`; `mcpToolDefinitionChars = JSON.stringify(await (await import("../mcp/server.js")).toolDefinitions({ root })).length`. Nothing is written for it.
3. `report = await runBench(dir, { overhead })`.
4. `outDir = o.out ? resolve(o.out) : existsSync(contextPath(root)) ? contextPath(root, ".cache", "bench", report.name) : null`; `null` → `BatonError("no .context/ here to hold the report; pass --out <dir>")`. Then `writeBenchReport(outDir, report)`.
5. Print `renderBenchText(report)` (text), the JSON (`JSON.stringify(report, null, 2)`), or `renderBenchMarkdown(report)` (md), plus `"\n"`; then, for text only, `report: <outDir>/report.md`.
6. Exit 0 whatever the gate says: it is a report. Manifest errors exit 1.
- Description: `score paired runs with and without baton from session transcripts (writes a local report)`.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-jx6.14 --claim`
- [ ] **Step 2: Write the failing tests** in `test/bench-fixtures.test.ts`.
  - `the fixtures regenerate byte for byte`: `spawnSync(process.execPath, ["scripts/bench-synth.mjs", "--out", tmp], { cwd: REPO_ROOT })` exits 0; the set of relative file paths under `tmp` equals that under `bench/synthetic` (49 files), and every file is byte-identical.
  - `the harness on the fixtures`: `r = await runBench(join(REPO_ROOT, "bench", "synthetic"), { now: new Date("2026-10-23T00:00:00Z"), overhead: null })`:
    - `synthetic` true, `tasks` 8, `runs` `{ baseline: 24, baton: 24 }`, `pairs` 8 (tasks), `unpaired` `[]`;
    - `startTokens`: `pairs` 8, `improved` 8, `worse` 0, `signTestP` `0.0078125`, `baselineMedian` between 21000 and 27000, `batonMedian` between 12000 and 16000, `changePct` between -56 and -23;
    - `secondsToFirstEdit`: `improved` 8, `worse` 0;
    - `corrections`: `worse` 0;
    - `docTokens`: both medians above 0 (the baseline's README and `docs/` reads count through the manifest's `docs` globs);
    - `quality`: `pairs` 8;
    - `gate.statusText` ends with `(synthetic)`;
    - `renderBenchText(r)` starts with `baton bench: synthetic (synthetic fixtures: they validate the harness, not baton)`;
    - a second run with the same `now` gives a deep-equal report.
  - `command, without overhead`: `runCli(["bench", join(REPO_ROOT, "bench", "synthetic"), "--no-overhead", "--out", tmp], REPO_ROOT)` exits 0; stdout's first line is the line above, and it contains `overhead: not measured` and `report: `; `tmp/report.json` parses with `synthetic` true; `tmp/report.md` starts with `# baton bench: synthetic`.
  - `command, with overhead`: on the stamped fixture `root`, `runCli(["bench", join(REPO_ROOT, "bench", "synthetic"), "--format", "json", "--out", tmp], root)` exits 0, and the JSON's `overhead.packetChars`, `hookOutputChars` and `mcpToolDefinitionChars` are all > 0, with `hookOutputChars > packetChars`.
  - `command needs a place for the report`: in `emptyTmp` without `--out`, exit 1 with `pass --out`.
  - `command rejects a bad manifest`: a temp dir with `bench.json` = `"{}"` gives exit 1 and stderr containing `bench.json: `.
- [ ] **Step 3: Run.** `npx vitest run test/bench-fixtures.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the script, then run `node scripts/bench-synth.mjs` (it writes `bench/synthetic/`), then the command, the registration and the Biome exclusion.
- [ ] **Step 5: Run.** Expected: PASS. Then `npm run check`, `npm run build`, `npm run check:bundle` and `npm run check:pack` (the package must not contain `bench/`).
- [ ] **Step 6: Run the harness here.** `node dist/baton.mjs bench bench/synthetic`. Expected: exit 0, a report under `.context/.cache/bench/synthetic/` (git-ignored), and an `overhead:` line with this repo's real numbers. Keep that line for Task 17. Nothing is posted anywhere.
- [ ] **Step 7: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-jx6.14
  git add scripts/bench-synth.mjs bench/synthetic src/commands/bench.ts src/program.ts biome.json test/bench-fixtures.test.ts .context/tasks.jsonl
  git commit -m "feat(bench): baton bench over transcripts, with seeded synthetic fixtures" -- scripts/bench-synth.mjs bench/synthetic src/commands/bench.ts src/program.ts biome.json test/bench-fixtures.test.ts .context/tasks.jsonl
  ```

---

### Task 17: Docs: command contract, hook wiring, roadmap, README, metrics

Item `bt-jx6.15`. Claim it first.

**Files:**
- Modify: `docs/design/architecture.md`, `docs/design/metrics.md`, `docs/design/context-format.md` (two lines), `docs/roadmap.md`, `README.md`, `docs/research/2026-10-16-implementation-notes.md` (§6, one bullet)
- Read first: those files, `node dist/baton.mjs --help`, `node dist/baton.mjs init --help`, the ADR 0023–0026 records, and the `overhead:` line from Task 16 Step 6

**Interfaces:**
- Consumes: the commands as built in Tasks 4, 5, 10 and 16 (`search`, `mcp [--root]`, `init [--harness] [--scope] [--no-hooks] [--force] [--refresh-harness]`, `bench`); the hook config of Task 8; the `human` label of Task 3; the package shape of Tasks 13–14; the follow-up ids created in Task 3.
- Produces: docs only.

- [ ] **Step 1: Claim.** `node dist/baton.mjs task update bt-jx6.15 --claim`
- [ ] **Step 2: Edit `docs/design/architecture.md`.**
  1. Principle 5: append " The optional MCP adapter's four tools are read-only (ADR 0023)."
  2. Source layout, under `core/`, add: `search.ts         full-text search over the section index; stale text withheld (ADR 0023)`, `harness.ts        Codex and Gemini CLI hook config and merge rules (ADR 0024)`, `skills.generated.ts  plugin skills embedded for init --harness (ADR 0024)`, `bench.ts          paired A/B benchmark: pairing, sign test, gate (ADR 0026)`. Replace the `mcp/server.ts` line with `mcp/server.ts       four read-only MCP tools: mission, preflight, drift, search (lazy chunk, ADR 0023)` and add `mcp/inmemory.ts     in-process MCP client for tests and the benchmark`. Add `bench/` at the top level: `bench/               benchmark fixtures (bench/synthetic/ is generated by scripts/bench-synth.mjs)`.
  3. Command contract:
     - `init` row → `| init [--harness] [--scope] [--no-hooks] [--force] [--refresh-harness] | templates, embedded skills, existing harness config | .context/, AGENTS.md, CLAUDE.md, .gitattributes/.gitignore lines; codex: .codex/hooks.json; gemini: .gemini/settings.json; both: .agents/skills/ (ADR 0017, ADR 0024). --force overwrites templates only; --refresh-harness rewrites baton's harness entries and skill copies only | 0, 1 | done |`
     - `task …` row: append to its Writes cell `; tasks labelled human stay out of the packet and task ready --unassigned/--claim (ADR 0026)`.
     - `mcp` row → `| mcp [--root] | .context/, task store, git (through core) | nothing (four read-only tools, ADR 0023) | 0; tool errors are isError results | done |`
     - add after `drift`: `| search <words...> [--limit] [--format] | section index, freshness | nothing | 0, 1 | done |`
     - add after `stats`: `| bench <dir> [--format] [--out] [--no-overhead] | bench.json, transcripts, packet, MCP tool definitions | .context/.cache/bench/<name>/report.json and report.md, or --out (ADR 0026) | 0, 1 | done |`
  4. Hook wiring table, Codex and Gemini columns:
     - `session-start`: `SessionStart (no matcher, additionalContextLimit 4000)` · `SessionStart (no matcher; no compact source)`
     - `pre-compact`: `PreCompact` · `PreCompress`
     - `session-end`: `SessionEnd (timeout 3 s)` · `SessionEnd`
     - `pre-tool-use`: `PreToolUse ^(Bash\|apply_patch)$` · `BeforeTool ^(write_file\|replace\|run_shell_command)$`
     - `post-tool-use` and `stop`: `not wired yet (bt-jx6.24)` in both columns.
     Replace the sentence "Codex and Gemini wiring is written by `baton init --harness` in Phase 3." with "Codex and Gemini wiring is written by `baton init --harness codex|gemini` into the project's `.codex/hooks.json` and `.gemini/settings.json`, whose handlers run `baton hook <event> --harness <h>` from PATH, or with `--scope user` into the home folder, whose handlers run `node "<bundle>" hook …` (ADR 0024). Claude Code keeps exec-form `node` and plain-list matchers (ADR 0008); Codex and Gemini have neither, so they get shell command strings and anchored regex matchers. Pre-tool preflight context is not sent to Codex or Gemini until a live session shows they accept it."
  5. Performance budget: append "`npm run check:bundle` fails the build when the hook path can reach the MCP SDK. Codex and Gemini run hooks through a shell, and the smoke test measures them with a PATH shim (implementation notes §5)."
  6. Integrations: add three bullets: "**Codex CLI and Gemini CLI:** hook config, Gemini's `context.fileName`, and the skills in `.agents/skills/`, written by `baton init --harness` (ADR 0024).", "**MCP clients:** `baton mcp` over stdio with four read-only tools; opt-in, not shipped in the plugin (ADR 0023).", "**Distribution:** the npm package `baton-ctx`, which is also the Claude Code plugin root; the `baton` marketplace installs it from npm (ADR 0025)."
- [ ] **Step 3: Edit `docs/design/metrics.md`.** Append a section:
  ```markdown
  ## Benchmark harness

  `baton bench <dir>` scores the paired A/B (ADR 0026). `<dir>/bench.json` lists the tasks and, per run, its arm (`baseline` or `baton`), run number, transcript path relative to `<dir>`, an optional quality score from 0 to 1 (for example 1 when the task's check passed, or a blind reviewer's score) and an optional `root` (the clone or worktree the run used; the manifest's `root` is the default). `docs` lists the globs whose reads count as documentation in both arms (default `.context/**`). The transcripts are Claude Code session logs.

  - **The arms.** The baseline is the same repo at the commit before `baton init`, with the baton plugin disabled: the pre-baton docs setup (its README, CLAUDE.md, `docs/`). The baton arm runs the same task after `baton init`, with the plugin enabled. List the pre-baton docs in `docs` so the baseline's reading is counted too.
  - **Pairs are tasks.** For each task with runs in both arms, each metric takes the median over that arm's runs; the report gives the median of those per-task medians per arm, the change in percent, better/worse/tied tasks and a two-sided exact sign test over tasks.
  - **The gate** passes when the median tokens at session start fall by at least 30%, mean corrections per session fall, and quality is scored and not significantly worse (sign test, p < 0.05). Fewer than 6 paired tasks, or no quality scores, is insufficient data. The decision rule above is printed as the stop rule.
  - baton's overhead (packet, SessionStart hook output, MCP tool definitions) is reported with every run.
  - The report goes to `.context/.cache/bench/<name>/` (git-ignored) or `--out`; nothing is uploaded.
  - `bench/synthetic/` comes from `scripts/bench-synth.mjs` with a fixed seed and follows the arm definitions. It checks the harness and says nothing about baton; its gate status reads `(synthetic)`.
  - **Recording real sessions:** run each task in a fresh clone or worktree, three times per arm, and keep the transcripts out of git (they can contain secrets). Publish the report, not the transcripts.
  ```
- [ ] **Step 4: Edit `docs/design/context-format.md`.** Append `, bench/<name>/` to the `.cache/` line of the layout block. In the task store table's `baton labels` row, append: "; `human` marks a task for a person: the packet, STATE's lists and `task ready --unassigned`/`--claim` leave it out, plain `task ready` marks it `[human]`, and `task update <id> --claim` refuses it without `--force` (ADR 0026)".
- [ ] **Step 5: Edit `docs/roadmap.md`.**
  1. Replace the "Done so far: …" sentence (P2 Task 17's wording) with: "Done so far: scaffold, the native task store (ADR 0009), the Phase 1 MVP, the Phase 2 gates and the Phase 3 build. The dogfood gates and the published benchmark are still to be measured."
  2. Under the Phase 3 heading, add: "Built: epic `bt-jx6` (plan: [phase 3](superpowers/plans/2026-10-23-phase3-reach.md); ADRs 0023–0026). Left to a person, by design (label `human`): the npm publish (`bt-jx6.17`), the marketplace listing (`bt-jx6.18`), live checks in Codex, Gemini CLI and an MCP client (`bt-jx6.19`–`.22`), the vendored-license check (`bt-jx6.25`), and the benchmark run that is this phase's gate (`bt-jx6.23`)."
  3. Append to open question 3: " The benchmark now reports the tool-definition cost (ADR 0026); decide after the live run."
- [ ] **Step 6: Edit `README.md`.**
  1. Replace the `> Status:` line with: "> Status: **pre-alpha; 0.1.0 is publish-ready but not on npm yet.** Phases 1–3 are built: mission packet, handoff, drift, stats, init, decide, verify, compile, the hook guards, Codex and Gemini CLI hooks (`baton init --harness`), the optional read-only MCP adapter, `baton search` and the `baton bench` harness, plus the task store and `baton explain`. The dogfood gates and the published benchmark are still open. See [docs/roadmap.md](docs/roadmap.md)."
  2. In the "How it fits together" block, change `MCP    (mission · decide · verify · search, optional)` to `MCP    (mission · preflight · drift · search, read-only, optional)`, padding with spaces so the line's closing box character stays in its column.
  3. Add a section `## Install` before `## Development`:
     ````markdown
     ## Install

     Not on npm yet. After the 0.1.0 release:

     ```bash
     npm install -g baton-ctx
     baton init                           # .context/, AGENTS.md, CLAUDE.md
     baton init --harness codex,gemini    # also Codex / Gemini CLI hooks and .agents/skills/
     ```

     - **Claude Code:** `/plugin marketplace add NIGHTFURY609/baton`, then `/plugin install baton@baton`.
     - **Codex:** review and trust the new hooks with `/hooks`. **Gemini CLI:** accept the new project hooks when asked. `--scope user` writes the hooks to your home folder instead; `--refresh-harness` rewrites baton's entries.
     - **MCP (optional):** any MCP client can start `baton mcp` over stdio (command `baton`, args `["mcp"]`; on Windows a client may need command `cmd`, args `["/c", "baton", "mcp"]`, not yet confirmed). Its four tools only read: mission, preflight, drift, search.
     ````
  4. In "Try the plugin in Claude Code", replace the comment line `# or: /plugin marketplace add ./   then   /plugin install baton@baton-dev` with `# the marketplace entry installs the npm release; use --plugin-dir for the local build`, and the sentence "(hooks are safe no-ops for now)" with "(hooks fail open)".
  5. In the repository layout table, add `| `bench/` | Benchmark fixtures (`bench/synthetic/` is generated) |`.
- [ ] **Step 7: Record the overhead.** In implementation notes §6, append: "MCP tool definitions as `tools/list` returns them: <m> characters (~<m/4> tokens) for the four tools; this repo's packet: <c> characters, its SessionStart hook output <h> characters (`baton bench`, <the actual run date>). 🟡 observed. → ADR 0026" Fill the numbers from Task 16 Step 6.
- [ ] **Step 8: Verify.** `npm run check`. Expected: PASS.
- [ ] **Step 9: Close through `verify`, then commit.**
  ```bash
  # runs npm run check: set the shell tool timeout to 600000 ms
  node dist/baton.mjs verify bt-jx6.15
  git add docs/design/architecture.md docs/design/metrics.md docs/design/context-format.md docs/roadmap.md README.md docs/research/2026-10-16-implementation-notes.md .context/tasks.jsonl
  git commit -m "docs: Phase 3 contract, hook wiring, benchmark method, roadmap and README" -- docs/design/architecture.md docs/design/metrics.md docs/design/context-format.md docs/roadmap.md README.md docs/research/2026-10-16-implementation-notes.md .context/tasks.jsonl
  ```

---

### Task 18: Stamp the Phase 3 sections and regenerate STATE.md

Item `bt-jx6.16`. Claim it first. This is the last task: the stamps must reflect the final tree.

**Files:**
- Modify by hand: `.context/spec.md` (the `source_paths` of three markers, and the text of the `hooks`, `skills`, `tasks` and `measurement` sections, Step 2). Only when inaccurate: `.context/rules.md` (then `node dist/baton.mjs compile`) and `.context/knowledge/*.md`.
- Modify through the CLI only: the `verified_at` stamps (`verify-doc`), `AGENTS.md` (`compile`), `.context/STATE.md` (`handoff`).
- Read first: every section `node dist/baton.mjs drift --format json` lists as unverified, aging or stale, and the files its `source_paths` and body point to.

**Interfaces:**
- Consumes: `drift [--format json]` and `verify-doc <ids...>` (P1 Tasks 6–7), `handoff` (P1 Task 12), `mission` (P1 Task 10), `compile [--check]` (P2 Task 14), `decide` (P2 Task 5), `verify` (P2 Task 7), `npm run smoke:hooks`, `check:bundle`, `check:pack`, and `bench` (Task 16). Commits that change only `.context/` never age a section (ADR 0013); uncommitted changes outside `.context/` do (ADR 0021), so stamp with a clean tree.
- Produces: stamped sections and a regenerated STATE.md.

- [ ] **Step 1: Claim and build.** `node dist/baton.mjs task update bt-jx6.16 --claim`, then `npm run build`. `git status --porcelain` must list only `.context/tasks.jsonl`; commit or finish anything else first.
- [ ] **Step 2: Update the spec.** In `.context/spec.md` (none of these sections is marked `(load-bearing)`; ADRs 0023, 0024 and 0026 record the changes). Paths that exist only in a user's project are written with a placeholder (`<project>/…`), which `drift` skips.
  - `hooks` marker: add `"src/mcp/**"`, `"src/core/search.ts"` and `"src/core/harness.ts"` to `source_paths`. Body: replace the sentences "Hooks fail open, use exec-form `node`, and guard both edit tools and the shell (ADR 0008). Claude Code first; Codex and Gemini CLI equivalents in Phase 3." (or their current wording, if a Phase 2 review reworded them) with: "Hooks fail open and guard both edit tools and the shell (ADR 0008). Claude Code hooks use exec-form `node`; Codex and Gemini run `baton hook …` as a shell command (ADR 0024). The MCP adapter's four tools only read (ADR 0023)."
  - `skills` marker: add `"src/core/skills.generated.ts"`. Body: append "`baton init --harness codex|gemini` copies them to `<project>/.agents/skills/` (ADR 0024)."
  - `tasks` body: append "A task labelled `human` is for a person: the packet, STATE's lists and `baton task ready --unassigned` leave it out (ADR 0026)."
  - `measurement` marker: add `"src/core/bench.ts"` and `"src/commands/bench.ts"`. Body: append "`baton bench` scores paired runs with and without baton from transcripts; the baseline is the repo before `baton init`, with the plugin disabled (ADR 0026)."
  Quote every glob, and do not write the word "commander". Then `node dist/baton.mjs drift`: no section may show a dead `source_paths` reference or a dead body reference.
- [ ] **Step 3: Review each section** that is unverified, aging or stale after this plan: ADRs 0023–0026; the spec sections `hooks`, `skills`, `tasks`, `measurement`, `context-format`, `scope` and `purpose`; the rules sections; `knowledge-harness-limits`. For each, read its text against the code it describes:
  - **Spec, rules or knowledge that is wrong:** fix the text. For rules, run `node dist/baton.mjs compile` afterwards. If the fix changes a load-bearing statement in `.context/spec.md`, do not edit it: run `node dist/baton.mjs decide "<what changes>" --spec <id>`, leave that record proposed, and leave the section unstamped.
  - **An ADR that is wrong:** never edit it. Leave it unstamped, and run `node dist/baton.mjs task create "Supersede ADR <NNNN>: <why>" -t decision --spec <its spec_sections>`.
  - **Not sure:** leave it unstamped.
- [ ] **Step 4: Commit the marker and text fixes first,** so that the stamps point at a commit that contains them. Skip this commit if nothing changed.
  ```bash
  git add .context/spec.md .context/rules.md AGENTS.md .context/knowledge/ .context/decisions/ .context/tasks.jsonl
  git commit -m "docs(context): Phase 3 source_paths and section text before verification" -- .context/spec.md .context/rules.md AGENTS.md .context/knowledge/ .context/decisions/ .context/tasks.jsonl
  ```
- [ ] **Step 5: Stamp the confirmed sections.** `node dist/baton.mjs verify-doc <confirmed ids...>`. Expected: one `verified <id> at <sha12> (<file>)` line per id, exit 0.
- [ ] **Step 6: Check.**
  - `node dist/baton.mjs drift`: the confirmed sections are `fresh`; only the ones deliberately left out are unverified, plus `state`.
  - `node dist/baton.mjs compile --check`: exit 0.
  - `node dist/baton.mjs decide`: lists 0001–0026.
  - `node dist/baton.mjs search mcp adapter` lists `adr-0023`: with its title and a snippet when Step 5 stamped it (so it is fresh), or with `(title withheld)` and a `withheld (…)` line when it was deliberately left unstamped. Either is correct; it shows search obeying freshness.
- [ ] **Step 7: Commit the stamps.**
  ```bash
  git add .context/spec.md .context/rules.md .context/knowledge/ .context/decisions/
  git commit -m "chore(context): stamp verified_at on confirmed Phase 3 sections" -- .context/spec.md .context/rules.md .context/knowledge/ .context/decisions/
  ```
- [ ] **Step 8: Final checks.** All pass:
  - `npm run check`, `npm run validate:skills`, `npm run smoke:hooks`, `npm run check:bundle`, `npm run check:pack`, `node dist/baton.mjs compile --check`;
  - `node dist/baton.mjs bench bench/synthetic` (exit 0; local report only);
  - `node dist/baton.mjs mission`: at most 9,000 characters, starts with `# baton mission brief`, and lists every unstamped id under "Withheld as unverified".
- [ ] **Step 9: Close through `verify`, then regenerate STATE and commit.** The stamp commits since the claim are the diff. `verify` runs `npm run check`: set the shell tool's `timeout` to 600000 ms.
  ```bash
  node dist/baton.mjs verify bt-jx6.16
  node dist/baton.mjs task comment bt-jx6 "Phase 3 build landed (ADRs 0023-0026). Open by design, as human tasks: npm publish bt-jx6.17, marketplace bt-jx6.18, live checks bt-jx6.19 to bt-jx6.22, vendored licenses bt-jx6.25, and the benchmark gate bt-jx6.23. Agent follow-up: bt-jx6.24."
  node dist/baton.mjs handoff --reason manual
  git add .context/STATE.md .context/tasks.jsonl
  git commit -m "chore(context): regenerate STATE.md with baton handoff after Phase 3" -- .context/STATE.md .context/tasks.jsonl
  ```
  `bt-jx6.17`–`bt-jx6.25` and the epic `bt-jx6` stay open. Expected: `handoff` prints `wrote .context/STATE.md (manual)`, and the regenerated STATE lists none of the `human` tasks.
