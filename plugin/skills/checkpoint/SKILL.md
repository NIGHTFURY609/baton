---
name: checkpoint
description: Close finished tasks through their checks, capture new gotchas in .context/knowledge, and regenerate STATE.md. Use at natural stopping points, after finishing a task, or when the user says checkpoint, wrap up, or save progress.
license: MIT
---
# Checkpoint

A checkpoint turns what just happened into durable, structured state. It never writes a free-form log.

## Steps

1. For each task you finished this session, run `baton verify <task-id>`. If the check fails, leave the task open and say why. Never mark a task done any other way.
2. Gotchas: for each non-obvious thing learned (a tool quirk, an environment fact, a pattern that worked), append a short bullet to the matching `.context/knowledge/<topic>.md`. Create the topic file with frontmatter (`id`, `kind: knowledge`, `verified_at: null`, `source_paths`) if it does not exist. One fact per bullet; no narrative.
3. If a spec section you relied on turned out wrong, do not edit it silently: tell the user, and propose a `baton decide` record if the change is load-bearing.
4. Run `baton handoff --reason manual` to regenerate `.context/STATE.md`.
5. Run `baton drift` and mention any section that became stale.

## Rules

- STATE.md is overwritten by `baton handoff`; never edit it by hand.
- Do not create todo files. New work goes into the task store: `baton task create "<title>" --spec <section-id> --check "<command>"`; follow-ups found while working get `--deps discovered-from:<current-task>`.
