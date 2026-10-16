import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ConfigSchema } from "../src/core/config.js";
import { parseFileSection, parseSections } from "../src/core/frontmatter.js";

// baton's own .context/ must always parse with baton's own parser.
const ctx = join(import.meta.dirname, "..", ".context");
const read = (...p: string[]) => readFileSync(join(ctx, ...p), "utf8");

describe("dogfood .context/", () => {
  const spec = parseSections(read("spec.md"), ".context/spec.md");
  const rules = parseSections(read("rules.md"), ".context/rules.md");
  const files = [
    read("STATE.md"),
    ...readdirSync(join(ctx, "decisions")).map((f) => read("decisions", f)),
    ...readdirSync(join(ctx, "knowledge")).map((f) => read("knowledge", f)),
  ].map((t, i) => parseFileSection(t, `file-${i}`));

  it("has every spec section the task labels refer to", () => {
    expect(spec.map((s) => s.meta.id)).toEqual(
      expect.arrayContaining([
        "context-format",
        "freshness",
        "mission-packet",
        "handoff",
        "hooks",
        "skills",
        "tasks",
        "decisions",
        "measurement",
      ]),
    );
  });

  it("uses unique ids across all files", () => {
    const ids = [...spec, ...rules, ...files].map((s) => s?.meta.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has a valid config", () => {
    expect(() => ConfigSchema.parse(parse(read("config.yaml")))).not.toThrow();
  });
});
