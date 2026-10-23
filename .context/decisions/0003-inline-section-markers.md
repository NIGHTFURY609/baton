---
id: adr-0003
kind: decision
status: accepted
date: 2026-10-16
decision-makers: [maintainer]
verified_at: "428730e2882f"
source_paths: [src/core/frontmatter.ts]
spec_sections: [context-format]
---
# Section provenance in inline HTML-comment markers

## Context and Problem Statement

Freshness is tracked per section, not per file, but spec.md and rules.md hold many sections. Markdown has no standard for several frontmatter blocks in one file.

## Considered Options

* One HTML comment with a YAML flow mapping under each heading
* One file per section (spec/auth.md, spec/billing.md …)
* A sidecar index file mapping heading anchors to provenance

## Decision Outcome

Chosen option: "inline HTML comment", e.g. `<!-- baton: {id: auth, kind: intent, verified_at: 3f2a1c9, source_paths: ["src/auth/**"]} -->` directly under the heading. Whole-file docs (STATE, knowledge, ADRs) keep ordinary frontmatter.

### Consequences

* Good, because provenance sits next to the text it describes, renders invisibly, and a re-verify is a one-line diff.
* Good, because humans can still read and edit spec.md as one document.
* Bad, because headings can be renamed without the marker moving; ids, not heading text, are the stable handle.
* Neutral: a sidecar index was rejected because it drifts from the document, which is the problem baton exists to solve.
