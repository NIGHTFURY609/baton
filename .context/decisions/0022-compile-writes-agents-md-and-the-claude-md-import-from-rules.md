---
id: adr-0022
kind: decision
status: accepted
date: 2026-10-24
decision-makers: [maintainer]
verified_at: "1dd306b592ed"
source_paths: ["src/core/compile.ts", "src/commands/compile.ts", ".github/workflows/ci.yml"]
spec_sections: [context-format]
---
# compile writes AGENTS.md and the CLAUDE.md import from rules.md

## Context and Problem Statement

ADR 0006 makes AGENTS.md a small router (≤ 60 lines) generated from `.context/rules.md` once `compile` exists, with CLAUDE.md as a one-line `@AGENTS.md` import. ADR 0017 has `init` render AGENTS.md from the embedded router template. The spec lists rules-file sync engines as a non-goal.

## Considered Options

* Render with the embedded router template, as init does
* Copy rules.md verbatim without markers
* Generate several harness rule files (Cursor, Copilot, GEMINI.md)

## Decision Outcome

Chosen option: "Render with the embedded router template, as init does", because init and compile then produce the same bytes, a freshly initialised project passes compile --check, and each AGENTS.md section keeps its freshness provenance in rules.md.

* AGENTS.md is `renderAgentsMd` of the embedded template and the marked sections of `.context/rules.md`, in order. Text before the first section, and `##` headings without a marker, are not compiled; compile names each such heading in a warning.
* More than 60 lines is refused with exit 2 (ADR 0006).
* CLAUDE.md: compile ensures it contains the line `@AGENTS.md`, creating the file or appending the line, and keeps any other content.
* No other targets: Codex reads AGENTS.md natively and Gemini through `context.fileName` (Phase 3 `init`); multi-target sync stays a non-goal.
* `compile --check` writes nothing and exits 2, naming each out-of-date file and its first differing line. The comparison ignores a BOM and CRLF. CI runs it after the build.

### Consequences

* Good, because there is one source of rules, checked in CI.
* Bad, because a project cannot change the router template itself, only the rules.md sections.

## More Information

Preflight at creation (baton decide): 4 constraining, 1 related, 2 possibly related.

* constrains: ADR 0003 (accepted) "Section provenance in inline HTML-comment markers" (spec: context-format)
* constrains: ADR 0006 (accepted) "AGENTS.md is a small router; CLAUDE.md is a one-line import" (spec: context-format; keyword: agents, claude, import)
* constrains: ADR 0012 (accepted) "Section index over .context/ and verify-doc stamps" (spec: context-format)
* constrains: ADR 0017 (accepted) "init scaffolds from templates embedded in the bundle" (spec: context-format)
* related: spec context-format "Context format" (spec: context-format)
* possibly related: rule rules-project "Project rules" (keyword: rules)
* possibly related: rule rules-continuity "Continuity rules" (keyword: rules)
