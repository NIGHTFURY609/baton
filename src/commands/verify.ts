import type { Command } from "commander";
import { loadConfig } from "../core/config.js";
import { BatonError, ExitCode } from "../core/errors.js";
import { TaskError } from "../core/tasks/native/model.js";
import { verifyTask } from "../core/verify.js";
import { action, projectRoot, requireContext } from "./_shared.js";
import { toBatonError } from "./task.js";

/**
 * Run a task's check commands and close it in the task store only when all exit 0
 * (and, by default, the diff since the claim is non-empty). No proof string from the
 * model is ever accepted: the checks run here (ADR 0019).
 */
export function registerVerify(program: Command): void {
  program
    .command("verify")
    .description("run a task's check commands; close the task only if they pass")
    .argument("<task-id>", "task id in the task store")
    .option("--no-diff", "allow closing with an empty diff")
    .action(
      action(async (id: string, o: { diff?: boolean }) => {
        const root = await projectRoot();
        requireContext(root);
        const config = await loadConfig(root);
        const outcome = await verifyTask(root, config, id, {
          requireDiff: config.verify.requireDiff && o.diff !== false,
          close: true,
          onCheckStart: (c) => process.stdout.write(`running check: ${c}\n`),
          onOutput: (chunk, s) => (s === "stdout" ? process.stdout : process.stderr).write(chunk),
        }).catch((err: unknown) => {
          throw err instanceof TaskError ? toBatonError(err) : err;
        });
        switch (outcome.status) {
          case "already-closed":
            process.stdout.write(`${id} is already closed\n`);
            return;
          case "no-diff":
            throw new BatonError(
              `no changes since ${id} was started (${outcome.since}); verify needs a non-empty diff outside the task store (use --no-diff for a task without file changes)`,
              ExitCode.Blocked,
            );
          case "failed": {
            const run = outcome.run;
            throw new BatonError(
              `check failed (${run.timedOut ? "timed out" : `exit ${run.exitCode}`}): ${run.command}; ${id} stays open`,
              ExitCode.Blocked,
            );
          }
          case "passed":
            process.stdout.write(
              `closed ${id} (checks passed: ${outcome.runs.map((r) => r.command).join("; ")})\n`,
            );
        }
      }),
    );
}
