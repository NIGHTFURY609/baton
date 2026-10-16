---
name: decide
description: Check a proposed load-bearing choice against accepted decisions and the spec, then record it as a MADR decision or supersede an old one. Use before adding or swapping a dependency, changing a storage format, schema, API contract or hook behaviour, or when the user says "let's decide" or asks why something was chosen.
license: MIT
---
# Decide

## Steps

1. Preflight: `baton decide "<short title>" --preflight`. Read every conflicting decision and spec section it lists.
2. If the choice contradicts an accepted decision, stop and tell the user which record and why. Proceed only if they want to supersede it.
3. Write the record: `baton decide "<title>" --status proposed --spec <section-ids>` (add `--supersedes <NNNN>` when replacing one). Fill the generated MADR file's Context, Considered Options and Decision Outcome with what the user said; keep it under a page.
4. When the user confirms, set the status to accepted with `baton decide` (never by editing an accepted record).

## Rules

- Decisions are append-only. To change one, supersede it with a new record.
- Load-bearing: dependencies, storage and file formats, public interfaces, security model, anything the spec marks load-bearing.
