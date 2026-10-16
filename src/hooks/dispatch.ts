import { findProjectRoot } from "../core/paths.js";
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

/**
 * Event -> handler. Every handler is a no-op until its phase lands, so the
 * plugin is safe to install today. Wiring plan (docs/design/architecture.md):
 *
 * - session-start  -> mission packet as additionalContext; matcher includes
 *                     `compact` so the packet is re-injected after compaction  [Phase 1]
 * - pre-compact    -> handoff (deterministic: task store + git), writes STATE.md [Phase 1]
 * - session-end    -> quick handoff; must finish inside the harness budget      [Phase 1]
 * - pre-tool-use   -> deny direct edits to protected state (guards.ts);
 *                     decide --preflight on dependency/migration files         [Phase 2]
 * - post-tool-use  -> mark sections whose source_paths were touched as aging   [Phase 2]
 * - stop           -> opt-in: verify the active task before stopping           [Phase 2]
 */
export const HANDLERS: Record<HookEvent, Handler> = {
  "session-start": noop,
  "pre-compact": noop,
  "session-end": noop,
  "pre-tool-use": noop,
  "post-tool-use": noop,
  stop: noop,
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
    const root = findProjectRoot(input.cwd ?? process.cwd());
    const result = await HANDLERS[event](input, { root, harness });
    return renderHookResult(event, result, harness);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { stdout: "", stderr: `baton hook ${event}: ${message}\n`, exitCode: 0 };
  }
}
