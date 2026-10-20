# `baton explain` and the `/baton` skill: design

Date: 2026-10-20 · Status: draft, awaiting approval

## Why

The user hit this at a hackathon: minutes before presenting, they needed to understand one feature well enough to talk about it, and writing a good prompt for an AI took time they did not have. They want one short command that returns a usable explanation of one thing in the project, in a voice they pick (caveman, baby, student, or their own).

baton is well placed for this because `.context/` and `docs/` already hold *why* things exist (spec, ADRs, knowledge), not just what the code does. An explanation built from those beats pasting files into a chat.

Two pieces of work came out of the conversation, built in this order:

1. **The `/baton` skill:** one agent-side entry point that mirrors the CLI, so `/baton <anything>` in Claude Code means the same as `baton <anything>` in a terminal.
2. **`baton explain`:** a new command plus voice templates. Through piece 1 it is reachable as `/baton explain …`.

## Scope and scheduling (decided with the user)

- **Spec change:** `.context/spec.md` line 17 lists "output-style compression (caveman-style)" as a load-bearing non-goal. The user agreed to narrow that line to *always-on* output compression, and to add `explain` and the `/baton` skill to the in-scope list and the Skills section. This needs a new ADR that records the scope change. Write it before the spec edit and before any code.
- **Scheduling:** build it as its own epic in the task store, outside the phase gates. It does not wait for the Phase 0 baseline or Phase 1.
- **Docs:** add the feature to the project docs:
  - `docs/roadmap.md`: a short "Side track: explain" entry outside the phase list, pointing at the epic.
  - `docs/design/architecture.md`: an `explain` row in the command contract, and `/baton` in the skills description.
  - `.context/spec.md`: as above.
  - `docs/design/context-format.md`: `.context/explain/` added to the layout.

## Goals

- `/baton explain supabase --as caveman` in the agent returns a short explanation of `supabase` in caveman voice, in seconds.
- Built-in templates plus user-made ones, created with one command.
- Whatever the user adds in their own message ("keep it technical", "super brief") overrides the template.
- Agent commands match terminal commands: `/baton task ready`, `/baton handoff`, etc.

## Non-goals

- baton does not call an AI model. The CLI gathers facts and template instructions; the agent writes the explanation. (No API key, no new model dependency.)
- No whole-repo "explain everything" report. One target per call.
- Converting `docs/research/media/architecture.png` to Mermaid. Separate task.
- Codex/Gemini parity for the `/baton` skill. Lands with the other Phase 3 harness work.
- Saving explanations to files. Output is read or spoken, then gone.

## Anti-goals (would be a failure even if it works)

- **Invented reasons.** If there is no ADR or doc for why something exists, the explanation says so plainly ("no recorded reason why this was chosen"). It never makes up a purpose. This matters most right before a presentation.
- **Silent guessing.** When the target is not found exactly, baton never swaps in something else without saying so.
- **Breaking existing commands.** `baton task`, `baton init`, etc. behave exactly as before.

## Piece 1: the `/baton` skill

- One plugin skill at `plugin/skills/baton/SKILL.md` with frontmatter `name: baton`. Per the [Claude Code skills docs](https://code.claude.com/docs/en/skills), a plugin skill that sets `name` is invocable both as `/baton:baton` and as the bare `/baton` "unless another command already uses that name". Arguments arrive via `$ARGUMENTS`.
- The skill runs `baton $ARGUMENTS` and acts on the output.
- **How the skill reaches the CLI (decided with the user):** users install globally (`npm install -g baton-ctx`), and every skill calls bare `baton`, as `/checkpoint` and `/decide` already do. This answers roadmap open question 5 (the alternatives were `npx baton-ctx` and a plugin `bin/` shim). Record it in an ADR, and mark open question 5 as resolved in `docs/roadmap.md`. The MCP config can then also start `baton mcp`. Global install only works for outside users once the npm publish lands in Phase 3. Until then, dogfooding uses `npm link`, which puts the local build on PATH as `baton`.
- **Decided:** when a subcommand already has a dedicated skill with extra steps (`handoff`, `decide`, `checkpoint`, `doc-audit`, `init-spec`), `/baton <that>` follows that skill's steps rather than running the bare command. The skill holds a short routing table for this.
- For `explain`, the skill tells the agent to write the explanation from the CLI's output, following the template and the length rule below, with the user's own words taking priority.
- Add the namespacing fact to `docs/research/2026-10-16-implementation-notes.md` with the docs URL as source (project rule for new harness facts).

## Piece 2: `baton explain`

### Command surface (decided with the user)

```
baton explain <thing> [--as <template>]          explain one thing
baton explain -c <name> -p <prompt> [-s <scope>] create a template
baton explain --delete <name> [-s <scope>]       delete a template
baton explain --templates                        list templates
```

- `explain` is an explicit subcommand. The user first wanted `baton <thing>` but dropped it because names would clash with existing commands.
- `-c`/`--create`, `-p`/`--prompt`, `-s`/`--scope`. Long and short forms both work.
- `--scope` is `both` (default), `project` or `personal`. It applies to create and delete.
  - **Create with `both` (decided with the user):** writes two files, one in each location.
  - **Create refusal (my call):** `-c` without `--force` refuses (exit 2) if the name exists in *any* targeted location.
  - **Delete with `both` (my call):** removes the name from every location where it exists. Built-ins can't be deleted (exit 2).
  - **No `.context/` folder (my call):** `-s project` (and `both`) creates `.context/explain/` if it is missing.
- Template names are slugged: `"hackathon judge"` is stored as `hackathon-judge`, and `--as "hackathon judge"` and `--as hackathon-judge` both resolve.
- `-c` on an existing name refuses unless `--force` is passed, so nobody overwrites a teammate's template by accident.
- `--templates` lists every template with its source (project / personal / built-in) and first line.
- Without `--as`, the template is `student`.

### Templates

- **Built-ins (ship with baton):** `caveman`, `baby`, `student`, `engineer` (technical, precise), `pitch` (30 seconds, for presentations).
- **Project templates:** `.context/explain/<slug>.md`, committed, so teammates get them through git.
- **Personal templates:** `~/.baton/explain/<slug>.md` (`%USERPROFILE%\.baton\explain\` on Windows), so they follow the user everywhere.
- **Precedence on a name clash:** project, then personal, then built-in. The team's version stays consistent even if a personal copy drifts.
- **Default length:** short, under about 150 words, because speed is the point. The user's message can ask for more.

### Finding the thing (target resolution)

The target can be any of the following. For each kind, baton collects this:

| Kind | Facts collected |
|---|---|
| Dependency (in `package.json`) | Its `package.json` entry, ADRs that mention it, files that import it |
| `.context/` section (by id or heading) | Section text, linked decisions (`spec_sections`, `spec:` labels), files under its `source_paths` |
| Doc heading in `docs/` | The heading's text block, decisions that mention it |
| File or directory | Its line in the architecture source-layout block, decisions and sections that reference it |
| Mermaid node label in any doc | The node, its edges (in and out), and the doc section around it |

- **Works in any repo (my call):** the motivating case is a hackathon project, which may have no `.context/` (and `baton init` is still a stub). Without `.context/`, resolution uses `package.json`, `docs/`, files and Mermaid only. "No recorded reason" is then the normal result, and the feature still answers.
- **Exact match in several kinds (my call):** one name is often a spec id, a doc heading and a directory at once (`handoff`, `hooks`, `tasks`). That is one concept, not a tie: merge the facts from every exact match into one result, grouped by kind.
- **Closest match (decided with the user):** if nothing matches exactly, baton picks the closest match and says so first, e.g. "No `supabse` found, explaining `supabase` (closest match)."
- **Tie (my call):** only fuzzy matches can tie. If two different candidates are equally close, it lists them and exits 2 without explaining. The skill then asks the user which one they meant.
- **`no recorded reason` marker (my call):** set when no ADR and no `.context/` section (spec, knowledge, rules) names or links the target. `docs/` prose, `package.json` and code are still shown as facts, but they don't clear the marker, because they say *what* rather than *why*. The skill must surface the marker in the explanation.
- **Freshness (my call):** facts are included with a label, never withheld. Withholding would leave `explain` with nothing on this repo, where every section is `verified_at: null`. This differs from `mission` on purpose: `mission` is an always-loaded brief, while `explain` is asked for on demand. Facts from `.context/` carry their `classifyFreshness` level. Facts from sources without provenance (`docs/`, `package.json`, files, Mermaid) are labelled `no provenance`. The freshness model is not extended to them.

### Output

Plain text by default, `--format json` for the skill. Contents: resolved target (and whether it was a closest match), the template's instructions, the facts with their source paths, and the `no recorded reason` marker when applicable. The output is meant for an agent to read, not for the user.

## Constraints

- Project rules (AGENTS.md): `src/core/` stays pure and never imports from `commands/`. Exit codes are 0 ok, 1 error, 2 for a refused/blocked action (e.g. `-c` without `--force` on an existing name, or a tie). `npm run check` must pass. `npm run validate:skills` must pass for the new skill.
- **ADR before code:** the template file format and locations, and the `/baton` routing skill, are load-bearing. One ADR or two is the builder's call.
  - **How to write it (my call):** `baton decide` is a Phase 2 stub. Like ADRs 0001–0009, the new record(s) are written by hand as new files with the next number. Existing records are never edited.
- Skills use Agent Skills spec keys only (`name`, `description`, `license`).
- Work items go in the task store (`baton task create`), not markdown lists.
- Commander 15 is already the CLI parser. No new runtime dependencies are expected.

## Left to the builder

- Matching algorithm for closest match (edit distance, prefix, etc.) and the threshold below which nothing counts as close.
- Template file format details: probably a markdown body with minimal frontmatter (`name`, `description`). Settle it in the ADR.
- Wording of the built-in templates.
- How to detect "files that import it" (a grep over `src/` is fine to start).
- Where `explain` sits relative to the Phase 1 section index: reuse it if it exists, otherwise a minimal scan that the index later replaces.
- Tests: unit tests in `core/` for slugging, precedence, resolution and ties; a snapshot of `explain` output on this repo.
