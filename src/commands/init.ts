import type { Command } from "commander";
import { notImplemented } from "../core/errors.js";
import { parseHarnesses, scaffold } from "../core/init.js";
import { findProjectRoot } from "../core/paths.js";
import { action } from "./_shared.js";

interface InitOptions {
  harness: string;
  hooks: boolean;
  force?: boolean;
}

/**
 * Scaffold .context/ from the templates embedded in the bundle, write the
 * AGENTS.md router and the one-line CLAUDE.md pointer. Idempotent: existing
 * files are left alone unless --force; .gitattributes and .gitignore only gain
 * lines (ADR 0017).
 */
export function registerInit(program: Command): void {
  program
    .command("init")
    .description("scaffold .context/, the AGENTS.md router and harness hooks")
    .option("--harness <list>", "claude, codex, gemini or all (comma-separated)", "claude")
    .option("--no-hooks", "do not print hook setup")
    .option("--force", "overwrite existing files")
    .action(
      action(async (o: InitOptions) => {
        const harnesses = parseHarnesses(o.harness);
        for (const name of ["codex", "gemini"] as const) {
          if (harnesses.includes(name)) notImplemented(`init --harness ${name}`, "Phase 3 (Reach)");
        }
        const actions = await scaffold(findProjectRoot(), { force: o.force === true });
        for (const a of actions) {
          process.stdout.write(`${a.action} ${a.path}${a.note ? ` (${a.note})` : ""}\n`);
        }
        if (o.hooks && harnesses.includes("claude")) {
          process.stdout.write(
            "hooks: Claude Code hooks ship with the baton plugin (plugin/hooks/hooks.json); load it with claude --plugin-dir <baton>/plugin or /plugin install baton@baton-dev\n",
          );
        }
      }),
    );
}
