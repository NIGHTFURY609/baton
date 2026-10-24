import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { runHook } from "../src/hooks/dispatch.js";
import { renderHookResult } from "../src/hooks/io.js";
import { noticedIds, noticeText, TOUCHED_TAIL_BYTES } from "../src/hooks/post-tool-use.js";
import {
  commitAll,
  makeRepo,
  makeTempDir,
  runGit,
  stampFixture,
  writeFiles,
} from "./helpers/repo.js";

const stdin = (o: unknown) => Readable.from([JSON.stringify(o)]);

function stamped(): string {
  const root = makeRepo();
  const sha = commitAll(root, "base");
  stampFixture(root, sha.slice(0, 12));
  commitAll(root, "stamp");
  return root;
}

function edit(root: string, file_path: string, session_id = "s1") {
  return runHook(
    "post-tool-use",
    "claude",
    stdin({
      hook_event_name: "PostToolUse",
      cwd: root,
      session_id,
      tool_name: "Edit",
      tool_input: { file_path },
    }),
  );
}

const logPath = (root: string) => join(root, ".context", ".cache", "touched.jsonl");
const logLines = (root: string) =>
  readFileSync(logPath(root), "utf8")
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l));

const EXPECTED =
  'baton: src/auth/login.ts is in the source_paths of auth ("Authentication", .context/spec.md:3); knowledge-windows ("Windows gotchas", .context/knowledge/windows.md:1). Those sections count as aging until they are re-verified: commit the change, then baton verify-doc <id> records a section as verified at HEAD after review.';

describe("post-tool-use notices", () => {
  it("notices the sections of an edited file, once per session", async () => {
    const root = stamped();
    const file = join(root, "src", "auth", "login.ts");
    const out = await edit(root, file);
    const parsed = JSON.parse(out.stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(parsed.hookSpecificOutput.additionalContext).toBe(EXPECTED);
    const lines = logLines(root);
    expect(lines).toHaveLength(1);
    expect(lines[0].ids).toEqual(["auth", "knowledge-windows"]);

    const again = await edit(root, file);
    expect(again.stdout).toBe("");
    expect(logLines(root)).toHaveLength(1);

    const other = await edit(root, file, "s2");
    expect(JSON.parse(other.stdout).hookSpecificOutput.additionalContext).toBe(EXPECTED);
  });

  it("rules sections too", async () => {
    const root = stamped();
    const out = await edit(root, join(root, "package.json"));
    expect(JSON.parse(out.stdout).hookSpecificOutput.additionalContext).toContain("rules-project");
  });

  it("skips context files, unverified sections and outside paths", async () => {
    const root = stamped();
    expect((await edit(root, join(root, ".context", "spec.md"))).stdout).toBe("");
    expect((await edit(makeRepo(), "src/auth/login.ts")).stdout).toBe("");
    const outside = makeTempDir("baton-outside-");
    expect((await edit(root, join(outside, "x.ts"))).stdout).toBe("");
    const emptyTmp = makeTempDir("baton-empty-");
    runGit(emptyTmp, "init", "-q");
    expect(await edit(emptyTmp, join(emptyTmp, "src", "a.ts"))).toEqual({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    expect(existsSync(logPath(root))).toBe(false);
  });

  it("caps the list", async () => {
    const root = makeRepo();
    const files: Record<string, string> = {};
    for (let i = 1; i <= 6; i++) {
      files[`.context/knowledge/k${i}.md`] =
        `---\nid: k${i}\nkind: knowledge\nverified_at: null\nsource_paths: ["src/**"]\n---\n# Knowledge ${i}\n\nBody.\n`;
    }
    writeFiles(root, files);
    const sha = commitAll(root, "base");
    stampFixture(root, sha.slice(0, 12));
    commitAll(root, "stamp");
    const out = await edit(root, join(root, "src", "auth", "login.ts"));
    expect(JSON.parse(out.stdout).hookSpecificOutput.additionalContext).toContain("; and 3 more");
  });

  it("reads only the log tail", async () => {
    const root = stamped();
    mkdirSync(join(root, ".context", ".cache"), { recursive: true });
    const filler = `${JSON.stringify({ v: 1, ts: "t", session: "other", paths: ["a"], ids: ["x"] })}\n`;
    const noise = filler.repeat(Math.ceil(300_000 / filler.length));
    const mine = `${JSON.stringify({ v: 1, ts: "t", session: "s1", paths: ["a"], ids: ["auth", "knowledge-windows"] })}\n`;
    writeFileSync(logPath(root), noise + mine);
    expect(noise.length).toBeGreaterThan(TOUCHED_TAIL_BYTES);
    const out = await edit(root, join(root, "src", "auth", "login.ts"));
    expect(out.stdout).toBe("");
  });
});

describe("noticedIds", () => {
  it("ignores malformed lines and other sessions", () => {
    const text = [
      JSON.stringify({ v: 1, session: "s1", ids: ["a", "b"] }),
      "not json",
      JSON.stringify({ v: 1, session: "s2", ids: ["c"] }),
      JSON.stringify({ v: 2, session: "s1", ids: ["d"] }),
      JSON.stringify({ v: 1, session: "s1", ids: ["e"] }),
    ].join("\n");
    expect([...noticedIds(text, "s1")].sort()).toEqual(["a", "b", "e"]);
  });
});

describe("noticeText and rendering", () => {
  it("uses are for several paths", () => {
    const text = noticeText(["a.ts", "b.ts"], [{ id: "x", title: "X", file: "f.md", line: 2 }]);
    expect(text).toContain('a.ts, b.ts are in the source_paths of x ("X", f.md:2).');
  });

  it("renders AfterTool for gemini", () => {
    const out = renderHookResult("post-tool-use", { kind: "context", text: "t" }, "gemini");
    expect(JSON.parse(out.stdout).hookSpecificOutput.hookEventName).toBe("AfterTool");
  });
});
