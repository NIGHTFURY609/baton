import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { contextPath, findContextRoot } from "../core/paths.js";
import type { Harness } from "../core/types.js";
import {
  type HookEvent,
  type HookInput,
  type HookResult,
  NATIVE_EVENT_NAMES,
  parseHookInput,
  type RenderedHookOutput,
  readStdin,
  renderHookResult,
} from "./io.js";

export interface HookContext {
  root: string;
  harness: Harness;
}

type Handler = (input: HookInput, ctx: HookContext) => Promise<HookResult>;

const noop: Handler = async () => ({ kind: "noop" });

export const PRE_COMPACT_TAIL_BYTES = 262_144;
export const SESSION_END_TAIL_BYTES = 65_536;

// Every Phase 1 handler checks for .context/ before importing anything: runHandoff
// would create STATE.md, and the task store would create .context/.cache, in a
// project that never opted in.
const hasContext = (ctx: HookContext): boolean => existsSync(contextPath(ctx.root));

const sessionStart: Handler = async (_input, ctx) => {
  if (!hasContext(ctx)) return { kind: "noop" };
  const { buildMission, writePacketCache } = await import("../core/mission.js");
  const { loadConfig } = await import("../core/config.js");
  const result = await buildMission(ctx.root, await loadConfig(ctx.root));
  try {
    await writePacketCache(ctx.root, result);
  } catch {
    // Hook stderr is shown on every session start, and the cache is optional (ADR 0014).
  }
  return { kind: "context", text: result.text };
};

function handoffHandler(reasonOf: (input: HookInput) => string, tailBytes: number): Handler {
  return async (input, ctx) => {
    if (!hasContext(ctx)) return { kind: "noop" };
    const { runHandoff } = await import("../core/handoff.js");
    const { loadConfig } = await import("../core/config.js");
    await runHandoff(ctx.root, await loadConfig(ctx.root), {
      reason: reasonOf(input),
      tailBytes,
      ...(typeof input.transcript_path === "string"
        ? { transcriptPath: input.transcript_path }
        : {}),
    });
    return { kind: "noop" };
  };
}

/**
 * Event -> handler. Core modules load with dynamic import(), so a no-op hook
 * never pays for them. Wiring (docs/design/architecture.md, ADR 0015):
 *
 * - session-start  -> mission packet as additionalContext; matcher includes
 *                     `compact` so the packet is re-injected after compaction  [Phase 1]
 * - pre-compact    -> handoff (task store + git + transcript tail), writes STATE.md [Phase 1]
 * - session-end    -> the same with a smaller tail; reason session-end[:<reason>] [Phase 1]
 * - pre-tool-use   -> deny direct edits to protected state (guards.ts, ADR 0020);
 *                     preflight context on dependency/migration files          [Phase 2]
 * - post-tool-use  -> notice the sections whose source_paths an edit touched, once per
 *                     session (post-tool-use.ts)                              [Phase 2]
 * - stop           -> opt-in: verify the active task before stopping           [Phase 2]
 */
export const HANDLERS: Record<HookEvent, Handler> = {
  "session-start": sessionStart,
  "pre-compact": handoffHandler(() => "pre-compact", PRE_COMPACT_TAIL_BYTES),
  "session-end": handoffHandler(
    (input) =>
      typeof input.reason === "string" && input.reason
        ? `session-end:${input.reason}`
        : "session-end",
    SESSION_END_TAIL_BYTES,
  ),
  "pre-tool-use": async (input, ctx) => (await import("./pre-tool-use.js")).preToolUse(input, ctx),
  "post-tool-use": async (input, ctx) =>
    (await import("./post-tool-use.js")).postToolUse(input, ctx),
  stop: async (input, ctx) => (await import("./stop.js")).stopHook(input, ctx),
};

/**
 * Run one hook end to end. Fails open: any error is reported on stderr and the
 * hook exits 0, because a broken continuity layer must never wedge a session.
 * Only an explicit `deny` / `block-stop` result changes the agent's behaviour.
 */
export async function runHook(
  event: HookEvent,
  harness: Harness,
  stdin: NodeJS.ReadableStream = process.stdin,
): Promise<RenderedHookOutput> {
  try {
    const input = parseHookInput(await readStdin(stdin));
    const native = input.hook_event_name;
    if (native && NATIVE_EVENT_NAMES[native] && NATIVE_EVENT_NAMES[native] !== event) {
      throw new Error(`hook wired to "${event}" but received ${native}`);
    }
    // No spawn on this path (the PreToolUse budget is 150 ms): the nearest .context/ that is
    // not the home folder, or nothing to do.
    const root = findContextRoot(input.cwd ?? process.cwd(), process.env.BATON_HOME ?? homedir());
    if (root === null) return renderHookResult(event, { kind: "noop" }, harness);
    const result = await HANDLERS[event](input, { root, harness });
    return renderHookResult(event, result, harness);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { stdout: "", stderr: `baton hook ${event}: ${message}\n`, exitCode: 0 };
  }
}
