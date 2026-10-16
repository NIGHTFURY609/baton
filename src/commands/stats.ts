import type { Command } from "commander";
import { notImplemented } from "../core/errors.js";
import { action } from "./_shared.js";

/**
 * Honest numbers from the session log: tokens at session start, doc tokens
 * per task, corrections per session, drift events, time to resume
 * (docs/design/metrics.md). Counts baton's own overhead against its savings.
 */
export function registerStats(program: Command): void {
  program
    .command("stats")
    .description("report measured tokens, corrections and drift from session logs")
    .option("--session <path>", "one transcript JSONL (default: all for this project)")
    .option("--since <date>", "only sessions on or after this date (YYYY-MM-DD)")
    .option("--format <fmt>", "text | json", "text")
    .action(
      action(async () => {
        notImplemented("stats", "Phase 1 (MVP)");
      }),
    );
}
