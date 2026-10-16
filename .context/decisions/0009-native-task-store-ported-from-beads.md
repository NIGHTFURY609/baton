---
id: adr-0009
kind: decision
status: accepted
date: 2026-10-16
decision-makers: [maintainer]
verified_at: null
source_paths: [src/core/tasks/**, src/commands/task.ts]
supersedes: "0007"
spec_sections: [tasks, scope]
---
# Native task store ported from Beads: JSONL in git, SQLite cache

## Context and Problem Statement

ADR 0007 made Beads an external backend. In practice that means every baton user must install a separate Go binary plus Dolt before the brief can show ready tasks or `baton verify` can close one. The maintainer chose Beads for its structured, dependency-aware store, not for Dolt, and wants that model inside baton. Beads is MIT-licensed, so its logic can be ported with attribution.

## Decision Drivers

* No second tool to install; works wherever Node ≥ 22.13 runs, including Windows.
* Keep the Beads model: hash ids, dependencies, ready/blocked, atomic claim, close rules.
* State stays in git, diffable and mergeable (principle 1: files in git are the truth).
* Concurrent sessions must not lose writes or double-claim.

## Considered Options

* Keep Beads as an external dependency (ADR 0007)
* Port the needed subset of Beads to TypeScript, storing JSONL in git with a SQLite cache
* Port to TypeScript with SQLite as the only store (binary file in git)
* Port to TypeScript with JSONL only (no database)

## Decision Outcome

Chosen option: "port to TypeScript, JSONL in git + SQLite cache".

* `.context/tasks.jsonl` and `.context/memories.jsonl` are committed and are the **only source of truth**. Records follow `bd export` (snake_case, `_type`, dependencies/labels/comments embedded), sorted, empty fields omitted.
* `.context/.cache/tasks.db` (git-ignored, Node's built-in `node:sqlite`) is an index rebuilt automatically whenever the JSONL content hash changes (pull, merge, checkout, hand edit).
* Every write runs under `BEGIN IMMEDIATE`: re-sync if needed, mutate, export JSONL atomically (temp file + rename), record the hash, commit. This serialises writers across processes; there is no two-way sync, which is what made Beads abandon its own SQLite+JSONL design.
* `.gitattributes` sets `merge=union` on both files; duplicate ids after a merge collapse to the record with the later `updated_at`.
* Ported from Beads: data model subset, hash ids (byte-identical to Beads' test vectors), adaptive id length, child ids, `blocks`/`parent-child`/`related`/`discovered-from` links, cycle and lineage checks, the ready rule (pre-`is_blocked` view plus defer filter), sort policies, claim semantics, close rules, memory key derivation, and import from `bd export`.
* Not ported: Dolt, leases, wisps, molecules, gates, pinned/hooked/custom statuses, federation, the persisted `is_blocked` flag.
* Beads remains available as an optional backend (`tasks.backend: beads`).

### Consequences

* Good, because the task model works out of the box and stays in git.
* Good, because the ported logic is tested against Beads' own golden vectors (ids, memory keys).
* Bad, because baton now owns a task store it must maintain; scope is capped at the list above.
* Bad, because `node:sqlite` is still experimental in Node 22 (warning suppressed); revisit if its API changes.
* Neutral: attribution lives in THIRD_PARTY_NOTICES.md and in the header of each ported file.

### Confirmation

`test/tasks-native.test.ts` (Beads parity vectors, ready/blocked, cycles, claim, close, union-merge, import) plus the multi-process race check in `docs/research/2026-10-16-implementation-notes.md` §7.
