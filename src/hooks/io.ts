import type { Harness } from "../core/types.js";

/**
 * Hook I/O, normalised across harnesses. Field names come from each harness's
 * hook reference (see docs/research/2026-10-16-implementation-notes.md):
 * Claude Code and Codex share a shape; Gemini CLI differs in event names and
 * in how a tool call is denied.
 */

export type HookEvent =
  | "session-start"
  | "pre-compact"
  | "session-end"
  | "pre-tool-use"
  | "post-tool-use"
  | "stop";

export const HOOK_EVENTS: readonly HookEvent[] = [
  "session-start",
  "pre-compact",
  "session-end",
  "pre-tool-use",
  "post-tool-use",
  "stop",
];

/** Native event name -> baton event, for validating stdin against the CLI argument. */
export const NATIVE_EVENT_NAMES: Record<string, HookEvent> = {
  // Claude Code and Codex
  SessionStart: "session-start",
  PreCompact: "pre-compact",
  SessionEnd: "session-end",
  PreToolUse: "pre-tool-use",
  PostToolUse: "post-tool-use",
  Stop: "stop",
  // Gemini CLI
  PreCompress: "pre-compact",
  BeforeTool: "pre-tool-use",
  AfterTool: "post-tool-use",
  AfterAgent: "stop",
};

export interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  /** SessionStart: startup | resume | clear | compact | fork */
  source?: string;
  /** PreCompact: manual | auto */
  trigger?: string;
  /** SessionEnd */
  reason?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
  [key: string]: unknown;
}

export async function readStdin(stream: NodeJS.ReadableStream = process.stdin): Promise<string> {
  // Interactive terminals never send EOF; a hook always has piped stdin.
  if ((stream as NodeJS.ReadStream).isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function parseHookInput(raw: string): HookInput {
  if (!raw.trim()) return {};
  const value = JSON.parse(raw) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("hook stdin must be a JSON object");
  }
  return value as HookInput;
}

/** What a handler wants to happen. Rendered per harness by renderHookResult. */
export type HookResult =
  | { kind: "noop" }
  | { kind: "context"; text: string }
  | { kind: "deny"; reason: string }
  | { kind: "block-stop"; reason: string }
  | { kind: "message"; text: string };

export interface RenderedHookOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const NATIVE_NAME: Record<Harness, Partial<Record<HookEvent, string>>> = {
  claude: { "session-start": "SessionStart", "pre-tool-use": "PreToolUse" },
  codex: { "session-start": "SessionStart", "pre-tool-use": "PreToolUse" },
  gemini: { "session-start": "SessionStart", "pre-tool-use": "BeforeTool" },
};

/**
 * Turn a HookResult into stdout/stderr/exit code. Context is always sent as
 * JSON `hookSpecificOutput.additionalContext` (all three harnesses accept it
 * for SessionStart). Denies use the structured form rather than exit 2 so the
 * reason reaches the model verbatim.
 */
export function renderHookResult(
  event: HookEvent,
  result: HookResult,
  harness: Harness = "claude",
): RenderedHookOutput {
  const ok = (obj: unknown): RenderedHookOutput => ({
    stdout: JSON.stringify(obj),
    stderr: "",
    exitCode: 0,
  });
  switch (result.kind) {
    case "noop":
      return { stdout: "", stderr: "", exitCode: 0 };
    case "context":
      return ok({
        hookSpecificOutput: {
          hookEventName: NATIVE_NAME[harness][event] ?? event,
          additionalContext: result.text,
        },
      });
    case "deny":
      if (harness === "gemini") return ok({ decision: "deny", reason: result.reason });
      return ok({
        hookSpecificOutput: {
          hookEventName: NATIVE_NAME[harness]["pre-tool-use"],
          permissionDecision: "deny",
          permissionDecisionReason: result.reason,
        },
      });
    case "block-stop":
      return ok({ decision: "block", reason: result.reason });
    case "message":
      return ok({ systemMessage: result.text });
  }
}
