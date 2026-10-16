import type { Command } from "commander";
import { notImplemented } from "../core/errors.js";
import { action } from "./_shared.js";

/**
 * Print the mission packet: STATE head, ready tasks, spec sections tagged to
 * them, last handoff warnings, stale flags; greedy-fitted under --budget
 * characters (core/budget.ts). Stale and superseded sections are never
 * included, only listed. The SessionStart hook injects exactly this output.
 */
export function registerMission(program: Command): void {
  program
    .command("mission")
    .description("print the budgeted mission packet for the next session")
    .option("--budget <chars>", "max characters (default from config, <= 10000)")
    .option("--task <id>", "focus the packet on one task instead of the ready queue")
    .option("--format <fmt>", "text | json", "text")
    .action(
      action(async () => {
        notImplemented("mission", "Phase 1 (MVP)");
      }),
    );
}
