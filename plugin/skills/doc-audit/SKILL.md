---
name: doc-audit
description: Run baton's freshness check over .context/, explain each aging, stale or unverified section, and propose concrete fixes for the user to approve. Use when the user asks whether the docs or memory are up to date, before a release, or when the session-start brief lists sections that need re-verify.
license: MIT
---
# Doc audit

## Steps

1. Run `baton drift --format json`.
2. For each stale or aging section, read the section and the commits that touched its `source_paths` since `verified_at` (`git log --oneline <sha>..HEAD -- <paths>`). Decide: still true, partly wrong, or wrong.
3. Propose fixes as a list, one per section: re-verify unchanged (`baton verify-doc <id>`), edit the text (show the diff), or supersede it with `baton decide "<title>" --supersedes <NNNN>` (decide skill). Dead references: point at the new path or remove the claim.
4. Apply only what the user approves, then run `baton drift` again and report the before/after counts.

## Rules

- A section is not fixed by bumping `verified_at` alone; read the changed code first.
- Unverified sections (`verified_at: null`) need a human or agent read, then `verify-doc`.
