---
id: adr-0018
kind: decision
status: accepted
date: 2026-10-21
decision-makers: [maintainer]
verified_at: "3bbe17408dd2"
source_paths: [src/core/decisions.ts, src/core/decide.ts, src/core/preflight.ts, src/commands/decide.ts]
spec_sections: [decisions]
---
# decide: MADR lifecycle, supersede by status, and preflight

## Context and Problem Statement

ADR 0001 fixes MADR 4.0, append-only records, and supersession recorded in the status string. The spec's `decisions` section asks for `decide --preflight`, and the roadmap asks for supersede chains and spec-conflict flags. Agents must be able to record decisions without hand-editing `.context/decisions/`, while accepted records stay immutable.

## Decision Outcome

* **Lifecycle.** `proposed` → `accepted` → `superseded by ADR-NNNN`.
  * `baton decide "<title>"` creates a record with the next free number. Its status is `proposed` by default, or `accepted` with `--status accepted`.
  * A proposed record's **body** may be edited by hand; its frontmatter may not.
  * `baton decide --accept <NNNN>` moves a proposed record to accepted.
  * Accepted, superseded, rejected and deprecated records are never edited by hand.
* **What "append-only" permits.** This applies ADR 0001 and ADR 0012.
  * ADR 0001: MADR has no supersedes field, and supersession lives only in the status string (`superseded by ADR-NNNN`).
  * ADR 0012: stamping an ADR's frontmatter is a metadata write through the CLI, and the record's text never changes.
  * AGENTS.md forbids *direct* edits to `.context/decisions/`; the CLI is the write path.

  So the CLI, and only the CLI, makes exactly two kinds of change to an existing record, both frontmatter-only:
  * its `status` line: `accepted` on accept, or `"superseded by ADR-NNNN"` on supersession;
  * its `verified_at` stamp.

  The body bytes never change, and every other byte of the file is preserved, including the BOM and line endings.
* **Supersede chains.**
  * The new record carries `supersedes: "NNNN"`, ADR 0001's extension key.
  * When the new record becomes accepted (created with `--status accepted`, or later with `--accept`), the old record's status becomes `"superseded by ADR-<new>"`. A proposed successor leaves the old record untouched.
  * The section index also derives the chain: an accepted record's `supersedes` marks its target superseded even if the target's status was never rewritten.
  * A record that is already superseded, or rejected, cannot be superseded (exit 2).
* **Record format.** The MADR minimal subset, rendered by `src/core/decisions.ts`.
  * Frontmatter: `id`, `kind`, `status`, `date`, `decision-makers` (default: the actor), `verified_at`, `source_paths` (`--paths`), `supersedes`, `spec_sections` (`--spec`).
  * `verified_at` is HEAD's 12-character stamp when the record is created as, or becomes, accepted; otherwise `null`.
  * Sections: Context and Problem Statement, Considered Options, Decision Outcome (with Consequences), More Information.
  * The missing parts of a proposed record are `{…}` placeholders. A record that still has placeholders cannot be accepted. `--status accepted` at creation needs `--context` and `--outcome`.
* **Numbering.** The next free number is written with exclusive create. If a concurrent writer took the same number, the second writer removes its file and exits 1.
* **Preflight.** `decide [title] --preflight [--paths] [--spec] [--supersedes]` writes nothing. It relates the proposal to every non-STATE section and every current ADR, in three ways: by path (an overlap with `source_paths`, glob tested in either direction), by spec id, or by a shared title keyword.
  * A relation **constrains** the proposal when an accepted ADR, or a load-bearing spec section, is related by path or spec id, and is not the record named in `--supersedes`. A section is load-bearing when its body carries the marker `(load-bearing)`, as the spec's `scope` section does. A passing mention of the word does not count.
  * Exit 2 when anything constrains, else 0. baton cannot judge whether two decisions contradict each other, so exit 2 means "read these before deciding".
  * Keyword-only matches are listed as "possibly related" (at most 5) and never fail.
  * Unknown `--spec` ids are listed.
* **Spec-conflict flags.** On creation, `decide` runs the same preflight and records its result under "More Information" in the new record. It prints the report, plus a note for each linked load-bearing spec section saying that the section's text must agree.
  * Creation never fails on a conflict: the record *is* the decision.
  * Unknown `--spec` ids refuse creation (exit 1).
* **Listing.** `baton decide` with no arguments at all lists every record with its status and its `supersedes`. Any creation option without a title (such as `--spec`, `--supersedes` or `--paths`) exits 1.
* The optional code-graph MCP stays out of scope.

### Consequences

* Good, because agents never hand-edit `.context/decisions/`, and chains stay readable by MADR tools such as adr-kit.
* Bad, because preflight is lexical (paths, ids, words), so it over- and under-reports.
* Bad, because the status write to the old record is a narrow exception to "never edited" that only the CLI makes.
