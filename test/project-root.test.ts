import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { findContextRoot, resolveProjectRoot } from "../src/core/paths.js";
import { encodeProjectDir } from "../src/core/transcript.js";
import { runHook } from "../src/hooks/dispatch.js";
import { runCli } from "./helpers/cli.js";
import { CONTEXT_FIXTURE, makeRepo, writeFiles } from "./helpers/repo.js";
import { isolateClaudeConfig, toJsonl, toolUse, userPrompt } from "./helpers/transcript.js";

const same = (a: string | null, b: string) => expect(a?.toLowerCase()).toBe(b.toLowerCase());

/**
 * A stand-in for a home folder that is itself a git repo holding a stray
 * `.context/` (this machine's real home is exactly that), with a plain folder
 * under it.
 */
function standInHome(): { home: string; scratch: string } {
  const home = makeRepo();
  const scratch = join(home, "scratch");
  mkdirSync(scratch, { recursive: true });
  return { home, scratch };
}

const SAVED = {
  BATON_HOME: process.env.BATON_HOME,
  CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
};
afterEach(() => {
  for (const [key, value] of Object.entries(SAVED)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("findContextRoot and resolveProjectRoot", () => {
  it("never settles on the home folder, its .context or its git repo", async () => {
    const { home, scratch } = standInHome();
    expect(findContextRoot(scratch, home)).toBeNull();
    same(await resolveProjectRoot(scratch, home), scratch);
  });

  it("finds a project nested under the home folder", async () => {
    const { home } = standInHome();
    const proj = join(home, "work", "proj");
    writeFiles(proj, { ".context/spec.md": "# Spec\n", "src/a.ts": "x\n" });
    same(findContextRoot(join(proj, "src"), home), proj);
    same(await resolveProjectRoot(join(proj, "src"), home), proj);
  });
});

describe("commands under a home folder that is a git repo", () => {
  it("root resolution lands on the working folder, not on home", async () => {
    const { home, scratch } = standInHome();
    process.env.BATON_HOME = home;
    const res = await runCli(["mission"], scratch);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no \.context\/ in .*scratch; run `baton init` first/);
  });

  it("stats does not read the home folder's transcripts", async () => {
    const { home, scratch } = standInHome();
    process.env.BATON_HOME = home;
    const cfg = isolateClaudeConfig();
    const dir = join(cfg, "projects", encodeProjectDir(home));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "home-session.jsonl"),
      toJsonl([userPrompt("hello"), toolUse("t1", "Read", { file_path: "x.md" })]),
    );
    const res = await runCli(["stats", "--format", "json"], scratch);
    expect(res.exitCode).toBe(0);
    expect(JSON.parse(res.stdout).sessions).toHaveLength(0);
  });

  it("task does not create state in the home folder", async () => {
    const { home, scratch } = standInHome();
    process.env.BATON_HOME = home;
    const res = await runCli(["task", "create", "Stray task"], scratch);
    expect(res.exitCode).toBe(0);
    expect(existsSync(join(home, ".context", ".cache"))).toBe(false);
    expect(existsSync(join(home, ".context", "tasks.jsonl"))).toBe(false);
  });
});

describe("hooks under a home folder that is a git repo", () => {
  const stdin = (obj: unknown) => Readable.from([JSON.stringify(obj)]);

  it("do nothing when the only .context/ is the home folder's", async () => {
    const { home, scratch } = standInHome();
    process.env.BATON_HOME = home;
    const state = join(home, ".context", "STATE.md");
    const before = readFileSync(state, "utf8");

    const start = await runHook(
      "session-start",
      "claude",
      stdin({ hook_event_name: "SessionStart", cwd: scratch, source: "startup" }),
    );
    expect(start).toEqual({ stdout: "", stderr: "", exitCode: 0 });

    for (const [event, name] of [
      ["pre-compact", "PreCompact"],
      ["session-end", "SessionEnd"],
    ] as const) {
      const out = await runHook(event, "claude", stdin({ hook_event_name: name, cwd: scratch }));
      expect(out).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    }
    expect(readFileSync(state, "utf8")).toBe(before);
    expect(existsSync(join(home, ".context", ".cache"))).toBe(false);
  });

  it("still serve a project nested under the home folder", async () => {
    const { home } = standInHome();
    process.env.BATON_HOME = home;
    const proj = join(home, "work", "proj");
    writeFiles(proj, CONTEXT_FIXTURE);
    const out = await runHook(
      "session-start",
      "claude",
      stdin({ hook_event_name: "SessionStart", cwd: join(proj, "src"), source: "startup" }),
    );
    expect(out.exitCode).toBe(0);
    expect(JSON.parse(out.stdout).hookSpecificOutput.additionalContext).toContain(
      "baton mission brief",
    );
  });
});
