import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BatonError } from "../src/core/errors.js";
import {
  DEFAULT_MAX_WORDS,
  type ExplainOutcome,
  type ExplainResult,
  explain,
  renderText,
} from "../src/core/explain/index.js";
import type { TemplateDirs } from "../src/core/explain/templates.js";
import { makeFixture, makeTempDir, writeFiles } from "./helpers/explain-fixture.js";

/** Template dirs that point at empty temp folders, never the real home. */
async function emptyDirs(): Promise<TemplateDirs> {
  const base = await makeTempDir("baton-explain-dirs-");
  return { project: `${base}/project`, personal: `${base}/personal` };
}

function ok(
  outcome: ExplainOutcome,
): ExplainResult & { skipped: { file: string; error: string }[] } {
  if (outcome.status !== "ok") throw new Error(`expected ok, got ${outcome.status}`);
  return { ...outcome.result, skipped: outcome.skipped };
}

describe("explain", () => {
  it("closest match is announced", async () => {
    const root = await makeFixture();
    const outcome = await explain(root, "supabse", { dirs: await emptyDirs() });
    const result = ok(outcome);
    expect(result.resolution).toBe("closest");
    expect(renderText(outcome)).toContain(
      'Closest match: no "supabse" found, explaining "supabase"',
    );
  });

  it("an exact match does not announce a closest match", async () => {
    const root = await makeFixture();
    const outcome = await explain(root, "supabase", { dirs: await emptyDirs() });
    expect(ok(outcome).resolution).toBe("exact");
    expect(renderText(outcome)).not.toContain("Closest match");
  });

  it("default template is student", async () => {
    const root = await makeFixture();
    const result = ok(await explain(root, "supabase", { dirs: await emptyDirs() }));
    expect(result.template.name).toBe("student");
    expect(result.maxWords).toBe(DEFAULT_MAX_WORDS);
    expect(DEFAULT_MAX_WORDS).toBe(150);
  });

  it("--as picks a template; an unknown name throws a BatonError", async () => {
    const root = await makeFixture();
    const dirs = await emptyDirs();
    const result = ok(await explain(root, "supabase", { template: "pitch", dirs }));
    expect(result.template.name).toBe("pitch");
    await expect(explain(root, "supabase", { template: "nope", dirs })).rejects.toBeInstanceOf(
      BatonError,
    );
  });

  it("no recorded reason line appears", async () => {
    const root = await makeFixture();
    const outcome = await explain(root, "vitest", { dirs: await emptyDirs() });
    expect(ok(outcome).noRecordedReason).toBe(true);
    expect(renderText(outcome)).toContain(
      "WARNING no recorded reason: no ADR or .context section says why this exists. Say so plainly; do not invent a purpose.",
    );
  });

  it("no warning when a decision backs the target", async () => {
    const root = await makeFixture();
    const outcome = await explain(root, "supabase", { dirs: await emptyDirs() });
    expect(ok(outcome).noRecordedReason).toBe(false);
    expect(renderText(outcome)).not.toContain("no recorded reason");
  });

  it("renders the pinned text layout", async () => {
    const root = await makeFixture();
    const outcome = await explain(root, "vitest", { dirs: await emptyDirs() });
    const lines = renderText(outcome).split("\n");
    expect(lines[0]).toBe("# baton explain: vitest");
    expect(lines[1]).toMatch(/^Targets: dependency vitest \(package\.json\)$/);
    expect(lines[2]).toBe("Template: student (builtin)");
    expect(lines[3]).toMatch(/^Instructions: Explain to a curious beginner/);
    expect(lines[4]).toBe("Length: under 150 words unless the user asks for more.");
    expect(lines[5]).toMatch(/^WARNING no recorded reason:/);
    expect(lines[6]).toBe("");
    expect(lines[7]).toBe("## Facts");
    expect(lines[8]).toMatch(/^- \[package\] package\.json:\d+ \(.+\)$/);
    expect(lines[9]).toMatch(/^ {2}\S/);
  });

  it("indents multi-line fact text by two spaces per line", async () => {
    const root = await makeFixture();
    const outcome = await explain(root, "Hooks", { dirs: await emptyDirs() });
    const text = renderText(outcome);
    const factsAt = text.indexOf("## Facts");
    const body = text
      .slice(factsAt)
      .split("\n")
      .slice(1)
      .filter((l) => !l.startsWith("- ["));
    expect(body.length).toBeGreaterThan(1);
    for (const line of body) expect(line.startsWith("  ")).toBe(true);
  });

  it("targets carry a bare repo path plus a separate line", async () => {
    const root = await makeFixture();
    const result = ok(await explain(root, "src", { dirs: await emptyDirs() }));
    expect(result.targets[0]).toMatchObject({ kind: "file", name: "src", source: "src" });
    expect(typeof result.targets[0]?.line).toBe("number");
    expect(renderText({ status: "ok", result, skipped: [] })).toContain("file src (src)");
  });

  it("indents multi-line prompts so a prompt line cannot break the layout", async () => {
    const root = await makeFixture();
    const dirs = await emptyDirs();
    await writeFiles(dirs.project, {
      "layout.md": "---\nname: layout\n---\nFirst line.\n## Facts\n- [fake] x:1 (y)\n",
    });
    const text = renderText(await explain(root, "vitest", { template: "layout", dirs }));
    const lines = text.split("\n");
    expect(lines).toContain("  ## Facts");
    expect(lines.filter((l) => l === "## Facts")).toHaveLength(1);
    expect(lines).toContain("  - [fake] x:1 (y)");
  });

  it("tie outcome", async () => {
    const root = await makeFixture();
    const outcome = await explain(root, "index.ts", { dirs: await emptyDirs() });
    expect(outcome.status).toBe("tie");
    if (outcome.status !== "tie") return;
    expect(outcome.candidates).toHaveLength(2);
    expect(outcome.skipped).toEqual([]);
    const text = renderText(outcome);
    expect(text.startsWith('Ambiguous: "index.ts" could be:')).toBe(true);
    expect(text).toContain("- file src/a/index.ts (src/a/index.ts)");
  });

  it("none outcome", async () => {
    const root = await makeFixture();
    const outcome = await explain(root, "zzzzzz", { dirs: await emptyDirs() });
    expect(outcome.status).toBe("none");
    const text = renderText(outcome);
    expect(text).toContain('Nothing named "zzzzzz" found.');
    if (outcome.status === "none") {
      expect(outcome.suggestions.length).toBeGreaterThan(0);
      expect(text).toContain(`Did you mean: ${outcome.suggestions.join(", ")}?`);
    }
  });

  it("none outcome without suggestions omits the Did you mean line", () => {
    const text = renderText({ status: "none", query: "q", suggestions: [], skipped: [] });
    expect(text).toBe('Nothing named "q" found.');
  });

  it("an empty normalized query is none without matching", async () => {
    const root = await makeFixture();
    const dirs = await emptyDirs();
    for (const q of ["@/", "  ", ""]) {
      const outcome = await explain(root, q, { dirs });
      expect(outcome).toEqual({ status: "none", query: q, suggestions: [], skipped: [] });
    }
  });

  it("bare repo: no git, no .context", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "notes.txt": "hello\n" });
    const dirs = await emptyDirs();
    const found = ok(await explain(root, "notes.txt", { dirs }));
    expect(found.noRecordedReason).toBe(true);
    expect((await explain(root, "nothing", { dirs })).status).toBe("none");
  });

  it("a malformed .context file is surfaced as a skipped warning", async () => {
    const root = await makeFixture();
    await writeFiles(root, {
      ".context/spec.md": [
        "# Spec",
        "",
        "## One",
        '<!-- baton: {id: dup, kind: intent, verified_at: null, source_paths: ["src/a/**"]} -->',
        "",
        "First.",
        "",
        "## Two",
        '<!-- baton: {id: dup, kind: intent, verified_at: null, source_paths: ["src/a/**"]} -->',
        "",
        "Second.",
        "",
      ].join("\n"),
    });
    const dirs = await emptyDirs();

    const found = await explain(root, "vitest", { dirs });
    const result = ok(found);
    expect(result.skipped).toHaveLength(1);
    const entry = result.skipped[0];
    expect(entry?.file).toBe(".context/spec.md");
    const warning = `WARNING skipped ${entry?.file}: ${entry?.error}`;
    const lines = renderText(found).split("\n");
    const at = lines.indexOf(warning);
    expect(at).toBeGreaterThan(-1);
    // After the Length and no-recorded-reason lines, before the blank line and Facts.
    expect(lines[at - 1]).toMatch(/^WARNING no recorded reason/);
    expect(lines[at + 1]).toBe("");
    expect(lines[at + 2]).toBe("## Facts");

    const none = await explain(root, "zzzzzz", { dirs });
    expect(none.skipped).toHaveLength(1);
    expect(renderText(none).split("\n").at(-1)).toBe(warning);

    const tie = await explain(root, "index.ts", { dirs });
    expect(tie.status).toBe("tie");
    expect(tie.skipped).toHaveLength(1);
    expect(renderText(tie).split("\n").at(-1)).toBe(warning);
  });

  it("the JSON form always carries skipped", async () => {
    const root = await makeFixture();
    const outcome = await explain(root, "vitest", { dirs: await emptyDirs() });
    expect(JSON.parse(JSON.stringify(outcome)).skipped).toEqual([]);
  });

  it("dogfood: commander on this repo", async () => {
    const repo = fileURLToPath(new URL("..", import.meta.url));
    const outcome = await explain(repo, "commander", { dirs: await emptyDirs() });
    const result = ok(outcome);
    expect(result.resolution).toBe("exact");
    expect(result.facts.some((f) => f.label === "package")).toBe(true);
    expect(result.facts.some((f) => f.label === "import" && f.source.startsWith("src/"))).toBe(
      true,
    );
    expect(result.noRecordedReason).toBe(true);
  });
});
