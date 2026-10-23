---
id: adr-0012
kind: decision
status: accepted
date: 2026-10-20
decision-makers: [maintainer]
verified_at: null
source_paths: [src/core/sections.ts, src/core/verify-doc.ts, src/commands/drift.ts]
spec_sections: [context-format, freshness]
---
# Section index over .context/ and verify-doc stamps

## Context and Problem Statement

`drift`, `verify-doc`, `mission` and `explain` all need every section with its provenance. Ids must be unique across files (roadmap Phase 1), because tasks (`spec:<id>`) and `verify-doc` address sections by id. `parseSections` only rejects duplicates within one file.

## Decision Outcome

* **Scope and order.** `loadSectionIndex(root)` in `src/core/sections.ts` reads exactly these files, in this order: `.context/rules.md` and `.context/spec.md` (inline markers, ADR 0003), then `.context/STATE.md`, `.context/knowledge/*.md` and `.context/decisions/NNNN-*.md` (frontmatter). Nothing else under `.context/` is a section: not config, the task store, explain templates or the cache.
* **Skipped silently.** Whole-file docs without an `id` (such as `knowledge/README.md`), and `decisions/0000-template.md` (number 0000 is the template).
* **Normalisation.** Before parsing, a leading UTF-8 BOM is stripped and CRLF is normalised to LF. `file` is the repo-relative POSIX path.
* **Nested sections.** A marked heading inside another marked section is a section of its own.
  * The outer section stays open until the next heading of the same or higher level.
  * Each line belongs to the innermost open marked section, so the outer body never contains a nested section's text. A withheld child therefore cannot leak through a fresh parent.
  * This fixes `parseSections`, which used to drop the outer section.
* **One-line problems.** A problem message is one line that names its file.
* **Unique ids.** Ids are unique across all files.
  * Strict mode (`drift`, `verify-doc`) fails with exit 1 and lists every problem.
  * Lenient mode (`mission`, `explain`) skips a broken file or a later duplicate, and records it as a problem.
* **Decision fields.** For decisions the index also keeps the MADR `status`, `spec_sections` and `supersedes`. A status of `superseded by ADR-NNNN` sets `supersededBy: adr-NNNN`, because MADR has no supersedes field (ADR 0001).
* **The stamp.** `verify-doc <ids...>` writes `verified_at: "<first 12 hex chars of HEAD>"`. It is double-quoted, because an all-digit or `1e5…`-shaped SHA would otherwise parse as a YAML number.
  * It rewrites only the `verified_at` token of the marker line or the frontmatter, and keeps the file's line endings and BOM.
  * It is all-or-nothing: an unknown id means nothing is written.
* **ADR stamps.** Stamping an ADR's frontmatter is a metadata write through the CLI, allowed by ADR 0001's extension keys. The record's text never changes.

### Consequences

* Good, because every consumer shares one parser and one id namespace.
* Bad, because a 12-character prefix could in theory become ambiguous in a very large repo, and widening it later is a format change that needs a new ADR.
