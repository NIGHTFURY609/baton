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
import { makeFixture, makeTempDir, writeFiles } from "./helpers/explain-fixture.js";

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

  it("finds the enclosing heading for a diagram outside docs/", async () => {
    const root = await makeFixture();
    await writeFiles(root, {
      "README.md": [
        "# Project",
        "",
        "## Flow",
        "",
        "Requests go left to right.",
        "",
        "```mermaid",
        "flowchart LR",
        "  Client --> Server",
        "```",
        "",
      ].join("\r\n"),
    });
    const index = await buildIndex(root);
    const { facts } = await collectFacts(
      index,
      [pick(index, "mermaid", "Server")],
      defaultConfig(),
    );
    const doc = facts.find((f) => f.label === "doc");
    expect(doc?.source).toBe("README.md:3");
    expect(doc?.text).toContain("Requests go left to right.");
    expect(doc?.provenance).toBe("no provenance");
  });

  it("gives a diagram inside .context/ its enclosing section, not a doc fact", async () => {
    const root = await makeFixture();
    await writeFiles(root, {
      ".context/spec.md": [
        "# Spec",
        "",
        "## Authentication",
        '<!-- baton: {id: auth, kind: intent, verified_at: null, source_paths: ["src/a/**"]} -->',
        "",
        "Users sign in with passkeys.",
        "",
        "## Billing",
        '<!-- baton: {id: billing, kind: intent, verified_at: null, source_paths: ["src/b/**"]} -->',
        "",
        "Invoices flow like this.",
        "",
        "```mermaid",
        "flowchart LR",
        // `Invoice` sits inside {} so it is not a whole token in the section text:
        // only the enclosing-section rule can attach this section.
        "  C[Cart] --> I{Invoice}",
        "```",
        "",
      ].join("\n"),
    });
    const index = await buildIndex(root);
    const { facts, noRecordedReason } = await collectFacts(
      index,
      [pick(index, "mermaid", "Invoice")],
      defaultConfig(),
    );
    expect(facts.some((f) => f.label === "doc")).toBe(false);
    const own = facts.find((f) => f.label === "section" && f.source === ".context/spec.md:8");
    expect(own?.text).toContain("Invoices flow like this.");
    expect(own?.provenance).toBe("unverified");
    expect(facts.some((f) => f.source === ".context/spec.md:3")).toBe(false);
    expect(noRecordedReason).toBe(false);
  });

  it("does not attach a section to a diagram under a later unmarked heading", async () => {
    const root = await makeFixture();
    await writeFiles(root, {
      ".context/spec.md": [
        "# Spec",
        "",
        "## Authentication",
        '<!-- baton: {id: auth, kind: intent, verified_at: null, source_paths: ["src/a/**"]} -->',
        "",
        "Users sign in with passkeys.",
        "",
        "## Appendix",
        "",
        "```mermaid",
        "flowchart LR",
        "  P{Payment} --> Q{Queue}",
        "```",
        "",
      ].join("\n"),
    });
    const index = await buildIndex(root);
    const { facts, noRecordedReason } = await collectFacts(
      index,
      [pick(index, "mermaid", "Payment")],
      defaultConfig(),
    );
    expect(facts.some((f) => f.label === "section" || f.label === "decision")).toBe(false);
    expect(facts.some((f) => f.label === "doc")).toBe(false);
    expect(noRecordedReason).toBe(true);
  });

  it("lists at most MAX_LISTED source files and counts the rest", async () => {
    const root = await makeFixture();
    const files: Record<string, string> = {};
    for (let i = 0; i < 14; i++) files[`src/a/f${String(i).padStart(2, "0")}.ts`] = "export {};\n";
    await writeFiles(root, files);
    const index = await buildIndex(root);
    const { facts } = await collectFacts(
      index,
      [pick(index, "section", "Authentication")],
      defaultConfig(),
    );
    const source = facts.find((f) => f.label === "source");
    // src/a/index.ts + 14 new files = 15 matches
    expect(source?.text.endsWith(" (+5 more)")).toBe(true);
    const listed = source?.text.replace(/ \(\+5 more\)$/, "").split(", ");
    expect(listed).toHaveLength(MAX_LISTED);
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

  it("a dependency is not backed by prose that only differs in case", async () => {
    const root = await makeTempDir();
    const adr = (body: string) =>
      [
        "---",
        "id: adr-0002",
        "kind: decision",
        "status: accepted",
        "verified_at: null",
        "source_paths: []",
        "spec_sections: []",
        "---",
        "# Config format",
        "",
        body,
        "",
      ].join("\n");
    await writeFiles(root, {
      "package.json": `${JSON.stringify({ dependencies: { yaml: "^2.0.0" } }, null, 2)}\n`,
      ".context/decisions/0002-config.md": adr("Config uses a YAML flow mapping."),
    });
    const prose = await buildIndex(root);
    const before = await collectFacts(prose, [pick(prose, "dependency", "yaml")], defaultConfig());
    expect(before.facts.some((f) => f.label === "decision")).toBe(false);
    expect(before.noRecordedReason).toBe(true);

    await writeFiles(root, {
      ".context/decisions/0002-config.md": adr("Config is parsed with `yaml`."),
    });
    const named = await buildIndex(root);
    const after = await collectFacts(named, [pick(named, "dependency", "yaml")], defaultConfig());
    expect(after.facts.some((f) => f.label === "decision")).toBe(true);
    expect(after.noRecordedReason).toBe(false);

    // Exact-case prose counts too; only a different case does not.
    await writeFiles(root, {
      ".context/decisions/0002-config.md": adr("The yaml package parses it."),
    });
    const exact = await buildIndex(root);
    const same = await collectFacts(exact, [pick(exact, "dependency", "yaml")], defaultConfig());
    expect(same.facts.some((f) => f.label === "decision")).toBe(true);
  });
});
