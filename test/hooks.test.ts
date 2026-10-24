import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it } from "vitest";
import { PACKET_HEADER } from "../src/core/budget.js";
import { runHook } from "../src/hooks/dispatch.js";
import { runHookFromArgv } from "../src/hooks/entry.js";
import { isFastHookArgv, renderHookResult } from "../src/hooks/io.js";
import { commitAll, makeRepo, makeTempDir, runGit, stampFixture } from "./helpers/repo.js";
import { isolateClaudeConfig, toJsonl, toolUse } from "./helpers/transcript.js";

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

function emptyTmp(): string {
  const dir = makeTempDir();
  runGit(dir, "init", "-q");
  return dir;
}

function stampedRepo(): string {
  const root = makeRepo();
  stampFixture(root, commitAll(root, "base").slice(0, 12));
  commitAll(root, "stamp");
  return root;
}

const stateOf = (root: string) => readFileSync(join(root, ".context", "STATE.md"), "utf8");

describe("runHook", () => {
  beforeEach(() => {
    isolateClaudeConfig();
    process.env.BATON_ACTOR = "tester";
  });

  it("is a no-op without .context/", async () => {
    const tmp = emptyTmp();
    for (const [event, native] of [
      ["session-start", "SessionStart"],
      ["pre-compact", "PreCompact"],
      ["session-end", "SessionEnd"],
    ] as const) {
      const out = await runHook(event, "claude", stdin({ hook_event_name: native, cwd: tmp }));
      expect(out).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    }
    expect(existsSync(join(tmp, ".context"))).toBe(false);
  });

  it("injects the packet at session start", async () => {
    const root = stampedRepo();
    const out = await runHook(
      "session-start",
      "claude",
      stdin({ hook_event_name: "SessionStart", cwd: root, source: "startup" }),
    );
    expect(out.exitCode).toBe(0);
    expect(out.stderr).toBe("");
    const parsed = JSON.parse(out.stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
    const text = parsed.hookSpecificOutput.additionalContext as string;
    expect(text.startsWith(PACKET_HEADER)).toBe(true);
    expect(text.length).toBeLessThanOrEqual(9000);
    expect(existsSync(join(root, ".context", ".cache", "last-packet.txt"))).toBe(true);
  });

  it("re-injects after compaction", async () => {
    const root = stampedRepo();
    const out = await runHook(
      "session-start",
      "claude",
      stdin({ hook_event_name: "SessionStart", cwd: root, source: "compact" }),
    );
    const parsed = JSON.parse(out.stdout);
    expect(parsed.hookSpecificOutput.additionalContext.startsWith(PACKET_HEADER)).toBe(true);
  });

  it("pre-compact writes STATE.md", async () => {
    const root = stampedRepo();
    const transcript = join(makeTempDir(), "session.jsonl");
    writeFileSync(
      transcript,
      toJsonl([toolUse("u1", "Edit", { file_path: join(root, "src", "auth", "login.ts") })]),
    );
    const out = await runHook(
      "pre-compact",
      "claude",
      stdin({
        hook_event_name: "PreCompact",
        cwd: root,
        trigger: "auto",
        transcript_path: transcript,
      }),
    );
    expect(out).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    const state = stateOf(root);
    expect(state).toContain('reason: "pre-compact"');
    expect(state).toContain("- Edit src/auth/login.ts");
  });

  it("session-end records its reason", async () => {
    const root = stampedRepo();
    const out = await runHook(
      "session-end",
      "claude",
      stdin({ hook_event_name: "SessionEnd", cwd: root, reason: "logout" }),
    );
    expect(out).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(stateOf(root)).toContain('reason: "session-end:logout"');
  });

  it("fails open on bad input or mis-wiring", async () => {
    const bad = await runHook("session-start", "claude", Readable.from(["{not json"]));
    expect(bad.exitCode).toBe(0);
    expect(bad.stderr).toMatch(/baton hook session-start/);
    const miswired = await runHook("stop", "claude", stdin({ hook_event_name: "PreCompact" }));
    expect(miswired.exitCode).toBe(0);
    expect(miswired.stderr).toMatch(/wired to "stop"/);
  });

  it("fails open on invalid config", async () => {
    const root = stampedRepo();
    writeFileSync(join(root, ".context", "config.yaml"), "packet: [\n");
    const out = await runHook(
      "session-start",
      "claude",
      stdin({ hook_event_name: "SessionStart", cwd: root, source: "startup" }),
    );
    expect(out.stdout).toBe("");
    expect(out.exitCode).toBe(0);
    expect(out.stderr.startsWith("baton hook session-start:")).toBe(true);
  });

  it("degrades on a broken spec", async () => {
    const root = stampedRepo();
    writeFileSync(
      join(root, ".context", "spec.md"),
      "# Spec\n\n## One\n<!-- baton: {id: auth, kind: intent, verified_at: null, source_paths: []} -->\n\nA.\n\n## Two\n<!-- baton: {id: auth, kind: intent, verified_at: null, source_paths: []} -->\n\nB.\n",
    );
    const out = await runHook(
      "session-start",
      "claude",
      stdin({ hook_event_name: "SessionStart", cwd: root, source: "startup" }),
    );
    expect(out.exitCode).toBe(0);
    expect(JSON.parse(out.stdout).hookSpecificOutput.additionalContext).toContain(
      "Problems in .context/",
    );
  });

  it("strips a BOM", async () => {
    const tmp = emptyTmp();
    const out = await runHook(
      "session-start",
      "claude",
      Readable.from(["\uFEFF" + JSON.stringify({ hook_event_name: "SessionStart", cwd: tmp })]),
    );
    expect(out.stderr).toBe("");
    expect(out.exitCode).toBe(0);
  });
});

describe("isFastHookArgv", () => {
  it("accepts an event, with or without options", () => {
    expect(isFastHookArgv(["session-start"])).toBe(true);
    expect(isFastHookArgv(["pre-tool-use", "--harness", "codex"])).toBe(true);
  });

  it("rejects help, unknown events and no arguments", () => {
    expect(isFastHookArgv(["--help"])).toBe(false);
    expect(isFastHookArgv(["session-start", "-h"])).toBe(false);
    expect(isFastHookArgv(["bogus"])).toBe(false);
    expect(isFastHookArgv([])).toBe(false);
  });
});

describe("runHookFromArgv", () => {
  const io = (input: unknown) => {
    const out = { stdout: "", stderr: "" };
    return {
      out,
      io: {
        stdin: stdin(input),
        stdout: { write: (s: string) => (out.stdout += s) },
        stderr: { write: (s: string) => (out.stderr += s) },
      },
    };
  };

  it("runs a no-op event", async () => {
    const { out, io: h } = io({});
    expect(await runHookFromArgv(["pre-tool-use"], h)).toBe(0);
    expect(out.stdout).toBe("");
  });

  it("accepts --harness=<h>", async () => {
    const { io: h } = io({ hook_event_name: "SessionStart", cwd: emptyTmp() });
    expect(await runHookFromArgv(["session-start", "--harness=gemini"], h)).toBe(0);
  });

  it("fails open on an unknown harness", async () => {
    const { out, io: h } = io({});
    expect(await runHookFromArgv(["session-start", "--harness", "vim"], h)).toBe(0);
    expect(out.stderr).toContain('unknown harness "vim"');
  });
});
