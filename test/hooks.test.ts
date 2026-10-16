import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { runHook } from "../src/hooks/dispatch.js";
import { renderHookResult } from "../src/hooks/io.js";

const stdin = (obj: unknown) => Readable.from([JSON.stringify(obj)]);

describe("renderHookResult", () => {
  it("emits SessionStart context as additionalContext", () => {
    const out = renderHookResult("session-start", { kind: "context", text: "packet" });
    expect(JSON.parse(out.stdout)).toEqual({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "packet" },
    });
    expect(out.exitCode).toBe(0);
  });

  it("renders denies per harness", () => {
    const claude = JSON.parse(
      renderHookResult("pre-tool-use", { kind: "deny", reason: "use baton handoff" }).stdout,
    );
    expect(claude.hookSpecificOutput.permissionDecision).toBe("deny");
    const gemini = JSON.parse(
      renderHookResult("pre-tool-use", { kind: "deny", reason: "r" }, "gemini").stdout,
    );
    expect(gemini).toEqual({ decision: "deny", reason: "r" });
  });

  it("prints nothing for noop", () => {
    expect(renderHookResult("stop", { kind: "noop" })).toEqual({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
  });
});

describe("runHook", () => {
  it("is a safe no-op until handlers land", async () => {
    const out = await runHook(
      "session-start",
      "claude",
      stdin({ hook_event_name: "SessionStart" }),
    );
    expect(out).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });

  it("fails open on bad input or mis-wiring", async () => {
    const bad = await runHook("session-start", "claude", Readable.from(["{not json"]));
    expect(bad.exitCode).toBe(0);
    expect(bad.stderr).toMatch(/baton hook session-start/);
    const miswired = await runHook("stop", "claude", stdin({ hook_event_name: "PreCompact" }));
    expect(miswired.exitCode).toBe(0);
    expect(miswired.stderr).toMatch(/wired to "stop"/);
  });
});
