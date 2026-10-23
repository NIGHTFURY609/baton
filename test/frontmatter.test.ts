import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFileSection, parseFrontmatter, parseSections } from "../src/core/frontmatter.js";

const spec = readFileSync(new URL("./fixtures/spec.md", import.meta.url), "utf8");

describe("parseSections", () => {
  const sections = parseSections(spec, ".context/spec.md");

  it("finds only marked headings", () => {
    expect(sections.map((s) => s.meta.id)).toEqual(["auth", "billing"]);
  });

  it("keeps unmarked sub-headings inside the enclosing section", () => {
    const auth = sections[0];
    expect(auth?.body).toContain("Session lifetime");
    expect(auth?.body).not.toContain("Stripe");
  });

  it("normalises provenance", () => {
    expect(sections[0]?.meta).toEqual({
      id: "auth",
      kind: "intent",
      verifiedAt: "3f2a1c9d",
      sourcePaths: ["src/auth/**"],
    });
    expect(sections[1]?.meta.verifiedAt).toBeNull();
    expect(sections[0]?.line).toBe(5);
  });

  it("rejects duplicate ids and bad kinds", () => {
    const dup =
      "## A\n<!-- baton: {id: a, kind: rule} -->\n## B\n<!-- baton: {id: a, kind: rule} -->\n";
    expect(() => parseSections(dup, "x.md")).toThrow(/duplicate/);
    const bad = "## A\n<!-- baton: {id: a, kind: vibes} -->\n";
    expect(() => parseSections(bad, "x.md")).toThrow(/kind must be/);
  });
});

describe("parseSections nesting", () => {
  const M = (id: string) => `<!-- baton: {id: ${id}, kind: intent} -->`;

  it("keeps a marked section nested under another", () => {
    const text = [
      "## Authentication",
      M("auth"),
      "",
      "Outer text.",
      "",
      "### Passkeys",
      M("passkeys"),
      "",
      "Inner text.",
      "",
      "### Session lifetime",
      "",
      "Outer again.",
      "",
      "## Billing",
      M("billing"),
    ].join("\n");
    const sections = parseSections(text, "x.md");
    expect(sections.map((s) => s.meta.id)).toEqual(["auth", "passkeys", "billing"]);
    expect(sections.map((s) => s.line)).toEqual([1, 6, 15]);
    const [auth, passkeys] = sections;
    expect(auth?.body).toBe("Outer text.\n\n### Session lifetime\n\nOuter again.");
    expect(auth?.body).not.toContain("Inner text.");
    expect(passkeys?.body).toBe("Inner text.");
  });
});

describe("parseFrontmatter / parseFileSection", () => {
  it("returns the body untouched when there is no frontmatter", () => {
    expect(parseFrontmatter("# hi\n")).toEqual({ data: {}, body: "# hi\n" });
  });

  it("parses a whole-file section", () => {
    const text =
      "---\nid: gotchas-windows\nkind: knowledge\nverified_at: abc1234\nsource_paths: [scripts/**]\n---\n# Windows gotchas\n\nUse exec-form hooks.\n";
    const s = parseFileSection(text, ".context/knowledge/windows.md");
    expect(s?.title).toBe("Windows gotchas");
    expect(s?.meta.sourcePaths).toEqual(["scripts/**"]);
  });

  it("returns null for files without an id", () => {
    expect(parseFileSection("---\ntitle: x\n---\nbody", "f.md")).toBeNull();
  });
});
