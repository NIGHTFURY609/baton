import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ensureLines,
  GITATTRIBUTES_LINES,
  GITIGNORE_LINES,
  parseHarnesses,
  RULES_PLACEHOLDER,
  renderAgentsMd,
  scaffold,
} from "../src/core/init.js";
import { loadSectionIndex } from "../src/core/sections.js";
import { TEMPLATES } from "../src/core/templates.generated.js";
import { runCli } from "./helpers/cli.js";
import { makeTempDir, runGit } from "./helpers/repo.js";

function freshDir(): string {
  const dir = makeTempDir();
  runGit(dir, "init", "-q");
  return dir;
}

const PATHS = [
  ".context/config.yaml",
  ".context/rules.md",
  ".context/spec.md",
  ".context/STATE.md",
  ".context/decisions/0000-template.md",
  ".context/knowledge/README.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".gitattributes",
  ".gitignore",
];

describe("renderAgentsMd", () => {
  const out = renderAgentsMd(
    TEMPLATES["AGENTS.md"] as string,
    TEMPLATES["context/rules.md"] as string,
  );

  it("renders the rules sections in place of the placeholder", () => {
    expect(out).toContain("## Project rules\n\n- How to build, test and lint, in one line each.");
    expect(out).toContain("## Continuity rules");
  });

  it("drops the placeholder and the section markers", () => {
    expect(out).not.toContain(RULES_PLACEHOLDER);
    expect(out).not.toContain("<!-- baton:");
  });

  it("keeps the template's own Continuity section", () => {
    expect(out).toContain("## Continuity\n\n- A brief of current state");
  });

  it("uses a stub when rules.md has no sections", () => {
    const stub = renderAgentsMd(`a\n  ${RULES_PLACEHOLDER}  \nb\n`, "# Rules\n");
    expect(stub).toBe("a\n_No rules yet: edit .context/rules.md._\nb\n");
  });

  it("returns the template unchanged without a placeholder", () => {
    expect(renderAgentsMd("# x\n", TEMPLATES["context/rules.md"] as string)).toBe("# x\n");
  });
});

describe("ensureLines", () => {
  it("creates text for a missing file", () => {
    expect(ensureLines(null, GITIGNORE_LINES)).toEqual({
      text: ".context/.cache/\n",
      added: [".context/.cache/"],
    });
  });

  it("appends to an existing file", () => {
    const r = ensureLines("node_modules/\n", GITIGNORE_LINES);
    expect(r.text).toBe("node_modules/\n.context/.cache/\n");
    expect(r.added).toHaveLength(1);
  });

  it("adds a newline when the file has no final one", () => {
    expect(ensureLines("node_modules/", GITIGNORE_LINES).text).toBe(
      "node_modules/\n.context/.cache/\n",
    );
  });

  it("follows CRLF files", () => {
    expect(ensureLines("* text=auto\r\n", GITATTRIBUTES_LINES).text).toBe(
      "* text=auto\r\n.context/tasks.jsonl merge=union\r\n.context/memories.jsonl merge=union\r\n",
    );
  });

  it("leaves text that already has the lines", () => {
    const text = `${GITATTRIBUTES_LINES.join("\n")}\n`;
    expect(ensureLines(text, GITATTRIBUTES_LINES)).toEqual({ text, added: [] });
  });
});

describe("parseHarnesses", () => {
  it("parses names", () => {
    expect(parseHarnesses("claude")).toEqual(["claude"]);
    expect(parseHarnesses("all")).toHaveLength(3);
    expect(parseHarnesses("Claude, codex")).toEqual(["claude", "codex"]);
    expect(parseHarnesses("claude,claude")).toEqual(["claude"]);
  });

  it("rejects an unknown harness with exit 1", () => {
    expect(() => parseHarnesses("vim")).toThrowError(
      expect.objectContaining({
        message: 'unknown harness "vim" (claude, codex, gemini or all)',
        exitCode: 1,
      }),
    );
  });
});

describe("scaffold", () => {
  it("scaffolds an empty project", async () => {
    const dir = freshDir();
    const actions = await scaffold(dir, { force: false });
    expect(actions.map((a) => [a.action, a.path])).toEqual(PATHS.map((p) => ["create", p]));
    expect(readFileSync(join(dir, ".context/spec.md"), "utf8")).toBe(TEMPLATES["context/spec.md"]);
    const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(agents).toContain("## Continuity rules");
    expect(agents).not.toContain(RULES_PLACEHOLDER);
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe(TEMPLATES["CLAUDE.md"]);
    const index = await loadSectionIndex(dir);
    expect(index.sections.map((s) => s.meta.id)).toEqual([
      "rules-project",
      "rules-continuity",
      "purpose",
      "scope",
      "state",
    ]);
  });

  it("is idempotent", async () => {
    const dir = freshDir();
    await scaffold(dir, { force: false });
    const again = await scaffold(dir, { force: false });
    expect(again.map((a) => a.action)).toEqual(PATHS.map(() => "skip"));
    expect(again.find((a) => a.path === ".gitattributes")?.note).toBe("already present");
    expect(again.find((a) => a.path === ".gitignore")?.note).toBe("already present");
    expect(again.find((a) => a.path === ".context/spec.md")?.note).toBe(
      "exists; --force overwrites",
    );
  });

  it("keeps user files unless --force", async () => {
    const dir = freshDir();
    await scaffold(dir, { force: false });
    const spec = join(dir, ".context/spec.md");
    writeFileSync(spec, "# Mine\n");
    await scaffold(dir, { force: false });
    expect(readFileSync(spec, "utf8")).toBe("# Mine\n");
    const forced = await scaffold(dir, { force: true });
    expect(forced.find((a) => a.path === ".context/spec.md")?.action).toBe("overwrite");
    expect(readFileSync(spec, "utf8")).toBe(TEMPLATES["context/spec.md"]);
    // additive files are never overwritten, even with force
    expect(forced.find((a) => a.path === ".gitignore")?.action).toBe("skip");
  });

  it("notes a CLAUDE.md without the import", async () => {
    const dir = freshDir();
    writeFileSync(join(dir, "CLAUDE.md"), "# notes\n");
    const actions = await scaffold(dir, { force: false });
    const claude = actions.find((a) => a.path === "CLAUDE.md");
    expect(claude?.action).toBe("skip");
    expect(claude?.note).toBe(
      "exists without @AGENTS.md; add that line so Claude Code loads AGENTS.md (ADR 0006)",
    );
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe("# notes\n");
  });

  it("does not warn when CLAUDE.md already imports AGENTS.md", async () => {
    const dir = freshDir();
    writeFileSync(join(dir, "CLAUDE.md"), "# notes\n\n@AGENTS.md\n");
    const actions = await scaffold(dir, { force: false });
    expect(actions.find((a) => a.path === "CLAUDE.md")?.note).toBe("exists; --force overwrites");
  });

  it("appends to an existing CRLF .gitattributes", async () => {
    const dir = freshDir();
    writeFileSync(join(dir, ".gitattributes"), "* text=auto\r\n");
    const actions = await scaffold(dir, { force: false });
    const attr = actions.find((a) => a.path === ".gitattributes");
    expect(attr).toEqual({ path: ".gitattributes", action: "append", note: "2 line(s)" });
    expect(readFileSync(join(dir, ".gitattributes"), "utf8")).toBe(
      "* text=auto\r\n.context/tasks.jsonl merge=union\r\n.context/memories.jsonl merge=union\r\n",
    );
    expect(actions.find((a) => a.path === ".gitignore")?.note).toBe("1 line(s)");
  });
});

describe("command", () => {
  it("scaffolds and prints actions and the hooks line", async () => {
    const dir = freshDir();
    const r = await runCli(["init"], dir);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("create .context/spec.md");
    expect(r.stdout).toContain("hooks: Claude Code hooks ship");
    expect(existsSync(join(dir, ".context/spec.md"))).toBe(true);
  });

  it("--no-hooks omits the hooks line", async () => {
    const dir = freshDir();
    const r = await runCli(["init", "--no-hooks"], dir);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain("hooks:");
  });

  it("--harness codex exits 3 before writing anything", async () => {
    const dir = freshDir();
    const r = await runCli(["init", "--harness", "codex"], dir);
    expect(r.exitCode).toBe(3);
    expect(existsSync(join(dir, ".context"))).toBe(false);
  });

  it("--harness vim exits 1", async () => {
    const dir = freshDir();
    const r = await runCli(["init", "--harness", "vim"], dir);
    expect(r.exitCode).toBe(1);
    expect(existsSync(join(dir, ".context"))).toBe(false);
  });
});
