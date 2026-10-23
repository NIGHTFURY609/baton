import type { Command } from "commander";
import { loadConfig } from "../core/config.js";
import { runHandoff, STATE_PATH } from "../core/handoff.js";
import { findProjectRoot } from "../core/paths.js";
import { action, requireContext } from "./_shared.js";

interface HandoffCliOptions {
  reason: string;
  transcript?: string;
  dryRun?: boolean;
}

/**
 * Regenerate .context/STATE.md from structured sources only: task store,
 * `git status`, `git diff --stat`, and the last tool calls in the transcript.
 * Overwrites, never appends, and writes nothing when only timestamps changed
 * (ADR 0015).
 */
export function registerHandoff(program: Command): void {
  program
    .command("handoff")
    .description("regenerate STATE.md from the task store and git")
    .option("--reason <reason>", "why the handoff ran (pre-compact, session-end, manual)", "manual")
    .option("--transcript <path>", "session transcript to read recent tool calls from")
    .option("--dry-run", "print instead of writing STATE.md")
    .action(
      action(async (o: HandoffCliOptions) => {
        const root = findProjectRoot();
        requireContext(root);
        const config = await loadConfig(root);
        const result = await runHandoff(root, config, {
          reason: o.reason,
          ...(o.transcript === undefined ? {} : { transcriptPath: o.transcript }),
          ...(o.dryRun ? { dryRun: true } : {}),
        });
        if (o.dryRun) process.stdout.write(result.text);
        else if (result.changed) process.stdout.write(`wrote ${STATE_PATH} (${o.reason})\n`);
        else process.stdout.write(`${STATE_PATH} unchanged\n`);
      }),
    );
}
