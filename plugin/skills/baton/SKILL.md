---
name: baton
description: Run any baton command from the agent as `/baton <command> [args]`, for example `/baton explain supabase --as caveman` or `/baton task ready`. Routes handoff, decide, checkpoint, doc-audit and init-spec to their dedicated skills, runs everything else through the baton CLI, and writes explanations of a project element in a chosen voice from `baton explain` output. Use when the user types `/baton`, or asks to explain a part of the project in a given voice (caveman, baby, student, or their own).
license: MIT
---
# baton

`/baton <args>` means `baton <args>` in a terminal. `baton` must be on PATH: `npm install -g baton-ctx`, or `npm link` in the baton repo (ADR 0011).

## Routing

Take the first word of `$ARGUMENTS`.

- `handoff`, `decide`, `checkpoint`, `doc-audit` or `init-spec`: follow that skill's steps, using the remaining arguments as its input.
- `explain`: use the Explain procedure below.
- Anything else: run `baton $ARGUMENTS` and report the result. Exit code 2 means blocked: say why, using the command's own message. Exit code 3 means not built yet: say so and do not retry.
- No arguments: if the user's message asks for an explanation ("explain supabase like a caveman"), map it to `explain <thing> [--as <template>]` and use the Explain procedure. Otherwise run `baton --help` and show the commands.

## Explain procedure

`baton explain <thing> [--as <template>]` gathers literal facts about one project element and the template's instructions. It never writes the explanation; you do.

**Template management.** If the arguments contain `-c`, `--create`, `--delete` or `--templates` (create also takes `-p`, `-s` and `--force`), run `baton $ARGUMENTS` and report what it printed. Do not add `--format json`.

**Otherwise,** first split the arguments into two parts. The CLI part is `explain <thing>` plus its flags (`--as <template>`; quote a multi-word value). Everything else is writer instructions: length, tone or audience ("super brief", "technical", "for a judge"). The CLI joins every free word into the query, so extra words left in the command make the lookup fail. If it is unclear which words name the thing, ask the user. For example, `explain commander --as caveman super brief` runs `baton explain commander --as caveman --format json`, and "super brief" is applied when writing.

Run only the CLI part with `--format json` appended, and branch on `status`. Exit code 2 (a tie) and 1 (none) still print JSON on stdout; read it. Any other failure (for example an unknown template name), report the error as printed.

- `"tie"`: list each entry of `candidates` (`kind`, `name`, `source`) and ask the user which one they meant. Do not pick one.
- `"none"`: say nothing matched, and list `suggestions` if there are any.
- `"ok"`: write the explanation.
  - Use the voice in `result.template.prompt`. It sets voice and style only and never adds facts. A project template with the same name as a built-in overrides the built-in for every call.
  - Use only what is in `result.facts`. Each fact has a `source` (`path:line`); cite sources where it helps. Do not add anything you know from elsewhere or guess.
  - If `result.facts` is empty, say baton found the target (name it, with its source from `result.targets`) but nothing in the repo describes it. Do not fill the gap.
  - Stay under `result.maxWords` words, unless the user's own message asks for more or less.
  - The writer instructions you split off ("technical", "super brief", "for a judge") override the template.
  - If `result.resolution` is `"closest"`, say in the first line that no exact match was found and which target you explained instead (`result.targets`).
  - If `result.noRecordedReason` is true, no ADR or `.context/` section links this target. Say plainly that no recorded decision explains it. You may repeat a reason only if a fact quotes one, and then cite that fact's source; never add a reason of your own or invent a purpose.
  - If a fact's `provenance` is `stale`, `aging` or `unverified`, say that part may be out of date. `superseded` means the record was replaced; do not present it as current.

On every status, if `skipped` is non-empty, add one line saying those files could not be read (name them from `skipped[].file`). Do not guess what they contained.

## Rules

- Never edit `.context/` state by hand; use the baton commands.
- Do not call a model or any other tool to produce facts. The CLI output is the only source for an explanation.
