import type { Command } from "commander";
import { notImplemented } from "../core/errors.js";
import { action } from "./_shared.js";

/**
 * Regenerate .context/STATE.md from structured sources only: task store,
 * `git status`, `git diff --stat`, and the last tool calls in the transcript.
 * Overwrites, never appends. Deterministic by default; an LLM summary is
 * opt-in and labelled as such in the output.
 */
export function registerHandoff(program: Command): void {
  program
    .command("handoff")
    .description("regenerate STATE.md from the task store and git")
    .option("--reason <reason>", "why the handoff ran (pre-compact, session-end, manual)", "manual")
    .option("--transcript <path>", "session transcript to read recent tool calls from")
    .option("--dry-run", "print instead of writing STATE.md")
    .action(
      action(async () => {
        notImplemented("handoff", "Phase 1 (MVP)");
      }),
    );
}
