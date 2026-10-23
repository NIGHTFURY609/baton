---
name: init-spec
description: Interview the user and write .context/spec.md with section ids, kinds and source_paths, then record load-bearing choices as decisions. Use when a project has no .context/spec.md yet, or when the user asks to set up or rewrite the project spec for baton.
license: MIT
---
# Initialise the project spec

Goal: a short spec.md whose every section can be checked for freshness. Intent and boundaries only, no implementation plan (plans belong to upstream tools such as superpowers or Spec Kit).

## Steps

1. If `.context/` is missing, run `baton init` first.
2. Read the repository layout (top-level folders, package manifests, existing README) so `source_paths` point at real paths.
3. Ask the user, one question at a time, until you can fill these sections: Purpose, Scope and non-goals, then one section per major capability or boundary. Stop at about 10 sections.
4. Write each section in `.context/spec.md` with a marker directly under its heading:

   ```markdown
   ## Authentication
   <!-- baton: {id: auth, kind: intent, verified_at: null, source_paths: ["src/auth/**"]} -->
   ```

   - `id`: short kebab-case, unique across `.context/`.
   - `source_paths`: the globs whose changes could make the section wrong. Empty only for sections no code can contradict (purpose, non-goals).
5. For every load-bearing choice the user states (storage, framework, auth model, hosting), run `baton decide "<title>" --status accepted --spec <section-ids>`. Until Phase 2, `baton decide` exits 3 (not built yet). In that case, record each choice as a task instead, `baton task create "Decide: <title>" -t decision --spec <section-ids>`, so nothing is lost and no decision file is written by hand.
6. Show the user the spec, then run `baton verify-doc <ids...>` for the sections they confirm. verify-doc stamps the current commit. If it reports `no commits yet`, ask the user to make a first commit.
7. Run `baton drift` and report the result.

## Rules

- Keep each section under ~15 lines. The mission packet budget is 9,000 characters for everything.
- Do not invent requirements; mark unknowns as open questions in the section text.
- Never edit `.context/decisions/` or `.context/STATE.md` directly.
