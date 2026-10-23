import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEMPLATES } from "../src/core/templates.generated.js";
import { REPO_ROOT } from "./helpers/repo.js";

const BOM = String.fromCharCode(0xfeff);
const BOM_RE = new RegExp(`^${BOM}`);

function walk(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(dir, rel));
    else out.push(rel);
  }
  return out;
}

describe("embedded templates", () => {
  it("match templates/ exactly (run `npm run embed:templates` after editing a template)", () => {
    const dir = join(REPO_ROOT, "templates");
    const expected: Record<string, string> = {};
    for (const rel of walk(dir)) {
      expected[rel] = readFileSync(join(dir, rel), "utf8")
        .replace(BOM_RE, "")
        .replace(/\r\n?/g, "\n");
    }
    expect(TEMPLATES).toEqual(expected);
  });

  it("holds the eight template files, sorted", () => {
    expect(Object.keys(TEMPLATES)).toEqual([
      "AGENTS.md",
      "CLAUDE.md",
      "context/STATE.md",
      "context/config.yaml",
      "context/decisions/0000-template.md",
      "context/knowledge/README.md",
      "context/rules.md",
      "context/spec.md",
    ]);
  });

  it("carries no CR or BOM", () => {
    for (const text of Object.values(TEMPLATES)) {
      expect(text.includes("\r")).toBe(false);
      expect(text.startsWith(BOM)).toBe(false);
    }
  });
});
