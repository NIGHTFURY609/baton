import type { Command } from "commander";
import { notImplemented } from "../core/errors.js";
import { action } from "./_shared.js";

/**
 * Run a task's check command and close it in the task store only on exit 0
 * (and, by default, a non-empty diff). No proof string from the model is
 * ever accepted: the check runs here.
 */
export function registerVerify(program: Command): void {
  program
    .command("verify")
    .description("run a task's check command; close the task only if it passes")
    .argument("<task-id>", "task id in the task store")
    .option("--no-diff", "allow closing with an empty diff")
    .action(
      action(async () => {
        notImplemented("verify", "Phase 2 (Gates)");
      }),
    );
}
