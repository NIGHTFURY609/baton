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
    // "alphaxyz" is 3 edits from "alpha": too far to match, near enough to suggest.
    const result = matchTargets("alphaxyz", [
      target("dep", "alpha"),
      target("dep", "alphabetz"),
      target("dep", "echo"),
    ]);
    expect(result.status).toBe("none");
    if (result.status === "none") {
      expect(result.suggestions.map((s) => s.name)).toEqual(["alpha", "alphabetz"]);
    }
  });

  it("suggestions beyond the distance limit are dropped", () => {
    const far = matchTargets("zzzzzz", [
      target("dep", "alpha"),
      target("dep", "bravo"),
      target("dep", "charlie"),
    ]);
    expect(far).toEqual({ status: "none", suggestions: [] });

    // The limit is max(3, floor(length / 2)), so 5 edits for a 10-letter query.
    const near = matchTargets("abcdefghij", [
      target("dep", "abcdef"), // 4 edits
      target("dep", "abcde"), // 5 edits: exactly the limit
      target("dep", "abcd"), // 6 edits: dropped
    ]);
    expect(near.status).toBe("none");
    if (near.status === "none") {
      expect(near.suggestions.map((s) => s.name)).toEqual(["abcdef", "abcde"]);
    }
  });

  it("one-letter keys never take part in the fuzzy pass", () => {
    const targets = [
      target("mermaid", "Mission packet", ["mission-packet", "b"]),
      target("mermaid", "Session start", ["session-start", "a"]),
    ];
    // Before: "db" was one edit from the id "b" and resolved to "Mission packet".
    expect(matchTargets("db", targets).status).toBe("none");
    // Exact still works on a short key.
    const exact = matchTargets("b", targets);
    expect(exact.status).toBe("exact");
    if (exact.status === "exact")
      expect(exact.matches.map((m) => m.name)).toEqual(["Mission packet"]);
  });

  it("a name that is a section, a heading and two directories merges, not ties", () => {
    const result = matchTargets("hooks", [
      target("file", "plugin/hooks", ["plugin-hooks", "hooks"]),
      target("file", "src/hooks", ["src-hooks", "hooks"]),
      target("section", "Hooks", ["hooks"]),
      target("heading", "Hooks", ["hooks"]),
    ]);
    expect(result.status).toBe("exact");
    if (result.status === "exact") {
      expect(result.matches.map((m) => m.kind)).toEqual(["section", "heading"]);
    }
  });

  it("a root file wins over same-basename files when asked by its full path", () => {
    const targets = [
      target("file", "README.md", ["readme-md"]),
      target("file", "templates/README.md", ["templates-readme-md", "readme-md"]),
    ];
    const root = matchTargets("README.md", targets);
    expect(root.status).toBe("exact");
    if (root.status === "exact") expect(root.matches.map((m) => m.name)).toEqual(["README.md"]);

    const nested = matchTargets("templates/README.md", targets);
    expect(nested.status).toBe("exact");
    if (nested.status === "exact") {
      expect(nested.matches.map((m) => m.name)).toEqual(["templates/README.md"]);
    }

    // Only the bare basename is a real tie when neither file is at the root.
    const tie = matchTargets("index.ts", [
      target("file", "src/a/index.ts", ["src-a-index-ts", "index-ts"]),
      target("file", "src/b/index.ts", ["src-b-index-ts", "index-ts"]),
    ]);
    expect(tie.status).toBe("tie");
  });

  it("the full-path file joins the non-file matches", () => {
    const result = matchTargets("README.md", [
      target("file", "README.md", ["readme-md"]),
      target("file", "docs/README.md", ["docs-readme-md", "readme-md"]),
      target("heading", "README.md", ["readme-md"]),
    ]);
    expect(result.status).toBe("exact");
    if (result.status === "exact") {
      expect(result.matches.map((m) => `${m.kind}:${m.name}`)).toEqual([
        "heading:README.md",
        "file:README.md",
      ]);
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
