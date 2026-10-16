# Agent Continuity Layer: Research Report & Recommendation

Oct 15, 2026 · @Vibe Coder

## Executive summary

Build a **continuity-and-freshness layer**, not a "docs MCP + skills bundle": the bundle as pitched already exists several times over, and the version that is still open is narrower, hook-enforced, and measurable.

Three findings from the research drive that verdict:

- **Coverage.** Roughly 90% of the pitched bundle exists today: ActiveMemory ctx, GSD, Google's Conductor, Spec Workflow MCP, Cline Memory Bank and ConPort, Beads, and Claude Code's own Auto Memory and Tasks. No single tool ships the exact bundle, but four are close.

- **Premise.** Project docs do not stop hallucination; they address amnesia and drift. More always-loaded docs make context rot worse, and a stale doc is worse than no doc.

- **Enforcement.** Agents do not consult memory unprompted, and an MCP tool can only gate calls the agent chooses to make. Hooks are the enforcement layer; the MCP is an adapter.

What is still open, and worth building:

1.  Git-pinned freshness on every document section, with stale sections flagged or blocked before injection.

2.  A task-scoped context packet (active task + relevant spec section + last handoff warning) under a token budget.

3.  Handoffs generated from structured state plus git diff, not from the model's recollection at 80% context.

4.  Lifecycle rules (overwrite, append, supersede) baked into the skills so state docs cannot become logs.

5.  A stats command that reads the session log and reports real tokens saved, corrections avoided and drift caught.

Positioning in one line: *every session starts with the smallest fresh brief, and nothing stale reaches the model.*

The rest of this report gives the evidence, what to keep from each pass (the first landscape critique, Gemini's design, the caveman ecosystem), a recommended design, what to change from the original idea, risks, metrics and a phased roadmap.

## The problem, restated correctly

The pain is real, but it is a continuity problem, not a hallucination problem, and that changes what the tool must do.

**Amnesia and drift, not hallucination.** Fabricating an API that does not exist is a grounding failure, fixed by tests and library docs (Context7-style tools). Forgetting last session's decisions, re-establishing patterns, or quietly swapping a library mid-bugfix is continuity failure. Project docs help the second, not the first.

**Static context files have weak evidence for correctness.** A 2026 ablation study on real repositories notes an always-on AGENTS.md sits mid-context where models underuse information, and cites a larger naturalistic study with Claude-family agents that found no significant effect of context files on correctness ([arXiv 2607.27250](https://arxiv.org/pdf/2607.27250)). Docs buy consistency and continuity; they do not buy correctness by themselves.

**More always-loaded docs make context rot worse.** Chroma's study of 18 models found performance degrades non-uniformly as input grows, and rules in instruction files stop being applied mid-session; bloated instruction files accelerate this because every preloaded rule spends attention before real work begins ([LogRocket](https://blog.logrocket.com/?p=213608), [Unblocked](https://getunblocked.com/blog/what-is-context-rot/)). Anthropic's own guidance is the opposite shape: structured note-taking outside the window and just-in-time retrieval ([summary](https://agentic-ai.readthedocs.io/en/latest/ContextEngineering/anthropic/)). Nine documents loaded every session is the pattern the research warns against.

**Stale docs are worse than none.** Every drift tool exists because of this: drift-ai was built after a CLAUDE.md claimed Homebrew was unavailable for weeks after it was installed ([drift-ai](https://pypi.org/project/drift-ai/)). An agent that writes its own docs records what it *intended*, not what it *did*.

**Agents do not consult memory unprompted.** Even Beads users report the agent will not query it unless told ([Morph on Beads](https://www.morphllm.com/beads-agent-memory)), which is why ctx, Beads and claude-remember all lean on SessionStart and PreCompact hooks. The harness enforces memory, not the model's discipline.

**An MCP cannot enforce.** A tool like complete_task(verification_proof) only gates calls the agent chooses to make; nothing stops Edit on status.md. In Claude Code a PreToolUse hook can block an action by exiting 2, a Stop hook can refuse to stop until tests pass, and since 2.1.288 an unmatched PreToolUse hook blocks rather than waves through ([hooks guide, 2026-10-05](https://dev.to/shoustak/claude-code-hooks-a-practical-guide-with-examples-3hlj)). A "proof" string the model passes in is another claim it can fabricate; the server has to run the check.

**Token savings must be measured on agentic work.** The caveman skill advertises 65% savings; JetBrains' paired A/B on 82 agentic tasks measured ~8.5% of output tokens, because code, diffs and tool calls dominate the stream ([JetBrains](https://blog.jetbrains.com/ai/2026/07/speak-to-ai-agents-like-cavemen-tosave-tokens/)). Claims about context size need a session-log number behind them.

## Landscape: what already exists

Every piece of the pitched bundle has at least one shipping implementation; the table maps them by layer, with the closest single-tool matches first.

| Layer                    | Tools (links)                                                                                                                                                                                                                                                                                                                                                                                     | What they cover                                                                                                                                | Shape                               | Gap left                                                                                                   |
|--------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------|------------------------------------------------------------------------------------------------------------|
| Whole-bundle, file-based | [ActiveMemory ctx](https://pkg.go.dev/github.com/ActiveMemory/ctx@v0.1.1), [GSD](https://github.com/gsd-build/get-shit-done), [ctxkit](https://skillselion.com/skills/szaher/contextual/packages/claude-plugin)                                                                                                                                                                                   | .context/ with tasks, KB, handover, ctx drift, ctx compact, ctx agent --budget; GSD: STATE.md/CONTEXT.md, fresh-context subagents, verify step | CLI + plugin                        | Freshness is path-level, not section-level; no evals                                                       |
| Context-driven planning  | [Conductor](https://github.com/gemini-cli-extensions/conductor) (Google, Dec 2025; [Claude Code port](https://github.com/lackeyjb/claude-conductor))                                                                                                                                                                                                                                              | product.md, tech-stack.md, workflow.md, tracks.md, per-track spec.md/plan.md with status                                                       | Gemini CLI extension                | No handoff, no freshness, warns about token cost                                                           |
| MCP + docs + dashboard   | [Spec Workflow MCP](https://vibeindex.ai/marketplaces/Pimzino/spec-workflow-mcp), [Archon](https://github.com/k1dav/archon) (~22k stars, beta), [Sprintra](https://glama.ai/mcp/servers/Sprintra-io/sprintra-mcp/tree), [Mymir](https://github.com/frkak/mymir), [KontextMind](https://github.com/nikzdevz/KontextMind)                                                                           | Steering docs + specs + tasks + approvals; knowledge base + task board over MCP; stage-appropriate context                                     | MCP server + UI                     | Heavy; state hidden in a server; no git-pinned freshness                                                   |
| Memory-bank docs         | [Cline Memory Bank](https://docs.cline.bot/features/memory-bank.md), [ConPort](https://www.sourcepulse.org/projects/3758880) (~760 stars, last push Jan 2026)                                                                                                                                                                                                                                     | projectbrief / activeContext / progress / decisions / systemPatterns; DB-backed version with vector search                                     | Rules file or MCP                   | Passive; many forks half-abandoned                                                                         |
| Spec → plan → tasks      | [GitHub Spec Kit](https://www.marktechpost.com/2026/05/08/9-best-ai-tools-for-spec-driven-development-in-2026-kiro-bmad-gsd-and-more-compare/) (~93k stars), OpenSpec, BMAD, Kiro, Tessl, [superpowers](https://www.rulesell.com/topic/superpowers) (100k+ stars)                                                                                                                                 | spec/plan/tasks, constitution, brainstorm → design doc → plan                                                                                  | CLI templates / skills              | Planning only; superpowers' plan is one monolithic file                                                    |
| Tasks + handoff state    | [Beads](https://github.com/MovGP0/beads) (~24k stars, Dolt-backed), Claude Code Tasks, [Taskmaster](https://claudecodeguides.com/claude-task-master-setup-guide-2026/) (27k+ stars), [claude-remember](https://github.com/Digital-Process-Tools/claude-remember)                                                                                                                                  | Dependency graph, bd ready, bd remember, bd prime; PRD → tasks; handoff note via hooks                                                         | CLI + hooks + one line in AGENTS.md | Beads inspired native Tasks: the harness absorbs this layer                                                |
| Handoff from transcripts | [tapout](https://pypi.org/project/tapout/), [session-handover](https://pypi.org/project/session-handover/0.4.0/), [claude-handoff](https://pypi.org/project/claude-handoff/0.17.0/), [PreCompact recipes](https://github.com/topics/precompact)                                                                                                                                                   | PreCompact + SessionEnd hooks write HANDOFF.md / task-state.json before compaction                                                             | Hooks                               | Source is the transcript, not structured state                                                             |
| Freshness / drift        | [drift-ai](https://pypi.org/project/drift-ai/), [drift-doc](https://github.com/raphabruno7/drift-doc), [claude-drift](https://github.com/marky291/claude-drift), [ContextForge](https://glama.ai/mcp/servers/alfredoizdev/contextforge-mcp/tools/memory_check_freshness), [bettermemory](https://pypi.org/project/bettermemory/3.32.0/), [Agentmem](https://mcp.so/server/agentmem/Thezenmonster) | Dead refs, stale env claims, stale tasks; commit-SHA checks on memories; lifecycle states, conflict detection, health score                    | CLI, skill, or memory MCP           | Applied to memories or instruction files, never uniformly across spec/plan/state/handoff; all small, early |
| Decision logs            | [adr-kit](https://github.com/kschlt/adr-kit), [sqlew](https://lobehub.com/mcp/sqlew-io-sqlew), [AdrMcp](https://nuget.org/packages/adrmcp)                                                                                                                                                                                                                                                        | adr_preflight, supersede, conflict detection, planning context; Plan-mode capture via hooks                                                    | MCP over Markdown ADRs              | No link from decisions to spec sections                                                                    |
| Impact analysis          | [code-graph-mcp](https://lobehub.com/mcp/sdsrss-code-graph-mcp), [CodeImpact MCP](https://github.com/vk0dev/code-impact-mcp), [Codebase-Memory paper](https://www.researchgate.net/publication/403308415_Codebase-Memory_Tree-Sitter-Based_Knowledge_Graphs_for_LLM_Code_Exploration_via_MCP)                                                                                                     | Tree-sitter dependency graph, blast radius, PASS/WARN/BLOCK gate                                                                               | MCP                                 | Derived from code; makes a hand-maintained mindmap unnecessary                                             |
| Rules-file generation    | rulesync, Ruler, [agent-policy](https://docs.rs/crate/agent-policy/latest), [Ma'at](https://pkg.go.dev/github.com/getmaat/maat) ([comparison](https://developertoolkit.ai/en/ecosystem/frameworks/rules-sync/))                                                                                                                                                                                   | CLAUDE.md / AGENTS.md / .cursor rules from one source; CI fails on drift                                                                       | CLI                                 | Commodity; do not rebuild                                                                                  |
| Token efficiency         | [caveman](https://github.com/vadbosh/caveman) (~65k stars), caveman-shrink, caveman-compress, [caveman-code](https://docsearch.algolia.com/mcp/docs/repo/juliusbrussee/caveman-code) + cavemem                                                                                                                                                                                                    | Terse output; compressed tool manifests; terse memory files; tool-output compression; memory consolidation                                     | Skill + MCP proxy + agent           | Output-only savings; the author is already in the memory lane with cavemem                                 |

**What the harnesses now do natively.** Claude Code loads CLAUDE.md plus Auto Memory at session start (on by default since v2.1.59, per project); the first 200 lines or 25KB of MEMORY.md load automatically, topic files on demand, and larger projects split rules into .claude/rules/\*.md ([memory overview](https://claude.nagdy.me/learn/memory), [XDA](https://www.xda-developers.com/gave-claude-code-memory-between-sessions-setup-started-running-itself/)). Tasks are automatic for multi-step work, survive compaction, and persist via CLAUDE_CODE_TASK_LIST_ID ([dev.to](https://dev.to/frr149/linear-beads-and-tasks-three-memory-layers-for-claude-code-kg3)). Anthropic's "Dreaming" (May 2026) consolidates persistent memory between sessions ([Wikipedia](https://en.wikipedia.org/wiki/Claude_(language_model))). Kiro ships specs + steering + hooks; Gemini ships Conductor. A third-party state layer that competes with native memory tends to get absorbed, as Beads was into Tasks.

**Standards to build on.** AGENTS.md was donated to the Linux Foundation's Agentic AI Foundation on 2025-12-09 ([AAIF](https://agentic-ai.readthedocs.io/en/latest/Standards/agents-md/)); Agent Skills became an open standard in December 2025 and by March 2026 more than 30 tools read the same SKILL.md ([Product Builder](https://productbuilder.net/learn/agent-skills)). Skills are the durable half of your bundle; an always-on MCP is not.

## What to keep from each pass

Each source contributed something the others missed; the table is the shortlist that survives the critique.

| Source                                                   | Keep                                                                                                                                                                                                                                       | Why it survives                                                                          | Drop                                                                                                                                               |
|----------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| First landscape critique (this chat)                     | Six-doc taxonomy; freshness/provenance as the open gap; budgeted packets; lifecycle semantics; cross-harness; evals                                                                                                                        | Nobody applies freshness uniformly across spec, plan, state and handoff; nobody measures | The pitch as "docs MCP"                                                                                                                            |
| Gemini's design                                          | get_current_mission() task-scoped packet; log_decision(impacts_spec); handoff from structured state + git; four-tier mental model (North Star / Execution State / Institutional Memory / Ephemeral Bridge); CLAUDE.md as a one-line router | Sharpest mechanism ideas in the thread; the packet is the biggest token lever            | complete_task(verification_proof) as an MCP gate; mindmap.md parsed for impact; compile_context_files() as a feature; three overlapping state docs |
| Caveman ecosystem                                        | /caveman-stats-style honest measurement from the session JSONL; keep the tool manifest tiny; terse-by-schema (structured state) not terse-by-rewrite; optional style toggle outside the core                                               | Measurement is the thing nobody else has; a small manifest beats a compressed one        | Caveman mode as a core feature (~8.5% on agentic work, adds input tokens); lossy prose compression of specs and handoffs                           |
| Beads / Claude Code Tasks                                | Structured, dependency-aware task store as the only todo; bd prime on SessionStart and PreCompact; "do not use markdown TODO lists"                                                                                                        | Markdown todos are the anti-pattern every tool converged away from                       | A markdown todo.md                                                                                                                                 |
| GSD                                                      | Verify step in a fresh-context subagent before a phase is declared done; STATE.md as the single mutable state doc                                                                                                                          | Verification by execution, not by claim                                                  | Its full planning ceremony (superpowers already covers it)                                                                                         |
| Hook-based handoff tools (tapout, session-handover, chf) | PreCompact + SessionEnd hooks that write the handoff automatically; task-state.json beside HANDOFF.md                                                                                                                                      | The "lazy handoff" problem is solved by hooks, not by a skill the agent remembers to run | Transcript as the only source of the handoff                                                                                                       |
| adr-kit / sqlew / AdrMcp                                 | adr_preflight before a load-bearing choice; supersede chains; conflict detection; MADR-compatible files                                                                                                                                    | Decision logs for agents already have a format and tools                                 | A proprietary decision format                                                                                                                      |
| Code-graph MCPs                                          | Impact analysis derived from code (tree-sitter), PASS/WARN/BLOCK gate                                                                                                                                                                      | A maintained graph file rots; code does not                                              | Hand-maintained mindmap as input                                                                                                                   |
| rulesync / agent-policy / Ma'at                          | Generate CLAUDE.md, AGENTS.md and Cursor rules from one source; CI gate on drift                                                                                                                                                           | Commodity, free to adopt                                                                 | Rebuilding it                                                                                                                                      |
| Anthropic context-engineering guidance                   | Structured note-taking outside the window; just-in-time retrieval; sub-agents for isolation                                                                                                                                                | The theoretical backbone of the whole idea                                               | Loading everything "just in case"                                                                                                                  |

Two cross-cutting lessons: the ecosystem converged on **CLI + hooks + one line in AGENTS.md** (Beads, ctx, project-memory-mcp all note the file-based path works even where third-party MCP is disabled), and every durable piece is either a **skill** (open standard, progressive disclosure) or a **hook** (deterministic). The MCP is the least durable part of the original pitch.

## Recommended design

Build a CLI-first continuity layer: .context/ in git as the source of truth, hooks for enforcement, skills for the workflow, and an optional four-tool MCP adapter, sitting on existing task stores, ADR tools and rules generators rather than replacing them.

<img src="./media/architecture.png" style="width:6in;height:3.40178in" alt="continuity layer architecture · 3 entry points, 1 CLI, 4 stores" />

continuity layer architecture · 3 entry points, 1 CLI, 4 stores

Skills, hooks and the MCP adapter are three entry points to one CLI; the CLI is the only thing that writes to .context/, the task store and the session stats, so enforcement has one place to live.

### Principles

1.  **Files in git are the truth.** .context/ is committed, human-readable, diffable. No server owns state.

2.  **Structured where mutable, prose where stable.** Tasks, state and decisions are structured (JSON, YAML frontmatter, tables); the spec is prose.

3.  **Every section carries provenance.** A verified_at commit SHA and source_paths; stale sections are flagged or withheld.

4.  **Smallest fresh brief.** Nothing loads by default except the mission packet; everything else is retrieved on demand.

5.  **Hooks enforce, skills guide, MCP adapts.** Deterministic gates live in hooks; SOPs live in skills; the MCP exposes queries.

6.  **Measured.** Every claim about tokens, drift or corrections comes from the session log.

### Document taxonomy (six, not nine)

| Doc                                      | Role                                   | Mutation rule                                                       | Loaded when                                 | Backed by                  |
|------------------------------------------|----------------------------------------|---------------------------------------------------------------------|---------------------------------------------|----------------------------|
| AGENTS.md (+ one-line CLAUDE.md pointer) | Rules and router, ≤ 60 lines           | Generated from .context/rules.md; never hand-edited                 | Every session, by the harness               | rulesync / agent-policy    |
| spec.md                                  | Intent and boundaries (the North Star) | Rarely; a change needs an ADR                                       | Only the sections tagged to the active task | —                          |
| decisions/ (ADRs)                        | Why, and the constraints that follow   | Append-only; supersede, never edit                                  | On preflight and in the packet              | adr-kit / MADR format      |
| Task store                               | What is next, with dependencies        | Only through the store's CLI                                        | ready tasks in the packet                   | Beads or Claude Code Tasks |
| STATE.md                                 | Current phase, blockers, last handoff  | Overwritten, never appended; regenerated at PreCompact / SessionEnd | Top of the packet                           | tapout-style hooks         |
| knowledge/ (topics + gotchas)            | How-to, patterns, pitfalls             | Append, then periodic compact                                       | On demand by topic                          | Auto Memory, bd remember   |

Derived and never maintained by hand: a dependency or mindmap render (from the task graph and the code graph) and any human dashboard.

### Components

**CLI** (the only write path to state):

- init scaffolds .context/, installs hooks, writes the AGENTS.md pointer.

- mission --budget N returns the packet: STATE head, ready tasks, spec sections tagged to them, last handoff warnings, stale flags.

- handoff writes STATE.md from the task store, git status and git diff --stat, and the last N tool calls; an LLM summary is optional and labelled.

- drift runs the freshness check: dead refs, per-section SHA drift, stale tasks, orphan topics, oversized rules.

- decide runs ADR preflight, creates or supersedes a record, and flags conflicts with spec sections.

- verify \<task\> runs the task's check command and marks it done only on success.

- compile regenerates AGENTS.md, CLAUDE.md and Cursor rules.

- stats reads the session JSONL and reports tokens at session start, doc tokens per task, corrections and drift events.

**Hooks** (Claude Code first; Codex and Gemini equivalents where available):

- SessionStart → inject mission output.

- PreCompact, SessionEnd → handoff.

- PreToolUse on Edit\|Write to STATE.md, the task store or decisions/ → deny with "use the CLI".

- PreToolUse on Edit to package.json, lockfiles, migrations → decide --preflight.

- Stop (per-project opt-in) → verify the active task.

- PostToolUse on Edit → mark sections whose source_paths were touched as *aging*.

**Skills** (thin SOPs that call the CLI): /init-spec interviews, writes spec.md with section ids and source_paths, and records load-bearing choices via decide; /checkpoint closes done tasks, appends gotchas, refreshes STATE; /handoff is the human-reviewed form of the hook's output; /decide guides an ADR; /doc-audit runs drift and proposes fixes.

**MCP adapter** (optional, four tools, one-line descriptions): mission, decide, verify, search (full-text over .context/). Nothing else; file reads cover the rest.

### Freshness model

Each section carries frontmatter: id, kind (rule \| intent \| decision \| state \| knowledge), verified_at (commit SHA), source_paths. Four levels:

| Level      | Condition                           | Packet policy                         |
|------------|-------------------------------------|---------------------------------------|
| Fresh      | Sources unchanged since verified_at | Injected                              |
| Aging      | Sources changed, under N commits    | Injected with a one-line flag         |
| Stale      | Over N commits, or a dead reference | Withheld; listed as "needs re-verify" |
| Superseded | A newer ADR or section replaces it  | Linked, not injected                  |

Re-verification is cheap: verify-doc \<section\> after a human or agent reads it bumps the SHA. This generalises the per-memory checks in ContextForge and bettermemory to every document section.

### Verification model

A task carries a check command (tests, lint, a script). verify runs it and marks the task done only on exit 0 with a non-empty diff (or an explicit --no-diff). For phases, an optional fresh-context reviewer sub-agent follows the GSD and superpowers pattern. No proof string is accepted from the model.

### Integrations

Beads (bd ready --json) or Claude Code Tasks as the task backend; adr-kit's MADR format for decisions; a code-graph MCP for impact in decide --preflight; rulesync-compatible output; superpowers or Spec Kit upstream for spec and plan creation. The layer consumes their outputs; it does not replace them.

## What to change from the original idea

Nine changes, each with the replacement; the original idea's instincts were right, its shape was not.

| Original                                                                                    | Change   | Replace with                                                                               | Reason                                                                                                                                    |
|---------------------------------------------------------------------------------------------|----------|--------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| "Keep the AI from hallucinating"                                                            | Reframe  | "Keep the agent continuous: nothing stale reaches the model, nothing decided is forgotten" | Docs address amnesia and drift, not fabrication; stale docs cause confident wrongness                                                     |
| MCP as the core                                                                             | Demote   | CLI + hooks as the core; MCP as a four-tool adapter                                        | Agents don't call memory unprompted; MCP can't block Edit; file path works where MCP is disabled; every always-on tool costs input tokens |
| Nine documents (specs, plans, handoffs, CLAUDE.md, AGENTS.md, mindmap, status, todo, notes) | Collapse | Six: rules, spec, decisions, task store, STATE, knowledge                                  | Overlap between todo/status/handoff/plan; each file rots and costs tokens                                                                 |
| todo.md in markdown                                                                         | Drop     | Beads or Claude Code Tasks                                                                 | The one anti-pattern every tool converged away from                                                                                       |
| mindmap.md as a maintained input                                                            | Drop     | Derived render from the task graph + a code-graph MCP                                      | A hand-kept graph rots; impact analysis comes from code                                                                                   |
| Agent-written handoff at end of session                                                     | Replace  | Hook-generated STATE from task store + git, at PreCompact and SessionEnd                   | Removes the "lazy handoff at 80% context" failure                                                                                         |
| Skills that write status/todo/notes documents                                               | Narrow   | Skills that call the CLI, carrying taxonomy and lifecycle rules                            | Writing-skills exist in superpowers, GSD, Conductor; the opinion is the product                                                           |
| Docs loaded every session                                                                   | Replace  | A budgeted mission packet; sections on demand                                              | Context-rot evidence; "don't load" beats "compress"                                                                                       |
| Token savings as a feature (caveman-style)                                                  | Replace  | A stats command with real numbers from the session log                                     | Style savings measure ~8.5% on agentic work; a number you can show is the feature                                                         |

Two things to keep exactly as you had them: the instinct that a **dedicated handoff document** is the unit of continuity (right, but generate it), and the instinct that **AGENTS.md / CLAUDE.md should be tiny routers** pointing at the layer (right; that is the Beads pattern).

## Risks and open questions

The largest risk is absorption by the harness; the rest are design questions you can answer with the dogfooding phase.

| Risk                                                                                                                            | Likelihood | Mitigation                                                                                                                                                                          |
|---------------------------------------------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Harness absorption.** Claude Code added Auto Memory, Tasks, rules dirs and Dreaming within a year; Beads became native Tasks. | High       | Integrate with native memory and Tasks rather than replacing them; keep the cross-harness (Codex, Gemini, Cursor) story; own the freshness + measurement layer the harness does not |
| **Author overlap.** The caveman author ships cavemem; ActiveMemory ships ctx with drift; ctxkit syncs with Spec Kit.            | Medium     | Differentiate on section-level provenance and the stats command; consider contributing to ctx instead of competing if the gap closes                                                |
| **Freshness false positives.** SHA drift on a touched file does not mean the section is wrong.                                  | High       | Three levels (fresh/aging/stale), cheap re-verify, N-commit threshold per kind; measure flag precision in dogfooding                                                                |
| **Maintenance burden moves, not disappears.** Someone still has to re-verify sections and write source_paths.                   | Medium     | /init-spec writes source_paths at creation; PostToolUse marks aging automatically; drift proposes fixes                                                                             |
| **Hook portability.** PreCompact / SessionEnd semantics differ across Codex, Gemini CLI and Cursor.                             | Medium     | Claude Code first; degrade to SessionStart + manual /handoff elsewhere; document the matrix                                                                                         |
| **Multi-session and multi-agent writes.** Cloud sessions and cross-session messaging make concurrent STATE writes real.         | Medium     | STATE is regenerated, never merged; tasks live in a store with claim semantics (Beads' --claim)                                                                                     |
| **Scope creep into a planning framework.**                                                                                      | High       | Hard rule: no spec or plan authoring beyond /init-spec; superpowers and Spec Kit are upstream                                                                                       |
| **Unproven value.** Static context files show no significant correctness effect in a 2026 naturalistic study.                   | High       | Ship the stats command first and publish before/after numbers; if the numbers are flat, stop                                                                                        |

Open questions to settle during dogfooding:

- [ ] What N (commits) marks a section *stale* per kind? Rules and state should age faster than intent.

- [ ] Does the mission packet need spec sections at all, or do ADR summaries plus task descriptions carry enough intent?

- [ ] Beads or Claude Code Tasks as the default backend? Beads is cross-harness; Tasks needs no install.

- [ ] Is search in the MCP adapter worth its tool-definition tokens, or does Grep on .context/ suffice?

- [ ] Should verify require a non-empty diff, or do some tasks legitimately end with no code change?

## How to measure it

Five metrics, all computable from the session JSONL and git, decide whether the layer earns its place; the first three are the product's pitch.

| Metric                  | Definition                                                                     | Source                                       | Target to beat                           |
|-------------------------|--------------------------------------------------------------------------------|----------------------------------------------|------------------------------------------|
| Tokens at session start | Input tokens injected before the first user turn (rules + packet)              | Session JSONL                                | Your current CLAUDE.md + handoff.md load |
| Doc tokens per task     | Input tokens spent reading .context/ files during a task                       | Session JSONL, tool calls on .context/ paths | Baseline: reading whole files            |
| Corrections per session | User turns that reverse or correct the agent ("no", "we decided", "don't")     | Session JSONL, simple classifier             | Baseline sessions without the layer      |
| Drift incidents caught  | Stale or dead-ref sections flagged before injection, and later confirmed wrong | drift log + human confirmation               | Precision above 70%; recall tracked      |
| Time to resume          | Wall-clock from session start to first code edit on a continued task           | Session JSONL timestamps                     | Baseline with manual handoff paste       |

**Method.** Use the paired A/B design JetBrains used on caveman: the same task set run with and without the layer, several runs each, a sign test on output quality so savings are not bought with worse code ([JetBrains method](https://blog.jetbrains.com/ai/2026/07/speak-to-ai-agents-like-cavemen-tosave-tokens/)). Count the layer's own overhead (hook output, packet size, MCP tool definitions) against the savings, as caveman's stats command does for its rules.

**Eval harness.** Follow bettermemory's eval idea: replay your own session log and score whether an injected section was used, ignored or contradicted ([bettermemory](https://pypi.org/project/bettermemory/3.32.0/)). A section that is never used in ten sessions is a candidate for on-demand only; a section contradicted twice is a freshness bug.

**Decision rule.** If, after two weeks of dogfooding, tokens at session start drop by less than 30% and corrections per session do not fall, the layer is not worth shipping; publish the numbers either way.

## Roadmap

Four phases over roughly 13 weeks, each gated on a measured result; the MVP gate is the decision rule from the metrics section.

<img src="./media/roadmap.png" style="width:6in;height:1.89286in" alt="roadmap · 4 phases, 4 gates, about 13 weeks" />

roadmap · 4 phases, 4 gates, about 13 weeks

Phase 0 costs nothing to build: install ctx, Beads and the PreCompact recipes on your own projects for two weeks and record the baseline. The MVP is only freshness, the mission packet, the hook-made handoff and stats; if its gate fails, stop and publish the numbers. Gates and reach come only after the numbers hold.

What each phase ships:

1.  **Dogfood (2 weeks).** Existing tools only. Baseline tokens at session start, corrections per session, time to resume. Settle the open questions on N, backend and packet contents.

2.  **MVP (3 to 4 weeks).** init, frontmatter with verified_at and source_paths, mission --budget, drift, handoff from task store + git, stats; SessionStart and PreCompact hooks; /init-spec and /checkpoint skills.

3.  **Gates (3 weeks).** decide with adr-kit-compatible records and spec-conflict flags, verify with check commands, PreToolUse denies on state files and preflight on dependency files, compile via a rulesync-class generator.

4.  **Reach (4 weeks).** Four-tool MCP adapter, Codex and Gemini hook equivalents, skills published through the skills ecosystem, paired A/B benchmark published with the harness.

## Sources

Pages opened during the three research passes in this conversation, grouped by topic. Star counts and release dates are as reported on those pages on 2026-10-15.

**Evidence on context and docs**

- [Do Context Files Help Coding Agents? (arXiv 2607.27250)](https://arxiv.org/pdf/2607.27250)

- [CORVUS: context optimization for coding agents (arXiv 2607.22711)](https://arxiv.org/pdf/2607.22711)

- [LogRocket: context rot in coding agents](https://blog.logrocket.com/?p=213608) · [Unblocked: what is context rot](https://getunblocked.com/blog/what-is-context-rot/)

- [Anthropic context-engineering summary](https://agentic-ai.readthedocs.io/en/latest/ContextEngineering/anthropic/)

- [JetBrains: caveman paired A/B benchmark](https://blog.jetbrains.com/ai/2026/07/speak-to-ai-agents-like-cavemen-tosave-tokens/) · [10 token-reduction tools tested](https://computingforgeeks.com/reduce-claude-code-token-usage-tools/)

**Closest existing tools**

- [ActiveMemory ctx](https://pkg.go.dev/github.com/ActiveMemory/ctx@v0.1.1) · [ctx memory bridge](https://pkg.go.dev/github.com/ActiveMemory/ctx/internal/memory) · [ctxkit](https://skillselion.com/skills/szaher/contextual/packages/claude-plugin)

- [GSD](https://github.com/gsd-build/get-shit-done) · [GSD Core](https://p.codekk.com/detail/6a1720c55b02fc5c75bba13a)

- [Conductor](https://github.com/gemini-cli-extensions/conductor) · [InfoQ on Conductor](https://infoq.com/news/2026/01/google-conductor/) · [Claude Code port](https://github.com/lackeyjb/claude-conductor)

- [Spec Workflow MCP](https://vibeindex.ai/marketplaces/Pimzino/spec-workflow-mcp) · [Archon](https://github.com/k1dav/archon) · [Sprintra](https://glama.ai/mcp/servers/Sprintra-io/sprintra-mcp/tree) · [Mymir](https://github.com/frkak/mymir) · [KontextMind](https://github.com/nikzdevz/KontextMind)

- [Cline Memory Bank](https://docs.cline.bot/features/memory-bank.md) · [ConPort](https://www.sourcepulse.org/projects/3758880) · [ConPort activity](https://gittrend.io/repo/GreatScottyMac/context-portal)

**Tasks, handoff and native memory**

- [Beads README](https://github.com/MovGP0/beads) · [Introducing Beads](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a) · [Beads and Claude Code Tasks](https://www.morphllm.com/beads-agent-memory) · [Linear, Beads and Tasks](https://dev.to/frr149/linear-beads-and-tasks-three-memory-layers-for-claude-code-kg3)

- [Claude Task Master review](https://claudecodeguides.com/claude-task-master-setup-guide-2026/) · [Taskmaster MCP](https://www.augmentcode.com/mcp/taskmaster-mcp-server)

- [tapout](https://pypi.org/project/tapout/) · [session-handover](https://pypi.org/project/session-handover/0.4.0/) · [claude-handoff](https://pypi.org/project/claude-handoff/0.17.0/) · [claude-remember](https://github.com/Digital-Process-Tools/claude-remember) · [PreCompact recipes](https://github.com/topics/precompact)

- [Claude Code memory overview](https://claude.nagdy.me/learn/memory) · [XDA on Auto Memory](https://www.xda-developers.com/gave-claude-code-memory-between-sessions-setup-started-running-itself/) · [Claude (Wikipedia), Dreaming](https://en.wikipedia.org/wiki/Claude_(language_model))

- [Claude Code hooks guide (2026-10-05)](https://dev.to/shoustak/claude-code-hooks-a-practical-guide-with-examples-3hlj) · [hook examples](https://stevekinney.com/courses/ai-development/claude-code-hook-examples)

**Freshness, decisions, impact, rules**

- [drift-ai](https://pypi.org/project/drift-ai/) · [drift-doc](https://github.com/raphabruno7/drift-doc) · [claude-drift](https://github.com/marky291/claude-drift) · [ContextForge freshness tool](https://glama.ai/mcp/servers/alfredoizdev/contextforge-mcp/tools/memory_check_freshness) · [bettermemory](https://pypi.org/project/bettermemory/3.32.0/) · [Agentmem](https://mcp.so/server/agentmem/Thezenmonster)

- [adr-kit](https://github.com/kschlt/adr-kit) · [sqlew](https://lobehub.com/mcp/sqlew-io-sqlew) · [AdrMcp](https://nuget.org/packages/adrmcp)

- [code-graph-mcp](https://lobehub.com/mcp/sdsrss-code-graph-mcp) · [CodeImpact MCP](https://github.com/vk0dev/code-impact-mcp) · [Codebase-Memory paper](https://www.researchgate.net/publication/403308415_Codebase-Memory_Tree-Sitter-Based_Knowledge_Graphs_for_LLM_Code_Exploration_via_MCP)

- [Rules sync comparison](https://developertoolkit.ai/en/ecosystem/frameworks/rules-sync/) · [agent-policy](https://docs.rs/crate/agent-policy/latest) · [Ma'at](https://pkg.go.dev/github.com/getmaat/maat)

**Frameworks, standards, token tools**

- [superpowers](https://www.rulesell.com/topic/superpowers) · [superpowers issue \#512](https://github.com/obra/superpowers/issues/512) · [Spec-driven tools 2026 (MarkTechPost)](https://www.marktechpost.com/2026/05/08/9-best-ai-tools-for-spec-driven-development-in-2026-kiro-bmad-gsd-and-more-compare/) · [Augment comparison](https://www.augmentcode.com/tools/best-spec-driven-development-tools)

- [AGENTS.md / AAIF](https://agentic-ai.readthedocs.io/en/latest/Standards/agents-md/) · [Agent Skills standard](https://productbuilder.net/learn/agent-skills) · [Skills vs AGENTS.md](https://env.dev/ai/agent-skills)

- [caveman README](https://github.com/vadbosh/caveman) · [caveman docs](https://docsearch.algolia.com/mcp/docs/repo/juliusbrussee/caveman) · [caveman-code](https://docsearch.algolia.com/mcp/docs/repo/juliusbrussee/caveman-code) · [caveman-shrink rationale](https://github.com/OpenSIN-Code/SIN-Code/issues/173)
