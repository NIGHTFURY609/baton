---
id: adr-0027
kind: decision
status: accepted
date: 2026-10-30
decision-makers: [NIGHTFURY609]
verified_at: "d3bf40b6dadf"
source_paths: ["src/hooks/guards.ts", "src/hooks/pre-tool-use.ts", "src/core/guards-config.ts", "src/core/config.ts", "plugin/hooks/hooks.json"]
supersedes: "0026"
spec_sections: [hooks, decisions, tasks]
---
# PreToolUse guards: a guards-only config read and heredoc scanning inside the work budget

## Context and Problem Statement

This record carries ADR 0026 forward unchanged except for the two points below; read that record for the protected targets, the shell heuristic, quoting, the deny and preflight. Two findings forced them:

* **Hook budget (bt-u75).** On an idle CPU (2026-10-30, `node -e 0` 56 ms), `hook pre-tool-use` took 96 ms on ordinary Bash and 168 ms on an in-repo edit. The difference is the config load. Of its imports, zod costs about 1.5 times yaml, while parsing the file and the schema costs under 20 ms together. PreToolUse reads only `guards.protectState` and `guards.preflightPaths`.
* **Scanner cost (bt-6yv).** The raw-text heredoc and here-string scanner was outside the work budget and had no depth cap. Nested unquoted heredocs were scanned twice per level, so about 22 levels took seconds, 40 exhausted the heap, and about 2000 nested `<<'A'` or 4250 `@'` threw a RangeError. Each of those fails open, so ADR 0026's "no command can make the shell scan throw or run unbounded" was false.

## Considered Options

* Read only the guards keys with yaml, without zod
* Cache the parsed config under .context/.cache keyed by mtime
* Keep the full schema and accept the budget miss

## Decision Outcome

Chosen option: "Read only the guards keys with yaml, without zod", because it removes the largest import and adds no on-disk state to keep in step with the config. The mtime cache would also avoid yaml, but it writes a new file from a hook and can serve a stale `protectState`. The raw-text scanner also moves inside the work budget, with a nesting cap.

* **Budget** replaces ADR 0026's bullet of that name. Target < 150 ms.
  * A shell command that mentions no protected path and adds no dependency loads nothing beyond the guard module.
  * An edit, a deny or a preflight loads `src/core/guards-config.ts`, which reads the `guards` section with yaml and checks those two keys by hand. It does not import zod.
  * Only preflight loads the section index.
* **Fail open** replaces ADR 0026's bullet of that name (ADR 0008). Any error gives stderr and no deny, including YAML that does not parse, a top level that is not a mapping, and an invalid `guards` key. A key outside `guards` is not read, so an invalid one no longer turns the guards off. `test/guards-config.test.ts` holds the reader to `ConfigSchema` on both valid and invalid `guards` values.
* **Work** replaces ADR 0026's cap of that name. The scan reads at most 64 KiB (65 536 characters) in all, summed over the command, its segments, every nested body it follows and every heredoc or here-string body the raw-text scanner opens, once per pass. Past that, every protected path the command mentions counts as written.
* **Nesting** is a new cap. Heredoc and here-string bodies are followed at most 4 levels deep, and past that the command fails safe in the same way. A body inside a literal pass is not scanned a second time, so the passes do not double per level.

### Consequences

* Good, because an in-repo edit costs about 90 ms less, measured by loading both paths alternately in one run (54 ms over bare node against 144 ms).
* Good, because a command can no longer make the raw-text scanner run long or throw: it denies when the command mentions a protected path.
* Good, because a typo elsewhere in `config.yaml` no longer switches the guards off.
* Bad, because `guards-config.ts` repeats two checks from `ConfigSchema`. The parity test catches drift in those keys, not a new key added to `guards`.
* Bad, because preflight and the PostToolUse notice still load the section index, so they remain over 150 ms.
* Bad, because a legitimate command with heredocs nested past 4 levels that mentions a protected path is denied. That form is not one agents write.

## More Information

Preflight at creation (baton decide): 10 constraining, 5 related, 0 possibly related.

* constrains: ADR 0001 (accepted) "Record decisions as MADR 4.0 in .context/decisions/" (spec: decisions)
* constrains: ADR 0004 (accepted) "Mission packet budget is in characters: default 9,000, max 10,000" (path: src/core/config.ts; keyword: budget)
* constrains: ADR 0005 (accepted) "Write the full handoff at PreCompact; SessionEnd does a fast write" (path: plugin/hooks/hooks.json)
* constrains: ADR 0008 (accepted) "Hooks run as exec-form node, fail open, and guard the shell too" (path: src/hooks/guards.ts; spec: hooks)
* constrains: ADR 0009 (accepted) "Native task store ported from Beads: JSONL in git, SQLite cache" (spec: tasks)
* constrains: ADR 0014 (accepted) "Mission packet assembly" (spec: tasks)
* constrains: ADR 0018 (accepted) "decide: MADR lifecycle, supersede by status, and preflight" (spec: decisions)
* constrains: ADR 0019 (accepted) "verify closes a task on passing checks and a non-empty diff; opt-in Stop gate" (path: src/core/config.ts; spec: tasks)
* constrains: ADR 0021 (accepted) "Uncommitted source changes age sections; PostToolUse notices touched sections" (spec: hooks)
* constrains: ADR 0024 (accepted) "Shell tool-call summaries show only allowlisted words" (path: src/hooks/guards.ts; spec: hooks)
* related: ADR 0026 (accepted) "PreToolUse guards: raw-text quoting, the message heredoc form and a work budget" (path: src/hooks/guards.ts; spec: hooks, decisions, tasks; keyword: pretooluse, guards, heredoc, work, budget; replaced by this decision)
* related: spec hooks "Hooks" (path: src/hooks/guards.ts; spec: hooks)
* related: spec tasks "Tasks" (spec: tasks)
* related: spec decisions "Decisions" (spec: decisions)
* related: knowledge knowledge-harness-limits "Harness limits that bite" (path: src/hooks/guards.ts)
