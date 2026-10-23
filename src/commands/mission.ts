import type { Command } from "commander";
import { loadConfig } from "../core/config.js";
import { buildMission, parseBudget, writePacketCache } from "../core/mission.js";
import { findProjectRoot } from "../core/paths.js";
import { action, requireContext } from "./_shared.js";

interface MissionCliOptions {
  budget?: string;
  task?: string;
  format: string;
}

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
      action(async (o: MissionCliOptions) => {
        const root = findProjectRoot();
        requireContext(root);
        const config = await loadConfig(root);
        const maxChars = parseBudget(o.budget, config.packet.maxChars);
        const result = await buildMission(root, config, {
          maxChars,
          ...(o.task === undefined ? {} : { taskId: o.task }),
        });
        try {
          await writePacketCache(root, result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`baton: could not write packet cache: ${message}\n`);
        }
        process.stdout.write(
          o.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : `${result.text}\n`,
        );
      }),
    );
}
