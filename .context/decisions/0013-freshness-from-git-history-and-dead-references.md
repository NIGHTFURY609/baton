---
id: adr-0013
kind: decision
status: accepted
date: 2026-10-20
decision-makers: [maintainer]
verified_at: null
source_paths: [src/core/drift.ts, src/core/git.ts, src/commands/drift.ts]
spec_sections: [freshness]
---
# Freshness from git history and dead references

## Context and Problem Statement

`classifyFreshness` (`src/core/freshness.ts`) is pure, and needs commit counts and dead references as input. One `git rev-list` per section is too slow for a session start under 1 s on Windows, where each git process costs about 50 ms (implementation notes §1). Naive counting also ages sections on every task-store commit.

## Decision Outcome

* **Counting.** Run one `git log --no-merges --no-renames --name-only` per distinct `verified_at` SHA. A section's count is the number of commits in `<sha>..HEAD` that change at least one file matching its `source_paths`, using baton's glob matcher. Merge commits are not counted.
* **`.context/` is excluded.** Changes to files under `.context/` never count. Otherwise task-store writes, handoffs and the stamping commit itself would age `rules-continuity`-style sections on every commit. Edits to a section's own text are reviewed through `verify-doc` instead.
* **Unknown SHAs.** A `verified_at` that is not a known commit (rebased away, or outside a shallow clone) is a dead reference, so the section is stale. CI that wants `drift --fail-on` needs a full clone.
* **What counts as a dead reference.** Skipped when the project is not a git repo.
  * A `source_paths` glob that matches no existing file in `git ls-files --cached --others --exclude-standard`. Files deleted from the work tree do not count as existing.
  * A repo path in the section body: an inline-code span, or a relative markdown link, outside fenced code blocks. It is dead when its first path segment exists at the repo root but the full path neither exists on disk nor is git-ignored.
  * Body references in the generated `STATE.md` are not checked. STATE is regenerated, never edited, so a backticked path in it must not make it stale and drop the state head from the packet.
* **Failing.** `drift --fail-on aging` exits 2 when any section is aging, stale or unverified. `--fail-on stale` exits 2 when any section is stale or unverified. Superseded never fails.
* **The drift log** (`.context/.cache/drift.jsonl`, local and never committed).
  * Each `drift` run appends one line per aging or stale section: `{"v":1,"ts":…,"event":"flag","head":…,"id":…,"level":…,"commitsSince":…,"reason":…,"bodyHash":…}`.
  * `verify-doc` appends `{"v":1,"ts":…,"event":"verified","head":…,"id":…,"bodyHash":…}`.
  * `bodyHash` is the first 12 hex chars of the sha256 of the section body.
  * A flag followed later by a `verified` event with a different `bodyHash` means a human fixed the text, which confirms the flag. Phase 2 `stats` can compute precision from that.

### Consequences

* Good, because freshness costs one git process per distinct SHA rather than per section, and stamping never ages anything.
* Bad, because a section whose `source_paths` point into `.context/` never ages by commits, and dead-reference detection is a heuristic that misses plain-text paths.
