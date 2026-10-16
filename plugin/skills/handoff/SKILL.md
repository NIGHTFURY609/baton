---
name: handoff
description: Produce a human-reviewed handoff for the next session by regenerating STATE.md from the task store and git, then adding warnings the user confirms. Use when the user is about to end a session, switch machines or agents, or asks for a handoff.
license: MIT
---
# Handoff

The PreCompact and SessionEnd hooks already write a deterministic handoff. This skill is the reviewed version.

## Steps

1. Run `baton handoff --dry-run` and show the user the result.
2. Ask whether anything is missing that the next session must know: an in-flight decision, a dead end already tried, a constraint discovered. Keep each to one line.
3. Add confirmed items as warnings: `baton handoff --reason manual` writes STATE.md; then put each warning into the right durable place — a task (`baton task create`, or `baton task comment <id>` for an existing one), a knowledge bullet, or a decision (`baton decide`) — so it survives the next regeneration.
4. Confirm the packet the next session will see: `baton mission`.

## Rules

- Source of truth is structured state plus git, not your recollection. If the dry run disagrees with what you remember, trust the dry run and ask.
- Never edit STATE.md by hand.
