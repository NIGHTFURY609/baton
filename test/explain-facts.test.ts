import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/core/config.js";
import {
  collectFacts,
  FACT_TEXT_MAX,
  type Fact,
  MAX_FACTS,
  MAX_LISTED,
} from "../src/core/explain/facts.js";
import { buildIndex, type RepoIndex, type Target } from "../src/core/explain/targets.js";
import { makeFixture, writeFiles } from "./helpers/explain-fixture.js";

function pick(index: RepoIndex, kind: Target["kind"], name: string): Target {
  const t = index.targets.find((x) => x.kind === kind && x.name === name);
  if (!t) throw new Error(`no ${kind} target ${name}`);
  return t;
}

const labels = (facts: Fact[]) => [...new Set(facts.map((f) => f.label))];

describe("collectFacts", () => {
  it("dependency with an ADR has a reason", async () => {
    const index = await buildIndex(await makeFixture());
    const { facts, noRecordedReason } = await collectFacts(
      index,
      [pick(index, "dependency", "supabase")],
      defaultConfig(),
    );
    expect(labels(facts)).toEqual(expect.arrayContaining(["package", "decision"]));
    expect(noRecordedReason).toBe(false);
    const pkg = facts.find((f) => f.label === "package");
    expect(pkg?.source).toBe("package.json:4");
    expect(pkg?.text).toContain('"supabase"');
  });

  it("dependency without one is flagged", async () => {
    const index = await buildIndex(await makeFixture());
    const { facts, noRecordedReason } = await collectFacts(
      index,
      [pick(index, "dependency", "vitest")],
      defaultConfig(),
    );
    expect(noRecordedReason).toBe(true);
    expect(labels(facts)).toEqual(["package"]);
  });

  it("import facts come from source files", async () => {
    const root = await makeFixture();
    await writeFiles(root, {
      "src/db.ts": 'import { createClient } from "supabase/client";\n',
      "src/other.ts": 'import x from "supabase-extras";\nconst y = 1;\n',
      "src/cjs.js": "const s = require('supabase');\n",
      "notes.md": 'import x from "supabase"\n',
    });
    const index = await buildIndex(root);
    const { facts } = await collectFacts(
      index,
      [pick(index, "dependency", "supabase")],
      defaultConfig(),
    );
    const imports = facts.filter((f) => f.label === "import").map((f) => f.source);
    expect(imports).toContain("src/db.ts:1");
    expect(imports).toContain("src/cjs.js:1");
    expect(imports).not.toContain("src/other.ts:1");
    expect(imports.some((s) => s.startsWith("notes.md"))).toBe(false);
    expect(facts.find((f) => f.source === "src/db.ts:1")?.text).toBe(
      'import { createClient } from "supabase/client";',
    );
  });

  it("section target counts as its own reason", async () => {
    const index = await buildIndex(await makeFixture());
    const { facts, noRecordedReason } = await collectFacts(
      index,
      [pick(index, "section", "Authentication")],
      defaultConfig(),
    );
    const own = facts.find((f) => f.label === "section");
    expect(own?.provenance).toBe("unverified");
    expect(own?.text).toContain("passkeys");
    expect(facts.some((f) => f.label === "decision")).toBe(true); // adr-0001 cites auth
    expect(facts.find((f) => f.label === "source")?.text).toContain("src/a/index.ts");
    expect(noRecordedReason).toBe(false);
  });

  it("file target finds layout lines and sections via sourcePaths", async () => {
    const root = await makeFixture();
    await writeFiles(root, {
      "docs/layout.md": [
        "# Layout",
        "",
        "```",
        "src/",
        "  a/        # auth code",
        "  b/",
        "```",
        "",
        "```mermaid",
        "flowchart LR",
        "  a/ --> b",
        "```",
        "",
      ].join("\n"),
    });
    const index = await buildIndex(root);
    const { facts } = await collectFacts(index, [pick(index, "file", "src/a")], defaultConfig());
    const layout = facts.filter((f) => f.label === "layout");
    expect(layout.map((f) => f.source)).toEqual(["docs/layout.md:5"]);
    expect(layout[0]?.text).toBe("a/        # auth code");
    // src/a/** is a source path of `auth` and adr-0001, so a directory counts as mentioned.
    expect(labels(facts)).toEqual(expect.arrayContaining(["section", "decision"]));
  });

  it("heading and mermaid targets", async () => {
    const index = await buildIndex(await makeFixture());
    const heading = await collectFacts(index, [pick(index, "heading", "Hooks")], defaultConfig());
    expect(heading.facts.find((f) => f.label === "doc")?.text).toContain("Hooks fail open.");
    expect(heading.noRecordedReason).toBe(true);

    const node = await collectFacts(
      index,
      [pick(index, "mermaid", "Mission packet")],
      defaultConfig(),
    );
    expect(node.facts.find((f) => f.label === "diagram")?.text).toBe(
      "Mission packet: in ← Session start; out → STATE.md",
    );
    // The fence sits under `## Hooks`.
    expect(node.facts.find((f) => f.label === "doc")?.text).toContain("Hooks fail open.");
  });

  it("matches mentions case-insensitively on whole tokens only", async () => {
    const root = await makeFixture();
    await writeFiles(root, {
      ".context/knowledge/notes.md": [
        "---",
        "id: notes",
        "kind: knowledge",
        "verified_at: null",
        "source_paths: []",
        "---",
        "# Notes",
        "",
        "We rely on (VITESTING) and on vitest-extras, never plain.",
        "",
      ].join("\n"),
    });
    const index = await buildIndex(root);
    const none = await collectFacts(index, [pick(index, "dependency", "vitest")], defaultConfig());
    expect(none.noRecordedReason).toBe(true);

    await writeFiles(root, {
      ".context/knowledge/notes.md": [
        "---",
        "id: notes",
        "kind: knowledge",
        "verified_at: null",
        "source_paths: []",
        "---",
        "# Notes",
        "",
        "We run `VITEST`, always.",
        "",
      ].join("\n"),
    });
    const again = await buildIndex(root);
    const hit = await collectFacts(again, [pick(again, "dependency", "vitest")], defaultConfig());
    expect(hit.noRecordedReason).toBe(false);
    expect(hit.facts.find((f) => f.label === "section")?.source).toBe(
      ".context/knowledge/notes.md:1",
    );
  });

  it("non-context facts are labelled no provenance", async () => {
    const index = await buildIndex(await makeFixture());
    const { facts } = await collectFacts(
      index,
      [pick(index, "dependency", "supabase"), pick(index, "heading", "Hooks")],
      defaultConfig(),
    );
    for (const f of facts) {
      if (f.label === "section" || f.label === "decision") continue;
      expect(f.provenance).toBe("no provenance");
    }
    expect(facts.find((f) => f.label === "decision")?.provenance).toBe("unverified");
  });

  it("falls back to 0 commits when git cannot count them", async () => {
    const index = await buildIndex(await makeFixture());
    const target = pick(index, "section", "Authentication");
    if (target.kind !== "section") throw new Error("unreachable");
    target.section.meta.verifiedAt = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"; // no such commit
    const { facts } = await collectFacts(index, [target], defaultConfig());
    expect(facts.find((f) => f.label === "section")?.provenance).toBe("fresh");
  });

  it("caps text and count", async () => {
    const root = await makeFixture();
    const files: Record<string, string> = {
      "docs/big.md": `# Big\n\n${"x".repeat(40_000)}\n`,
    };
    for (let i = 0; i < 50; i++) files[`src/imp${i}.ts`] = 'import s from "supabase";\n';
    await writeFiles(root, files);
    const index = await buildIndex(root);

    const big = await collectFacts(index, [pick(index, "heading", "Big")], defaultConfig());
    const doc = big.facts.find((f) => f.label === "doc");
    expect(doc?.text.length).toBe(FACT_TEXT_MAX + 1);
    expect(doc?.text.endsWith("…")).toBe(true);

    const dep = await collectFacts(index, [pick(index, "dependency", "supabase")], defaultConfig());
    expect(dep.facts.filter((f) => f.label === "import")).toHaveLength(MAX_LISTED);
    expect(dep.facts.length).toBeLessThanOrEqual(MAX_FACTS);
  });

  it("cuts to MAX_FACTS in label order but decides noRecordedReason first", async () => {
    const root = await makeFixture();
    const lines = Array.from({ length: 25 }, (_, i) => `a/ line ${i}`);
    await writeFiles(root, {
      "docs/many.md": ["# Many", "", "```", ...lines, "```", ""].join("\n"),
    });
    const index = await buildIndex(root);
    const { facts, noRecordedReason } = await collectFacts(
      index,
      [pick(index, "file", "src/a")],
      defaultConfig(),
    );
    expect(facts).toHaveLength(MAX_FACTS);
    expect(facts[0]?.label).toBe("section");
    expect(noRecordedReason).toBe(false);
  });

  it("merged targets dedupe facts", async () => {
    const index = await buildIndex(await makeFixture());
    const sec = pick(index, "section", "Authentication");
    const once = await collectFacts(index, [sec], defaultConfig());
    const twice = await collectFacts(index, [sec, sec], defaultConfig());
    expect(twice.facts).toEqual(once.facts);

    // Two targets that both reach adr-0001 report it once.
    const both = await collectFacts(
      index,
      [sec, pick(index, "dependency", "supabase")],
      defaultConfig(),
    );
    const keys = both.facts.map((f) => `${f.source}|${f.label}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
