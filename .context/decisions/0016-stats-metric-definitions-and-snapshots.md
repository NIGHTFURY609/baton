---
id: adr-0016
kind: decision
status: accepted
date: 2026-10-20
decision-makers: [maintainer]
verified_at: "428730e2882f"
source_paths: [src/core/stats.ts, src/core/transcript.ts, src/commands/stats.ts]
spec_sections: [measurement]
---
# stats metric definitions and snapshots

## Context and Problem Statement

`docs/design/metrics.md` names the metrics, and transcripts are deleted after 30 days (implementation notes §4). This record defines how `stats` computes each metric and what it keeps.

## Decision Outcome

* **Sources.** Main-session transcripts: the `*.jsonl` files directly in the project's folder under `$CLAUDE_CONFIG_DIR/projects` (default `~/.claude/projects`). On Windows the folder name is matched case-insensitively, because its drive-letter case can differ from the cwd. Subagent transcripts are excluded. `--session <path>` reads one file.
* **Tokens at session start.** `firstTurnContextTokens`: real usage, de-duplicated.
* **Doc tokens (estimate).** The characters of `Read` results for files under `<root>/.context/`, plus the characters of SessionStart contexts that start with `# baton mission brief`, divided by 4 (`CHARS_PER_TOKEN`). Tool results carry no usage numbers, hence the estimate.
  * Per task = total doc tokens divided by tasks closed.
  * A task counts as closed when a Bash call that did not fail ran `task close <ids>`.
* **Corrections.** User prompts whose text starts with a correction phrase (`no`, `don't`, `wrong`, `we decided`, `actually`, …; the regex is in `src/core/stats.ts`). Excluded: the first prompt, tool results, meta records, compact summaries and tag-only text. A keyword heuristic, and reported as one.
* **Time to first edit.** Seconds from the first timestamped record to the first Edit, Write, MultiEdit or NotebookEdit call. This stands in for "time to resume". `stats` does not check whether the session continued an earlier task, and its label says "time to first edit".
* **Hook errors.** Hook attachments whose stderr contains `baton hook ` (fail-open errors exit 0), and non-blocking errors whose command mentions baton.
* **Snapshots.** Every parsed transcript writes `.context/.cache/stats/<session-id>.json`: a `SessionMetrics` record, `v: 1`, holding derived numbers only, never transcript text.
  * Sessions whose transcript has been deleted are read back from these snapshots.
  * Snapshots are written only when the project has `.context/`, so `stats` also works for a Phase 0 baseline in a project without baton.

### Consequences

* Good, because the numbers survive the 30-day cleanup without copying transcripts, which can contain secrets.
* Bad, because doc tokens and corrections are estimates, and the metrics doc says so.
