import type { Command } from "commander";
import { notImplemented } from "../core/errors.js";
import { action } from "./_shared.js";

/**
 * Decision records (MADR 4.0 in .context/decisions/). --preflight lists
 * accepted ADRs and spec sections a proposed change may conflict with, without
 * writing anything; the PreToolUse hook calls it for dependency files.
 */
export function registerDecide(program: Command): void {
  program
    .command("decide")
    .description("create, supersede or preflight-check a decision record")
    .argument("[title]", "decision title")
    .option("--preflight", "check for conflicts only; write nothing")
    .option("--supersedes <adr>", "ADR number this decision replaces")
    .option("--status <status>", "proposed | accepted", "proposed")
    .option("--accept <adr>", "mark an existing proposed ADR as accepted")
    .option("--spec <ids>", "comma-separated spec section ids this decision constrains")
    .action(
      action(async () => {
        notImplemented("decide", "Phase 2 (Gates)");
      }),
    );
}
