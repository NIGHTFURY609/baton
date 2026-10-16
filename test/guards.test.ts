import { describe, expect, it } from "vitest";
import { globToRegExp, matchesAny } from "../src/core/glob.js";
import { editTargets, isProtectedPath, shellMayWriteProtected } from "../src/hooks/guards.js";

describe("glob", () => {
  it("handles ** at any depth, including zero", () => {
    expect(globToRegExp("src/**/*.ts").test("src/a.ts")).toBe(true);
    expect(globToRegExp("src/**/*.ts").test("src/a/b/c.ts")).toBe(true);
    expect(globToRegExp("**/migrations/**").test("db/migrations/001.sql")).toBe(true);
    expect(globToRegExp("src/*.ts").test("src/a/b.ts")).toBe(false);
  });

  it("normalises Windows separators and ./", () => {
    expect(matchesAny(".\\.context\\STATE.md", [".context/STATE.md"])).toBe(true);
  });
});

describe("guards", () => {
  it("protects generated and append-only state", () => {
    expect(isProtectedPath(".context/STATE.md")).toBe(true);
    expect(isProtectedPath(".context/decisions/0001-x.md")).toBe(true);
    expect(isProtectedPath(".context/tasks.jsonl")).toBe(true);
    expect(isProtectedPath(".context/spec.md")).toBe(false);
  });

  it("extracts edit targets across harnesses", () => {
    expect(editTargets("Edit", { file_path: "/r/.context/STATE.md" })).toEqual([
      "/r/.context/STATE.md",
    ]);
    expect(editTargets("write_file", { file_path: "a.md" })).toEqual(["a.md"]);
    const patch = "*** Begin Patch\n*** Update File: .context/STATE.md\n@@\n*** End Patch";
    expect(editTargets("apply_patch", { input: patch })).toEqual([".context/STATE.md"]);
    expect(editTargets("Read", { file_path: "x" })).toEqual([]);
  });

  it("flags shell writes to protected paths, not reads", () => {
    expect(shellMayWriteProtected("echo hi >> .context/STATE.md")).toBe(true);
    expect(shellMayWriteProtected("sed -i 's/a/b/' .context/decisions/0001-x.md")).toBe(true);
    expect(shellMayWriteProtected("echo '{}' >> .context/tasks.jsonl")).toBe(true);
    expect(shellMayWriteProtected("cat .context/STATE.md")).toBe(false);
    expect(shellMayWriteProtected("echo hi > notes.md")).toBe(false);
  });
});
