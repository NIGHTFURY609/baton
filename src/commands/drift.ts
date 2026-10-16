import type { Command } from "commander";
import { notImplemented } from "../core/errors.js";
import { action } from "./_shared.js";

/**
 * Freshness report over every section in .context/: per-section commit drift
 * (core/freshness.ts), dead references, stale tasks, orphan knowledge topics,
 * oversized rules. Appends events to .context/.cache/drift.jsonl for stats.
 */
export function registerDrift(program: Command): void {
  program
    .command("drift")
    .description("report fresh / aging / stale / superseded sections")
    .option("--format <fmt>", "text | json", "text")
    .option("--fail-on <level>", "exit 2 if any section is at this level or worse (aging | stale)")
    .action(
      action(async () => {
        notImplemented("drift", "Phase 1 (MVP)");
      }),
    );

  program
    .command("verify-doc")
    .description("mark sections as re-verified at HEAD (bumps verified_at)")
    .argument("<section-ids...>", "section ids to stamp")
    .action(
      action(async () => {
        notImplemented("verify-doc", "Phase 1 (MVP)");
      }),
    );
}
