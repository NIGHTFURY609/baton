import type { Command } from "commander";
import { notImplemented } from "../core/errors.js";
import { action } from "./_shared.js";

/**
 * Regenerate AGENTS.md (<= 60 lines), the one-line CLAUDE.md pointer and other
 * harness rule files from .context/rules.md. --check exits 2 on drift (CI).
 * Output stays compatible with rulesync-class generators rather than
 * competing with them.
 */
export function registerCompile(program: Command): void {
  program
    .command("compile")
    .description("regenerate AGENTS.md / CLAUDE.md from .context/rules.md")
    .option("--check", "exit 2 if generated files are out of date; write nothing")
    .action(
      action(async () => {
        notImplemented("compile", "Phase 2 (Gates)");
      }),
    );
}
