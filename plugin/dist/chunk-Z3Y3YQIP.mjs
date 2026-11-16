#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);

// src/hooks/io.ts
var HOOK_EVENTS = [
  "session-start",
  "pre-compact",
  "session-end",
  "pre-tool-use",
  "post-tool-use",
  "stop"
];
var NATIVE_EVENT_NAMES = {
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
  AfterAgent: "stop"
};
async function readStdin(stream = process.stdin) {
  if (stream.isTTY) return "";
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function isFastHookArgv(args) {
  const event = args[0];
  if (event === void 0 || !HOOK_EVENTS.includes(event)) return false;
  return !args.includes("-h") && !args.includes("--help");
}
function parseHookInput(raw) {
  const text = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  if (!text.trim()) return {};
  const value = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("hook stdin must be a JSON object");
  }
  return value;
}
var NATIVE_NAME = {
  claude: {
    "session-start": "SessionStart",
    "pre-tool-use": "PreToolUse",
    "post-tool-use": "PostToolUse"
  },
  codex: {
    "session-start": "SessionStart",
    "pre-tool-use": "PreToolUse",
    "post-tool-use": "PostToolUse"
  },
  gemini: {
    "session-start": "SessionStart",
    "pre-tool-use": "BeforeTool",
    "post-tool-use": "AfterTool"
  }
};
function renderHookResult(event, result, harness = "claude") {
  const ok = (obj) => ({
    stdout: JSON.stringify(obj),
    stderr: "",
    exitCode: 0
  });
  switch (result.kind) {
    case "noop":
      return { stdout: "", stderr: "", exitCode: 0 };
    case "context":
      return ok({
        hookSpecificOutput: {
          hookEventName: NATIVE_NAME[harness][event] ?? event,
          additionalContext: result.text
        }
      });
    case "deny":
      if (harness === "gemini") return ok({ decision: "deny", reason: result.reason });
      return ok({
        hookSpecificOutput: {
          hookEventName: NATIVE_NAME[harness]["pre-tool-use"],
          permissionDecision: "deny",
          permissionDecisionReason: result.reason
        }
      });
    case "block-stop":
      return ok({ decision: "block", reason: result.reason });
    case "message":
      return ok({ systemMessage: result.text });
  }
}

export {
  HOOK_EVENTS,
  NATIVE_EVENT_NAMES,
  readStdin,
  isFastHookArgv,
  parseHookInput,
  renderHookResult
};
//# sourceMappingURL=chunk-Z3Y3YQIP.mjs.map