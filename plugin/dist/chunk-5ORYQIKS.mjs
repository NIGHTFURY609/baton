#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  NATIVE_EVENT_NAMES,
  parseHookInput,
  readStdin,
  renderHookResult
} from "./chunk-Z3Y3YQIP.mjs";
import {
  contextPath,
  findContextRoot
} from "./chunk-HVIRJWHJ.mjs";

// src/hooks/dispatch.ts
import { existsSync } from "fs";
import { homedir } from "os";
var PRE_COMPACT_TAIL_BYTES = 262144;
var SESSION_END_TAIL_BYTES = 65536;
var hasContext = (ctx) => existsSync(contextPath(ctx.root));
var sessionStart = async (_input, ctx) => {
  if (!hasContext(ctx)) return { kind: "noop" };
  const { buildMission, writePacketCache } = await import("./mission-4EJLB4H6.mjs");
  const { loadConfig } = await import("./config-FM4NBPU3.mjs");
  const result = await buildMission(ctx.root, await loadConfig(ctx.root));
  try {
    await writePacketCache(ctx.root, result);
  } catch {
  }
  return { kind: "context", text: result.text };
};
function handoffHandler(reasonOf, tailBytes) {
  return async (input, ctx) => {
    if (!hasContext(ctx)) return { kind: "noop" };
    const { runHandoff } = await import("./handoff-PZ5KSXTV.mjs");
    const { loadConfig } = await import("./config-FM4NBPU3.mjs");
    await runHandoff(ctx.root, await loadConfig(ctx.root), {
      reason: reasonOf(input),
      tailBytes,
      ...typeof input.transcript_path === "string" ? { transcriptPath: input.transcript_path } : {}
    });
    if (ctx.harness === "claude" && typeof input.transcript_path === "string") {
      const { snapshotSession } = await import("./stats-KE2TPRII.mjs");
      await snapshotSession(ctx.root, input.transcript_path);
    }
    return { kind: "noop" };
  };
}
var HANDLERS = {
  "session-start": sessionStart,
  "pre-compact": handoffHandler(() => "pre-compact", PRE_COMPACT_TAIL_BYTES),
  "session-end": handoffHandler(
    (input) => typeof input.reason === "string" && input.reason ? `session-end:${input.reason}` : "session-end",
    SESSION_END_TAIL_BYTES
  ),
  "pre-tool-use": async (input, ctx) => (await import("./pre-tool-use-WM4UL3CJ.mjs")).preToolUse(input, ctx),
  "post-tool-use": async (input, ctx) => (await import("./post-tool-use-EU4FX5IB.mjs")).postToolUse(input, ctx),
  stop: async (input, ctx) => (await import("./stop-EQBT4EZ6.mjs")).stopHook(input, ctx)
};
async function runHook(event, harness, stdin = process.stdin) {
  try {
    const input = parseHookInput(await readStdin(stdin));
    const native = input.hook_event_name;
    if (native && NATIVE_EVENT_NAMES[native] && NATIVE_EVENT_NAMES[native] !== event) {
      throw new Error(`hook wired to "${event}" but received ${native}`);
    }
    const root = findContextRoot(input.cwd ?? process.cwd(), process.env.BATON_HOME ?? homedir());
    if (root === null) return renderHookResult(event, { kind: "noop" }, harness);
    const result = await HANDLERS[event](input, { root, harness });
    return renderHookResult(event, result, harness);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { stdout: "", stderr: `baton hook ${event}: ${message}
`, exitCode: 0 };
  }
}

export {
  runHook
};
//# sourceMappingURL=chunk-5ORYQIKS.mjs.map