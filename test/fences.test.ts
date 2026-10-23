import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/core/config.js";
import { extractPathRefs } from "../src/core/drift.js";
import { fencedLines, findFences } from "../src/core/fences.js";
import { parseFileSection, parseSections } from "../src/core/frontmatter.js";
import { RULES_PLACEHOLDER, renderAgentsMd } from "../src/core/init.js";
import { buildMission } from "../src/core/mission.js";
import { CONTEXT_FIXTURE, commitAll, makeRepo, stampFixture, withService } from "./helpers/repo.js";

const RULES = [
  "# Rules",
  "",
  "## Commands",
  "<!-- baton: {id: rules-commands, kind: rule, verified_at: null, source_paths: []} -->",
  "",
  "Run these before a commit:",
  "",
  "```bash",
  "# lint and test",
  "npm run check",
  "```",
  "",
  "Never push to main.",
  "",
  "## Style",
  "<!-- baton: {id: rules-style, kind: rule, verified_at: null, source_paths: []} -->",
  "",
  "Small functions.",
  "",
].join("\n");

describe("fence scanner", () => {
  it("masks fence lines and their contents", () => {
    const lines = ["a", "```sh", "# x", "```", "b", "~~~", "c"];
    expect(fencedLines(lines)).toEqual([false, true, true, true, false, true, true]);
    expect(findFences(lines)).toEqual([
      { open: 1, close: 3, info: "sh" },
      { open: 5, close: 6, info: "" },
    ]);
  });
});

describe("parseSections and fenced code", () => {
  it("does not read a # line inside a fence as a heading", () => {
    const [commands, style] = parseSections(RULES, ".context/rules.md");
    expect(commands?.body).toContain("```bash\n# lint and test\nnpm run check\n```");
    expect(commands?.body).toContain("Never push to main.");
    expect(style?.body).toBe("Small functions.");
  });

  it("does not read a heading or marker inside a tilde fence", () => {
    const text = [
      "## A",
      "<!-- baton: {id: a, kind: rule} -->",
      "~~~~md",
      "## Fake",
      "<!-- baton: {id: fake, kind: rule} -->",
      "~~~",
      "still inside",
      "~~~~",
      "after",
    ].join("\n");
    const sections = parseSections(text, "x.md");
    expect(sections.map((s) => s.meta.id)).toEqual(["a"]);
    expect(sections[0]?.body).toContain("still inside");
    expect(sections[0]?.body).toContain("after");
  });

  it("closes a fence only on the same character and at least the same length", () => {
    const text = [
      "## A",
      "<!-- baton: {id: a, kind: rule} -->",
      "````",
      "```",
      "# not a heading",
      "````",
      "after",
    ].join("\n");
    const [a] = parseSections(text, "x.md");
    expect(a?.body).toContain("# not a heading");
    expect(a?.body).toContain("after");
  });

  it("takes a file section's title from outside a fence", () => {
    const text = "---\nid: k\nkind: knowledge\n---\n```sh\n# comment\n```\n# Real title\n";
    expect(parseFileSection(text, "k.md")?.title).toBe("Real title");
  });
});

describe("renderAgentsMd and fenced code", () => {
  it("keeps the closed fence and the rule after it", () => {
    const out = renderAgentsMd(`# Agents\n\n${RULES_PLACEHOLDER}\n`, RULES);
    expect(out).toContain("```bash\n# lint and test\nnpm run check\n```");
    expect(out).toContain("Never push to main.");
    expect(out).toContain("## Style");
  });
});

describe("mission packet and fenced code", () => {
  it("carries the text after a fence that holds a # line", async () => {
    const spec = [
      "# Spec",
      "",
      "## Authentication",
      '<!-- baton: {id: auth, kind: intent, verified_at: null, source_paths: ["src/auth/**"]} -->',
      "",
      "Sign in like this:",
      "",
      "```sh",
      "# log in",
      "baton login",
      "```",
      "",
      "Never log tokens.",
      "",
    ].join("\n");
    const root = makeRepo({ ...CONTEXT_FIXTURE, ".context/spec.md": spec });
    stampFixture(root, commitAll(root, "base").slice(0, 12));
    await withService(root, "alice", (s) => {
      s.claim(s.create({ title: "Add login", labels: ["spec:auth"] }).id);
    });
    commitAll(root, "stamp");
    const r = await buildMission(root, await loadConfig(root), {
      now: new Date("2026-10-20T00:00:00.000Z"),
    });
    expect(r.text).toContain("# log in\nbaton login\n```");
    expect(r.text).toContain("Never log tokens.");
  });
});

describe("path refs and fenced code", () => {
  it("ignores paths named inside a longer fence that holds a shorter one", () => {
    const body = [
      "`src/auth/login.ts` signs in.",
      "",
      "````md",
      "```",
      "`src/missing/gone.ts`",
      "````",
      "",
      "`src/after/fence.ts` is back in prose.",
    ].join("\n");
    expect(extractPathRefs(body, ".context/spec.md")).toEqual([
      "src/auth/login.ts",
      "src/after/fence.ts",
    ]);
  });
});
