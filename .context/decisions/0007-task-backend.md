---
id: adr-0007
kind: decision
status: "superseded by ADR-0009"
date: 2026-10-16
decision-makers: [maintainer]
verified_at: null
source_paths: [src/core/tasks/**]
spec_sections: [tasks]
---
# Task backend: Beads by default; Claude Code Tasks read-only

## Context and Problem Statement

baton never keeps its own todo list. It needs a structured, dependency-aware store it can read ready work from and close tasks in. The report left Beads vs Claude Code Tasks open.

## Considered Options

* Beads (`bd`): documented CLI with `--json`, cross-harness, claim semantics, Dolt storage
* Claude Code Tasks: no install, but stored in `~/.claude/tasks/<list-id>/` with an undocumented format; `CLAUDE_CODE_TASK_LIST_ID` is undocumented and overwritten by interactive sessions

## Decision Outcome

Proposed: `tasks.backend: auto` prefers Beads when `bd` is available, else no task block. A Claude Code Tasks adapter is read-only and best effort, preferably fed by TaskCreated/TaskCompleted hooks rather than reading files.

Settle during Phase 0 dogfooding; accept or supersede this record then.
