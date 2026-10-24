---
id: adr-0001
kind: decision
status: accepted
date: 2026-10-16
decision-makers: [maintainer]
verified_at: "428730e2882f"
source_paths: []
spec_sections: [decisions]
---
# Record decisions as MADR 4.0 in .context/decisions/

## Context and Problem Statement

baton needs a decision log agents can read, preflight against and supersede, and that existing ADR tools (adr-kit, AdrMcp) can also read. Inventing a format would cut it off from that tooling.

## Considered Options

* MADR 4.0 files with a small extension
* A baton-specific YAML/JSON decision store
* Nygard-style ADRs without frontmatter

## Decision Outcome

Chosen option: "MADR 4.0 files with a small extension", because it is the format the ADR tools already parse, and frontmatter gives the structured fields preflight needs.

MADR has no `supersedes` field (supersession lives only in the status string, e.g. `superseded by ADR-0009`). baton adds optional keys as its own extension: `id`, `kind: decision`, `verified_at`, `source_paths`, `supersedes`, `spec_sections`. Files are `NNNN-title-with-dashes.md`; records are append-only.

### Consequences

* Good, because adr-kit-style tools can read baton's decisions unchanged.
* Bad, because tools that validate strict MADR frontmatter may warn on the extension keys.
