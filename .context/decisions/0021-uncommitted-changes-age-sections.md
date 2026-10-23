---
id: adr-0021
kind: decision
status: accepted
date: 2026-10-21
decision-makers: [maintainer]
verified_at: null
source_paths: [src/core/drift.ts, src/hooks/post-tool-use.ts]
spec_sections: [freshness, hooks]
---
# Uncommitted source changes age sections; PostToolUse notices touched sections

## Context and Problem Statement

The roadmap says "PostToolUse marks touched sections aging". ADR 0013 counts commits only, so a source that is edited but not committed leaves its section fresh mid-session, including in the packet re-injected after compaction. A mark written by a hook would need git anyway to expire (on a revert or a commit), and would miss edits made outside the agent.

## Decision Outcome

* **The level.** `evaluateFreshness` also runs `git status`, in one process, concurrently with its other git calls. A section becomes `aging` when all of these hold:
  * it would otherwise be `fresh`;
  * its `verified_at` is a known commit;
  * it has an uncommitted change (staged, unstaged or untracked) outside `.context/` that matches its `source_paths`.

  The reason reads `uncommitted changes in <up to 3 paths> (+<n> more)`. Other levels are unchanged. This extends ADR 0013 without superseding it. `drift`, `mission` and `explain` all see it, and there is no stored mark to expire.
  * `drift.jsonl` (ADR 0013) logs no flag for a section that is aging only because of uncommitted changes. Otherwise every `drift` run during work in progress would flood it.
  * The `verify-doc` note for uncommitted sources says they keep the section aging until committed and re-verified.
* **The hook.** PostToolUse (`Edit|Write|MultiEdit`) tells the model, as `additionalContext`, which verified, non-superseded sections list the edited file in their `source_paths`. Those sections count as aging until re-verified: commit, then `baton verify-doc <id>` after review. It is sent once per session and section.
* **The mark.** `.context/.cache/touched.jsonl` is git-ignored, local to the machine and append-only. It holds `{v: 1, ts, session, paths, ids}` per notice. It is only the per-session dedupe for the notice, and never decides a level. The hook reads at most its last 256 KiB.
* **Budget.** < 150 ms, with no git process in the hook.

### Consequences

* Good, because freshness is right mid-session, with no state to expire, and the agent learns about a doc that describes the file it just edited.
* Bad, because any uncommitted change ages sections, including the user's own work in progress.
* Bad, because the notice costs tokens once per section per session.
