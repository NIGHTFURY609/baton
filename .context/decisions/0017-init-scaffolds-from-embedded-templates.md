---
id: adr-0017
kind: decision
status: accepted
date: 2026-10-20
decision-makers: [maintainer]
verified_at: null
source_paths: [src/core/init.ts, src/core/templates.generated.ts, scripts/embed-templates.mjs, templates/**, src/commands/init.ts]
spec_sections: [context-format]
---
# init scaffolds from templates embedded in the bundle

## Context and Problem Statement

`init` must work from `dist/baton.mjs`, from `plugin/dist/baton.mjs` (a marketplace install copies only `plugin/`), and from tests. A runtime lookup of `templates/` breaks in the plugin copy.

## Considered Options

* A runtime lookup of `templates/`.
* Copying `templates/` into `plugin/` at build time.
* Embedding the templates in the bundle at build time.

## Decision Outcome

Chosen option: embedding at build time.

* **Embedding.** `scripts/embed-templates.mjs` writes `src/core/templates.generated.ts`: one string per file under `templates/`, with CRLF normalised to LF.
  * `npm run build` runs it first.
  * The generated file is committed and excluded from Biome.
  * A test fails when it differs from `templates/`.
* **Files written.**
  * `.context/` files.
  * `AGENTS.md`: the template, with the `rules.md` sections rendered in place of `{rules from .context/rules.md}`, until `compile` exists.
  * `CLAUDE.md`: `@AGENTS.md`.
  * An existing file is left alone unless `--force`.
* **Additive files.** `.gitattributes` (`merge=union` for both JSONL files) and `.gitignore` (`.context/.cache/`) only ever gain lines. Missing lines are appended; nothing is removed or rewritten, with or without `--force`.
* **Hooks.** Claude Code hooks ship in the plugin, so `init --harness claude` writes no hook config; it prints how to load the plugin. `codex` and `gemini` exit 3 until Phase 3.

### Consequences

* Good, because there is one self-contained bundle.
* Bad, because after editing a template, run `npm run embed:templates` (or a build) before the tests pass.
