import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { firstDifference, planCompile } from "../src/core/compile.js";
import { renderAgentsMd, scaffold } from "../src/core/init.js";
import { TEMPLATES } from "../src/core/templates.generated.js";
import { runCli } from "./helpers/cli.js";
import { CONTEXT_FIXTURE, makeRepo, makeTempDir, runGit } from "./helpers/repo.js";

const rulesPath = (root: string): string => join(root, ".context", "rules.md");
const read = (root: string, file: string): string => readFileSync(join(root, file), "utf8");

describe("planCompile", () => {
  it("compiles the fixture rules", async () => {
    const root = makeRepo();
    const { files } = await planCompile(root);
    const agents = files.find((f) => f.path === "AGENTS.md");
    const claude = files.find((f) => f.path === "CLAUDE.md");
    expect(agents?.action).toBe("create");
    expect(agents?.next).toBe(
      renderAgentsMd(TEMPLATES["AGENTS.md"] as string, CONTEXT_FIXTURE[".context/rules.md"]),
    );
    expect(agents?.next).toContain("## Project rules\n\n- Tests run with `npm test`.");
    expect(agents?.next).toContain("## Continuity");
    expect(agents?.next).not.toContain("<!-- baton:");
    expect(agents?.next).not.toContain("{rules from .context/rules.md}");
    expect(claude?.action).toBe("create");
    expect(claude?.next).toBe("@AGENTS.md\n");
  });
});

describe("compile command", () => {
  it("writes, then is idempotent", async () => {
    const root = makeRepo();
    const first = await runCli(["compile"], root);
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toBe("wrote AGENTS.md\ncreated CLAUDE.md\n");
    const second = await runCli(["compile"], root);
    expect(second.stdout).toBe("AGENTS.md unchanged\nCLAUDE.md unchanged\n");
    const check = await runCli(["compile", "--check"], root);
    expect(check.exitCode).toBe(0);
    expect(check.stdout).toContain("AGENTS.md and CLAUDE.md are up to date");
  });

  it("--check finds drift and writes nothing", async () => {
    const root = makeRepo();
    await runCli(["compile"], root);
    const before = read(root, "AGENTS.md");
    appendFileSync(rulesPath(root), "- New rule.\n");
    const check = await runCli(["compile", "--check"], root);
    expect(check.exitCode).toBe(2);
    expect(check.stderr).toContain(
      "AGENTS.md is out of date with .context/rules.md (first difference at line",
    );
    expect(check.stderr).toContain("run baton compile");
    expect(read(root, "AGENTS.md")).toBe(before);
  });

  it("ignores BOM and CRLF", async () => {
    const root = makeRepo();
    await runCli(["compile"], root);
    const text = read(root, "AGENTS.md");
    const odd = `﻿${text.replace(/\n/g, "\r\n")}`;
    writeFileSync(join(root, "AGENTS.md"), odd);
    const check = await runCli(["compile", "--check"], root);
    expect(check.exitCode).toBe(0);
    const run = await runCli(["compile"], root);
    expect(run.stdout).toContain("AGENTS.md unchanged");
    expect(read(root, "AGENTS.md")).toBe(odd);
  });

  it("keeps other CLAUDE.md content", async () => {
    const root = makeRepo({ ...CONTEXT_FIXTURE, "CLAUDE.md": "# notes\n" });
    const check = await runCli(["compile", "--check"], root);
    expect(check.exitCode).toBe(2);
    expect(check.stderr).toContain("CLAUDE.md does not import AGENTS.md");
    const run = await runCli(["compile"], root);
    expect(run.stdout).toContain("added @AGENTS.md to CLAUDE.md");
    expect(read(root, "CLAUDE.md")).toBe("# notes\n@AGENTS.md\n");
  });

  it("refuses more than 60 lines", async () => {
    const bullets = Array.from({ length: 60 }, (_, i) => `- Rule ${i}.`).join("\n");
    const root = makeRepo({
      ...CONTEXT_FIXTURE,
      ".context/rules.md": `# Rules\n\n## Project rules\n<!-- baton: {id: rules-project, kind: rule, verified_at: null, source_paths: [package.json]} -->\n\n${bullets}\n`,
    });
    for (const args of [["compile"], ["compile", "--check"]]) {
      const r = await runCli(args, root);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain("max 60, ADR 0006");
    }
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
  });

  it("warns on unmarked headings", async () => {
    const root = makeRepo();
    appendFileSync(rulesPath(root), "\n## Unmarked\n\nText.\n");
    const r = await runCli(["compile"], root);
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("note: .context/rules.md:");
    expect(r.stderr).toContain('heading "Unmarked" has no baton marker');
    expect(read(root, "AGENTS.md")).not.toContain("Text.");
  });

  it("a broken marker exits 1", async () => {
    const root = makeRepo({
      ...CONTEXT_FIXTURE,
      ".context/rules.md":
        "# Rules\n\n## Project rules\n<!-- baton: {id: rules-project, kind: vibes, verified_at: null, source_paths: []} -->\n\n- x\n",
    });
    const r = await runCli(["compile"], root);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain(".context/rules.md:");
  });

  it("refuses to replace a hand-written AGENTS.md without --force", async () => {
    const root = makeRepo({ ...CONTEXT_FIXTURE, "AGENTS.md": "# My agent rules\n\n- Be nice.\n" });
    const run = await runCli(["compile"], root);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain(
      "AGENTS.md is hand-written; move its rules into .context/rules.md sections, then run baton compile --force",
    );
    expect(read(root, "AGENTS.md")).toBe("# My agent rules\n\n- Be nice.\n");
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
    const check = await runCli(["compile", "--check"], root);
    expect(check.exitCode).toBe(2);
    expect(check.stderr).toContain("AGENTS.md is hand-written");
    expect(check.stderr).not.toContain("out of date with .context/rules.md");
    const forced = await runCli(["compile", "--force"], root);
    expect(forced.exitCode).toBe(0);
    expect(forced.stdout).toContain("wrote AGENTS.md");
    expect(read(root, "AGENTS.md").startsWith("<!-- Generated by `baton compile`")).toBe(true);
  });

  it("a generated AGENTS.md with a BOM still counts as generated", async () => {
    const root = makeRepo();
    await runCli(["compile"], root);
    writeFileSync(join(root, "AGENTS.md"), `﻿${read(root, "AGENTS.md")}- stale\n`);
    const run = await runCli(["compile"], root);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("wrote AGENTS.md");
  });

  it("init and compile agree", async () => {
    const dir = makeTempDir();
    runGit(dir, "init", "-q");
    await scaffold(dir, { force: false });
    const r = await runCli(["compile", "--check"], dir);
    expect(r.exitCode).toBe(0);
  });

  it("needs .context/", async () => {
    const dir = makeTempDir();
    runGit(dir, "init", "-q");
    const r = await runCli(["compile"], dir);
    expect(r.exitCode).toBe(1);
  });
});

describe("firstDifference", () => {
  it("finds the first differing line", () => {
    expect(firstDifference("a\nb\n", "a\nc\n")).toBe(2);
    expect(firstDifference("a\n", "a\nb\n")).toBe(2);
    expect(firstDifference("a\r\n", "a\n")).toBeNull();
  });
});
