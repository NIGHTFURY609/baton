import type { Command } from "commander";
import { notImplemented } from "../core/errors.js";
import { action } from "./_shared.js";

/**
 * Scaffold .context/ from templates/context, write the AGENTS.md router and the
 * one-line CLAUDE.md pointer, and install hooks for the chosen harness(es).
 * Idempotent: existing files are left alone unless --force.
 */
export function registerInit(program: Command): void {
  program
    .command("init")
    .description("scaffold .context/, the AGENTS.md router and harness hooks")
    .option("--harness <list>", "claude, codex, gemini or all (comma-separated)", "claude")
    .option("--no-hooks", "do not install hooks")
    .option("--force", "overwrite existing files")
    .action(
      action(async () => {
        notImplemented("init", "Phase 1 (MVP)");
      }),
    );
}
