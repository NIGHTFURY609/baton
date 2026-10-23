---
id: adr-0014
kind: decision
status: accepted
date: 2026-10-20
decision-makers: [maintainer]
verified_at: "428730e2882f"
source_paths: [src/core/mission.ts, src/core/tasks/snapshot.ts, src/commands/mission.ts]
spec_sections: [mission-packet, tasks]
---
# Mission packet assembly

## Context and Problem Statement

ADR 0004 fixes the budget, and `docs/design/context-format.md` lists the blocks. Roadmap Phase 1 requires three things: stale and unverified sections withheld *and listed*; ready tasks with their `spec:` sections; and memories within the budget.

## Decision Outcome

* **Header.** The text starts with the fixed line `# baton mission brief` (`stats` uses it to find baton's packet in transcripts). One line follows, naming the project, HEAD, the generation time and the sources.
* **Blocks and priorities.** Lower numbers are kept first (`fitToBudget`).

  | Priority | Block |
  |---|---|
  | 0 | State head |
  | 1 | Tasks: in-progress first, then ready; epics excluded; at most `packet.maxTasks`; `--task <id>` selects one |
  | 2 | Freshness notices: counts, aging flags, withheld stale and unverified ids, superseded ids, unknown spec ids, index problems |
  | 3 | Sections named by the selected tasks' `spec:` labels, fresh or aging only |
  | 4 | One line per accepted, injectable ADR whose `spec_sections` meet those labels |
  | 5 | One block per memory |
  | 6 | Pointers |

  Freshness notices move ahead of spec bodies (the design doc listed them fourth), so the withheld list survives a tight budget.
* **State head.** The body of `.context/STATE.md` after its `# ` title, up to the second `## ` heading. It is injected only when STATE is fresh or aging, together with the number of commits outside `.context/` since STATE was generated.
* **Budget.** `packet.maxChars`, or `--budget` (1–10,000), covers everything: the header, the separators, and a 100-character reserve for the line `Left out for space: <n> block(s); baton mission --format json lists them.` Blocks are never cut.
* **Phrasing.** Statements only, no imperatives (hooks docs, implementation notes §1).
* **Task data.** Tasks come from a read-only snapshot of the task store. `beads` gives ready tasks only; `none` and `claude-tasks` give none.
* **Lenient index.** A broken `.context/` file degrades the packet (it is listed as a problem) instead of removing it.
* **Cache.** Each run writes `.context/.cache/last-packet.txt` and `.context/.cache/last-packet.json`. If the cache cannot be written, `baton mission` reports it on stderr and carries on. The session-start hook ignores the failure silently, because hook stderr is shown on every session start.
* **Testing.** The roadmap's "snapshot test on this repo" is met by two tests together. This repo's packet changes with every doc edit, so a byte snapshot of it would break constantly.
  * An exact snapshot of a fixture repo's packet, with SHAs, task ids and the project name normalised.
  * Assertion-only checks on this repo's own packet: the budget, the header, withheld ids listed and their bodies absent, tasks present.

### Consequences

* Good, because the withheld list and the tasks survive any budget, and `stats` can find the packet.
* Bad, because section bodies are the first large thing dropped when the budget is tight.
