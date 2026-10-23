---
id: adr-0010
kind: decision
status: accepted
date: 2026-10-20
decision-makers: [maintainer]
verified_at: "428730e2882f"
source_paths: [src/core/explain/**, src/commands/explain.ts, plugin/skills/baton/**]
spec_sections: [scope, skills]
---
# Add on-demand `explain` and a `/baton` router skill

## Context and Problem Statement

Minutes before a hackathon presentation, the maintainer needed to understand one feature well enough to talk about it, and writing a good prompt for an AI took time there was none of. A short command should return a usable explanation of one project element in a voice the user picks (caveman, baby, student, or their own). baton is well placed for this because `.context/` and `docs/` already hold why things exist, not just what the code does.

The spec lists "output-style compression (caveman-style)" as a load-bearing non-goal. On-demand explanation voices touch that line, so the scope change needs a record before any code. A second need is one agent-side entry point that mirrors the CLI, so `/baton <args>` in an agent means `baton <args>` in a terminal.

## Decision Outcome

* **Scope:** the non-goal narrows to *always-on* output compression (caveman-style token savers). On-demand explanations of one project element in a chosen voice are in scope, as is the `/baton` skill. `.context/spec.md` sections `scope` and `skills` are updated accordingly.
* **Template file format:** markdown with YAML frontmatter holding `name` and `description`; the body is the prompt given to the agent. Names are slugged (`"hackathon judge"` is stored as `hackathon-judge`).
* **Template locations and precedence:** project `.context/explain/<slug>.md` (committed, shared through git), personal `~/.baton/explain/<slug>.md` (`%USERPROFILE%\.baton\explain\` on Windows), and built-ins shipped with baton. On a name clash the order is project, then personal, then built-in. Built-ins cannot be deleted.
* **The `/baton` skill:** one plugin skill at `plugin/skills/baton/SKILL.md` with frontmatter `name: baton`, invocable as `/baton`. It runs `baton $ARGUMENTS` and acts on the output. When a subcommand already has a dedicated skill with extra steps (`handoff`, `decide`, `checkpoint`, `doc-audit`, `init-spec`), `/baton <that>` follows that skill instead of running the bare command; the skill holds a short routing table for this. For `explain`, the agent writes the explanation from the CLI output, following the template, with the user's own words taking priority.
* **The CLI never calls a model.** `baton explain` gathers facts and template instructions; the agent writes the text. No API key and no model dependency are added.
* Where there is no ADR or `.context/` section for why something exists, the output carries a `no recorded reason` marker and the explanation must say so rather than invent a purpose.

### Consequences

* Good, because a presenter gets a short, sourced explanation in seconds, in the voice they choose, and the same entry point works for every baton command.
* Bad, because the maintained surface grows (templates, resolution rules, a skill) outside the phase gates, and the scope line in the spec is now a judgement about what counts as always-on.
