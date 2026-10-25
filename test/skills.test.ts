import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/program.js";
import { REPO_ROOT } from "./helpers/repo.js";

// The `baton` skill belongs to the explain track and is excluded.
const SKILLS = ["checkpoint", "decide", "doc-audit", "handoff", "init-spec"] as const;

function body(skill: string): string {
  return readFileSync(join(REPO_ROOT, "plugin", "skills", skill, "SKILL.md"), "utf8");
}

describe("skill bodies", () => {
  const commands = buildProgram().commands.map((c) => c.name());

  for (const skill of SKILLS) {
    it(`${skill} only names real commands`, () => {
      const names = [...body(skill).matchAll(/`baton ([a-z][a-z-]*)/g)].map((m) => m[1]);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) expect(commands).toContain(name);
    });
  }

  it("init-spec records choices through decide", () => {
    const text = body("init-spec");
    expect(text).toContain("baton decide");
    expect(text).toContain("--status accepted");
    expect(text).not.toContain("exits 3");
  });

  it("checkpoint closes tasks through verify", () => {
    const text = body("checkpoint");
    expect(text).toContain("baton verify");
    expect(text).not.toContain("exits 3");
  });

  it("decide documents preflight, accept and the status line", () => {
    const text = body("decide");
    expect(text).toContain("--preflight");
    expect(text).toContain("--accept");
    expect(text).toContain("status line");
  });
});
