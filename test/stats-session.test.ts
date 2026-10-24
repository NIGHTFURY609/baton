import { describe, expect, it } from "vitest";
import { PACKET_HEADER } from "../src/core/budget.js";
import { isCorrection, sessionMetrics, userPrompts } from "../src/core/stats.js";
import type { TranscriptRecord } from "../src/core/transcript.js";
import { hookAttachment, toolResult, toolUse, userPrompt } from "./helpers/transcript.js";

const asRecords = (r: Record<string, unknown>[]) => r as TranscriptRecord[];

describe("sessionMetrics", () => {
  it("computes every metric from one session", () => {
    const root = "C:\\work\\demo";
    const packet = `${PACKET_HEADER}\nProject demo at commit none.`;
    const records = asRecords([
      hookAttachment(
        {
          type: "hook_success",
          hookName: "SessionStart:startup",
          stdout: "{}",
          stderr: "",
          exitCode: 0,
        },
        "2026-10-20T10:00:00.000Z",
      ),
      hookAttachment(
        { type: "hook_additional_context", hookEvent: "SessionStart", content: [packet] },
        "2026-10-20T10:00:00.000Z",
      ),
      userPrompt("Fix the drift command", "2026-10-20T10:00:01.000Z"),
      toolUse(
        "r1",
        "Read",
        { file_path: "C:\\work\\demo\\.context\\spec.md" },
        "2026-10-20T10:00:05.000Z",
        {
          input_tokens: 10,
          cache_creation_input_tokens: 2000,
          cache_read_input_tokens: 3000,
          output_tokens: 50,
        },
      ),
      toolResult("r1", "x".repeat(400)),
      toolUse("r2", "Read", { file_path: "C:\\work\\demo\\src\\a.ts" }),
      toolResult("r2", "y".repeat(1000)),
      toolUse("b1", "Bash", { command: "node dist/baton.mjs task close bt-1 bt-2 --reason done" }),
      toolResult("b1", "closed bt-1\nclosed bt-2"),
      userPrompt("No, don't touch STATE.md"),
      toolUse("e1", "Edit", { file_path: "c:\\work\\demo\\src\\a.ts" }, "2026-10-20T10:01:35.000Z"),
      hookAttachment({
        type: "hook_success",
        hookName: "PreToolUse:Edit",
        stderr: "baton hook pre-tool-use: boom\n",
        exitCode: 0,
      }),
    ]);
    const m = sessionMetrics(records, {
      sessionId: "s1",
      root,
      malformedLines: 1,
      platform: "win32",
    });
    expect(m.v).toBe(1);
    expect(m.source).toBe("transcript");
    expect(m.sessionId).toBe("s1");
    expect(m.startedAt).toBe("2026-10-20T10:00:00.000Z");
    expect(m.endedAt).toBe("2026-10-20T10:01:35.000Z");
    expect(m.firstTurnContextTokens).toBe(5010);
    expect(m.usage.outputTokens).toBe(50);
    expect(m.docReads).toBe(1);
    expect(m.docReadChars).toBe(400);
    expect(m.packetInjections).toBe(1);
    expect(m.packetChars).toBe(packet.length);
    expect(m.docTokensEstimate).toBe(Math.ceil((400 + packet.length) / 4));
    expect(m.tasksClosed).toEqual(["bt-1", "bt-2"]);
    expect(m.corrections).toBe(1);
    expect(m.secondsToFirstEdit).toBe(95);
    expect(m.hookErrors).toBe(1);
    expect(m.malformedLines).toBe(1);
  });

  it("matches POSIX roots on a path boundary", () => {
    const records = asRecords([
      userPrompt("go"),
      toolUse("a", "Read", { file_path: "/work/demo/.context/rules.md" }),
      toolResult("a", "abc"),
      toolUse("b", "Read", { file_path: "/work/demo2/.context/x.md" }),
      toolResult("b", "zzzz"),
    ]);
    const m = sessionMetrics(records, { sessionId: "s", root: "/work/demo", platform: "linux" });
    expect(m.docReads).toBe(1);
    expect(m.docReadChars).toBe(3);
  });

  it("sums text blocks of array tool results", () => {
    const result = toolResult("a", "");
    (result.message as { content: unknown[] }).content = [
      {
        type: "tool_result",
        tool_use_id: "a",
        content: [
          { type: "text", text: "12345" },
          { type: "image", source: {} },
          { type: "text", text: "678" },
        ],
      },
    ];
    const records = asRecords([toolUse("a", "Read", { file_path: "/w/.context/s.md" }), result]);
    const m = sessionMetrics(records, { sessionId: "s", root: "/w", platform: "linux" });
    expect(m.docReadChars).toBe(8);
  });

  it("a failed close is not counted", () => {
    const records = asRecords([
      userPrompt("go"),
      toolUse("b", "Bash", { command: "baton task close bt-9" }),
      toolResult("b", "nope", true),
    ]);
    const m = sessionMetrics(records, { sessionId: "s", root: "/w", platform: "linux" });
    expect(m.tasksClosed).toEqual([]);
  });

  it("counts baton verify as a close", () => {
    const records = asRecords([
      userPrompt("go"),
      toolUse("v1", "Bash", { command: "node dist/baton.mjs verify bt-3 --no-diff" }),
      toolResult("v1", "closed bt-3"),
      toolUse("v2", "Bash", { command: "baton verify-doc auth" }),
      toolResult("v2", "ok"),
    ]);
    const m = sessionMetrics(records, { sessionId: "s", root: "/w", platform: "linux" });
    expect(m.tasksClosed).toEqual(["bt-3"]);
  });

  it("ignores sidechain records", () => {
    const side = {
      ...toolUse("a", "Read", { file_path: "/w/.context/s.md" }),
      isSidechain: true,
    };
    const m = sessionMetrics(asRecords([userPrompt("go"), side, toolResult("a", "abc")]), {
      sessionId: "s",
      root: "/w",
      platform: "linux",
    });
    expect(m.docReads).toBe(0);
    expect(m.docReadChars).toBe(0);
  });

  it("counts non-blocking baton hook errors by command", () => {
    const records = asRecords([
      hookAttachment({
        type: "hook_non_blocking_error",
        command: "node baton.mjs hook x",
        args: [],
      }),
      hookAttachment({ type: "hook_non_blocking_error", command: "other", args: ["a"] }),
    ]);
    const m = sessionMetrics(records, { sessionId: "s", root: "/w", platform: "linux" });
    expect(m.hookErrors).toBe(1);
  });
});

describe("isCorrection", () => {
  it.each([
    "No, use the CLI",
    "no.",
    "Don't edit STATE.md",
    "don’t",
    "We decided on Beads",
    "Actually, keep it",
    "that's wrong",
    "  stop",
    "Revert that",
  ])("true: %s", (p) => {
    expect(isCorrection(p)).toBe(true);
  });
  it.each([
    "Now add tests",
    "nothing else",
    "Notice the bug",
    "Documentation please",
    "",
    "Please continue",
  ])("false: %s", (p) => {
    expect(isCorrection(p)).toBe(false);
  });
});

describe("userPrompts", () => {
  it("skips tool results, meta and tag-only text", () => {
    const tagged = userPrompt("");
    (tagged.message as { content: unknown }).content = [
      { type: "text", text: "<ide_opened_file>x</ide_opened_file>" },
      { type: "text", text: "real ask" },
    ];
    const meta = { ...userPrompt("meta text"), isMeta: true };
    const records = asRecords([
      tagged,
      meta,
      toolUse("a", "Bash", { command: "ls" }),
      toolResult("a", "out"),
    ]);
    expect(userPrompts(records).map((p) => p.text)).toEqual(["real ask"]);
  });
});
