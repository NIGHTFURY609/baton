#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  contextPath
} from "./chunk-HVIRJWHJ.mjs";
import "./chunk-UC4Y6CAD.mjs";

// src/hooks/stop.ts
import { existsSync } from "fs";
var STOP_CHECK_TIMEOUT_MS = 54e4;
var STOP_TAIL_CHARS = 1500;
function blockReason(id, run) {
  const how = run.timedOut ? `timed out after ${STOP_CHECK_TIMEOUT_MS / 1e3} s` : `exit ${run.exitCode}`;
  return [
    `Task ${id} is in progress and its check failed (${how}): ${run.command}`,
    "Last output:",
    run.tail.slice(-STOP_TAIL_CHARS).trim() || "(no output)",
    `The task stays open. baton verify ${id} closes it once the check passes.`
  ].join("\n");
}
async function stopHook(input, ctx) {
  if (!existsSync(contextPath(ctx.root))) return { kind: "noop" };
  if (input.stop_hook_active === true) return { kind: "noop" };
  const { loadConfig } = await import("./config-FM4NBPU3.mjs");
  const config = await loadConfig(ctx.root);
  if (!config.verify.onStop || config.tasks.backend !== "native") return { kind: "noop" };
  const { activeTask, verifyTask } = await import("./verify-2KSWPSCE.mjs");
  const { resolveActor } = await import("./store-7LEZCGRO.mjs");
  const task = await activeTask(ctx.root, config, resolveActor(ctx.root));
  if (task === null) return { kind: "noop" };
  const outcome = await verifyTask(ctx.root, config, task.id, {
    requireDiff: config.verify.requireDiff,
    close: false,
    totalTimeoutMs: STOP_CHECK_TIMEOUT_MS
  });
  if (outcome.status === "failed") {
    return { kind: "block-stop", reason: blockReason(task.id, outcome.run) };
  }
  return { kind: "noop" };
}
export {
  STOP_CHECK_TIMEOUT_MS,
  STOP_TAIL_CHARS,
  blockReason,
  stopHook
};
//# sourceMappingURL=stop-EQBT4EZ6.mjs.map