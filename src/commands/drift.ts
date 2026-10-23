import { type Command, Option } from "commander";
import { loadConfig } from "../core/config.js";
import {
  appendDriftLog,
  driftJson,
  evaluateFreshness,
  type FailOn,
  failingSections,
  flagEvents,
  renderDriftText,
} from "../core/drift.js";
import { BatonError, ExitCode, notImplemented } from "../core/errors.js";
import { findProjectRoot } from "../core/paths.js";
import { loadSectionIndex } from "../core/sections.js";
import { action, requireContext } from "./_shared.js";

interface DriftOptions {
  format: "text" | "json";
  failOn?: FailOn;
}

/**
 * Freshness report over every section in .context/ (ADR 0013). Appends flag
 * events to .context/.cache/drift.jsonl for stats.
 */
export function registerDrift(program: Command): void {
  program
    .command("drift")
    .description("report fresh / aging / stale / superseded sections")
    .addOption(
      new Option("--format <fmt>", "output format").choices(["text", "json"]).default("text"),
    )
    .addOption(
      new Option("--fail-on <level>", "exit 2 if any section is at this level or worse").choices([
        "aging",
        "stale",
      ]),
    )
    .action(
      action(async (opts: DriftOptions) => {
        const root = findProjectRoot();
        requireContext(root);
        const config = await loadConfig(root);
        const index = await loadSectionIndex(root);
        const report = await evaluateFreshness(index, config);

        process.stdout.write(
          opts.format === "json"
            ? `${JSON.stringify(driftJson(report), null, 2)}\n`
            : renderDriftText(report),
        );

        try {
          await appendDriftLog(root, flagEvents(report, new Date().toISOString()));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`baton: could not write drift log: ${message}\n`);
        }

        if (opts.failOn !== undefined) {
          const failing = failingSections(report, opts.failOn);
          if (failing.length > 0) {
            const ids = failing.map((s) => s.section.meta.id);
            throw new BatonError(
              `${failing.length} section(s) at or beyond ${opts.failOn}: ${ids.join(", ")}`,
              ExitCode.Blocked,
            );
          }
        }
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
