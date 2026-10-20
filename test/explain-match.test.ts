import { describe, expect, it } from "vitest";
import { editDistance, type Matchable, matchTargets, toKey } from "../src/core/explain/match.js";

const target = (kind: string, name: string, keys: string[] = [toKey(name)]): Matchable => ({
  kind,
  name,
  keys,
});

describe("toKey", () => {
  it("normalizes separators and case", () => {
    expect(toKey("src\\core\\git.ts")).toBe("src-core-git-ts");
    expect(toKey("src/core/git.ts")).toBe("src-core-git-ts");
    expect(toKey("@modelcontextprotocol/server")).toBe("modelcontextprotocol-server");
    expect(toKey("Hackathon Judge")).toBe("hackathon-judge");
  });

  it("folds accents instead of splitting on them", () => {
    expect(toKey("Café Menu")).toBe("cafe-menu");
  });
});

describe("editDistance", () => {
  it("computes Levenshtein distance", () => {
    expect(editDistance("supabse", "supabase")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("abc", "abc")).toBe(0);
  });
});

describe("matchTargets", () => {
  it("exact merges kinds", () => {
    const result = matchTargets("hooks", [
      target("section", "hooks"),
      target("heading", "Hooks"),
      target("dep", "vitest"),
    ]);
    expect(result.status).toBe("exact");
    if (result.status === "exact") expect(result.matches).toHaveLength(2);
  });

  it("two files with one basename tie", () => {
    const result = matchTargets("index.ts", [
      target("file", "src/a/index.ts", ["src-a-index-ts", "index-ts"]),
      target("file", "src/b/index.ts", ["src-b-index-ts", "index-ts"]),
    ]);
    expect(result.status).toBe("tie");
    if (result.status === "tie") expect(result.candidates).toHaveLength(2);
  });

  it("closest within threshold", () => {
    const result = matchTargets("supabse", [target("dep", "supabase"), target("dep", "vitest")]);
    expect(result.status).toBe("closest");
    if (result.status === "closest")
      expect(result.matches.map((m) => m.name)).toEqual(["supabase"]);
  });

  it("closest keeps a section and heading with the same name together", () => {
    const result = matchTargets("hookz", [target("section", "hooks"), target("heading", "Hooks")]);
    expect(result.status).toBe("closest");
    if (result.status === "closest") expect(result.matches).toHaveLength(2);
  });

  it("fuzzy tie", () => {
    const result = matchTargets("cut", [target("dep", "cat"), target("dep", "cot")]);
    expect(result.status).toBe("tie");
    if (result.status === "tie") expect(result.candidates).toHaveLength(2);
  });

  it("none with suggestions", () => {
    const result = matchTargets("zzzzzz", [
      target("dep", "alpha"),
      target("dep", "bravo"),
      target("dep", "charlie"),
      target("dep", "delta"),
      target("dep", "echo"),
    ]);
    expect(result.status).toBe("none");
    if (result.status === "none") {
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.length).toBeLessThanOrEqual(3);
    }
  });

  it("none suggests nearest first with distinct names", () => {
    const result = matchTargets("configuraton-files-xx", [
      target("section", "config"),
      target("heading", "Config"),
      target("dep", "configuration-files"),
      target("dep", "unrelated"),
    ]);
    expect(result.status).toBe("none");
    if (result.status === "none") {
      expect(result.suggestions[0]?.name).toBe("configuration-files");
      const names = result.suggestions.map((s) => toKey(s.name));
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("none on an empty target list", () => {
    expect(matchTargets("anything", [])).toEqual({ status: "none", suggestions: [] });
  });

  it("backslash path query matches", () => {
    const result = matchTargets("src\\core\\git.ts", [
      target("file", "src/core/git.ts", [toKey("src/core/git.ts"), "git-ts"]),
    ]);
    expect(result.status).toBe("exact");
  });
});
