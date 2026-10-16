---
id: adr-0006
kind: decision
status: accepted
date: 2026-10-16
decision-makers: [maintainer]
verified_at: null
source_paths: [AGENTS.md, CLAUDE.md, templates/AGENTS.md, templates/CLAUDE.md]
spec_sections: [context-format]
---
# AGENTS.md is a small router; CLAUDE.md is a one-line import

## Context and Problem Statement

AGENTS.md is the cross-harness standard (Codex, Gemini via `context.fileName`, and Claude Code since v2.1.277). Claude Code reads AGENTS.md natively only when no CLAUDE.md exists, and many projects already have a CLAUDE.md.

## Decision Outcome

AGENTS.md holds the rules (≤ 60 lines, generated from `.context/rules.md` once `compile` exists) and points to `.context/`. CLAUDE.md contains only `@AGENTS.md`, which loads AGENTS.md in every Claude Code configuration.

### Consequences

* Good, because one source of rules serves every harness, and always-on context stays small.
* Bad, because a hand-edited AGENTS.md drifts from rules.md until `compile --check` runs in CI (Phase 2).
