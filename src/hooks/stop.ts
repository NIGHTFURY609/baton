import { existsSync } from "node:fs";
import { contextPath } from "../core/paths.js";
import type { HookContext } from "./dispatch.js";
import type { HookInput, HookResult } from "./io.js";

export const STOP_CHECK_TIMEOUT_MS = 540_000;
export const STOP_TAIL_CHARS = 1500;

export function blockReason(
  id: string,
  run: { command: string; exitCode: number | null; timedOut: boolean; tail: string },
): string {
  const how = run.timedOut
    ? `timed out after ${STOP_CHECK_TIMEOUT_MS / 1000} s`
    : `exit ${run.exitCode}`;
  return [
    `Task ${id} is in progress and its check failed (${how}): ${run.command}`,
    "Last output:",
    run.tail.slice(-STOP_TAIL_CHARS).trim() || "(no output)",
    `The task stays open. baton verify ${id} closes it once the check passes.`,
  ].join("\n");
}

/** Opt-in (verify.onStop): block the stop while the active task's check fails. Never closes a task. */
export async function stopHook(input: HookInput, ctx: HookContext): Promise<HookResult> {
  if (!existsSync(contextPath(ctx.root))) return { kind: "noop" };
  if (input.stop_hook_active === true) return { kind: "noop" };

  const { loadConfig } = await import("../core/config.js");
  const config = await loadConfig(ctx.root);
  if (!config.verify.onStop || config.tasks.backend !== "native") return { kind: "noop" };

  const { activeTask, verifyTask } = await import("../core/verify.js");
  const { resolveActor } = await import("../core/tasks/native/store.js");
  const task = await activeTask(ctx.root, config, resolveActor(ctx.root));
  if (task === null) return { kind: "noop" };

  const outcome = await verifyTask(ctx.root, config, task.id, {
    requireDiff: config.verify.requireDiff,
    close: false,
    totalTimeoutMs: STOP_CHECK_TIMEOUT_MS,
  });
  if (outcome.status === "failed") {
    return { kind: "block-stop", reason: blockReason(task.id, outcome.run) };
  }
  return { kind: "noop" };
}
