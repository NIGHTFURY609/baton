import { type Command, Option } from "commander";
import { findProjectRoot } from "../core/paths.js";
import { collectStats, renderStats, type StatsOptions } from "../core/stats.js";
import { action } from "./_shared.js";

interface StatsFlags {
  session?: string;
  since?: string;
  format: "text" | "json";
}

/**
 * Honest numbers from the session log: tokens at session start, doc tokens
 * per task, corrections per session, drift events, time to first edit
 * (docs/design/metrics.md, ADR 0016). Works without .context/ so a project
 * can take a Phase 0 baseline before adopting baton.
 */
export function registerStats(program: Command): void {
  program
    .command("stats")
    .description("report measured tokens, corrections and drift from session logs")
    .option("--session <path>", "one transcript JSONL (default: all for this project)")
    .option("--since <date>", "only sessions on or after this date (YYYY-MM-DD)")
    .addOption(
      new Option("--format <fmt>", "output format").choices(["text", "json"]).default("text"),
    )
    .action(
      action(async (opts: StatsFlags) => {
        const root = findProjectRoot();
        const options: StatsOptions = {};
        if (opts.session !== undefined) options.sessionPath = opts.session;
        if (opts.since !== undefined) options.since = opts.since;
        const report = await collectStats(root, options);
        process.stdout.write(
          `${opts.format === "json" ? JSON.stringify(report, null, 2) : renderStats(report)}\n`,
        );
      }),
    );
}
