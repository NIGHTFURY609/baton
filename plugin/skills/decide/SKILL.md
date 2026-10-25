---
name: decide
description: Check a proposed load-bearing choice against accepted decisions and the spec, then record it as a MADR decision or supersede an old one. Use before adding or swapping a dependency, changing a storage format, schema, API contract or hook behaviour, or when the user says "let's decide" or asks why something was chosen.
license: MIT
---
# Decide

## Steps

1. Preflight: `baton decide "<short title>" --preflight --spec <section-ids> --paths <paths it touches>`. Exit 2 lists the accepted decisions and load-bearing spec sections that constrain the change (`CONSTRAINS`). Read each one, and the `RELATED` ones.
2. If the choice contradicts an accepted decision, stop and tell the user which record and why. Proceed only if they want to supersede it.
3. Write the record: `baton decide "<title>" --spec <section-ids> --paths <paths> [--supersedes <NNNN>]`. It creates a proposed record with `{…}` placeholders. Replace each placeholder in the body (Context, Considered Options, Decision Outcome, Consequences) with what the user said, using the edit tools; keep it under a page. Never touch the frontmatter or its status line.
4. When the user confirms, run `baton decide --accept <NNNN>`. It refuses while placeholders remain, stamps the record and marks the record it supersedes.
5. A choice the user has already confirmed can be recorded in one step: `baton decide "<title>" --status accepted --spec <ids> --context "<why now>" --outcome "<the choice and why>"`, adding `--considered "<option>"` per option and `--consequence "Good, because …"`.
6. If decide prints a note about a load-bearing spec section, update that section's text to agree, and run `baton verify-doc <id>` once the user confirms.

## Rules

- Decisions are append-only. To change one, supersede it with a new record. The PreToolUse hook denies hand edits to any record that is not proposed, to any record's frontmatter, and hand-made record files.
- Load-bearing: dependencies, storage and file formats, public interfaces, security model, anything the spec marks load-bearing.
- `baton decide` with no arguments lists every record with its status.
