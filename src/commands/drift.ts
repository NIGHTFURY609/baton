import { type Command, Option } from "commander";
import { loadConfig } from "../core/config.js";
import {
  appendDriftLog,
  bodyHash,
  driftJson,
  evaluateFreshness,
  type FailOn,
  failingSections,
  flagEvents,
  renderDriftText,
} from "../core/drift.js";
import { BatonError, ExitCode } from "../core/errors.js";
import { headSha, statusLines } from "../core/git.js";
import { loadSectionIndex } from "../core/sections.js";
import { STAMP_LENGTH, stampSections, uncommittedSources } from "../core/verify-doc.js";
import { action, projectRoot, requireContext } from "./_shared.js";

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
        const root = await projectRoot();
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
      action(async (ids: string[]) => {
        const root = await projectRoot();
        requireContext(root);
        const head = await headSha(root);
        if (head === null) {
          throw new BatonError("no commits yet; make a first commit before verify-doc");
        }
        const sha = head.slice(0, STAMP_LENGTH);
        const before = await loadSectionIndex(root);
        const stamps = await stampSections(root, ids, sha);
        for (const s of stamps) process.stdout.write(`verified ${s.id} at ${sha} (${s.file})\n`);

        const status = await statusLines(root);
        for (const { id } of stamps) {
          const paths = uncommittedSources(status, before.byId.get(id)?.meta.sourcePaths ?? []);
          if (paths.length > 0) {
            process.stderr.write(
              `note: ${id}: uncommitted changes in ${paths.join(", ")} will count once committed\n`,
            );
          }
        }

        const ts = new Date().toISOString();
        try {
          await appendDriftLog(
            root,
            stamps.map(({ id }) => ({
              v: 1 as const,
              ts,
              event: "verified" as const,
              head: sha,
              id,
              bodyHash: bodyHash(before.byId.get(id)?.body ?? ""),
            })),
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`baton: could not write drift log: ${message}\n`);
        }
      }),
    );
}
