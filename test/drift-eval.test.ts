import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigSchema, defaultConfig, loadConfig } from "../src/core/config.js";
import { evaluateFreshness, extractPathRefs } from "../src/core/drift.js";
import { loadSectionIndex } from "../src/core/sections.js";
import {
  CONTEXT_FIXTURE,
  commitAll,
  makeRepo,
  REPO_ROOT,
  stampFixture,
  writeFiles,
} from "./helpers/repo.js";

describe("extractPathRefs", () => {
  it("takes path-like inline code only", () => {
    const body = "See `src/auth/login.ts`, `npm run check`, `spec:<id>` and `A|B`.";
    expect(extractPathRefs(body, ".context/spec.md")).toEqual(["src/auth/login.ts"]);
  });

  it("accepts a bare file name with a known extension, not a bare word", () => {
    expect(extractPathRefs("`package.json` and `config`", ".context/spec.md")).toEqual([
      "package.json",
    ]);
  });

  it("drops fenced code blocks", () => {
    expect(extractPathRefs("```\n`src/x.ts`\n```\n`src/z.ts`", ".context/spec.md")).toEqual([
      "src/z.ts",
    ]);
    expect(extractPathRefs("~~~\n`src/x.ts`\n~~~\n`src/z.ts`", ".context/spec.md")).toEqual([
      "src/z.ts",
    ]);
  });

  it("resolves relative links against the file and skips urls, anchors and absolute paths", () => {
    const body = "[notes](../../docs/notes.md) [web](https://x.y) [a](#a) [self](./other.md#top)";
    expect(extractPathRefs(body, ".context/knowledge/k.md")).toEqual([
      "docs/notes.md",
      ".context/knowledge/other.md",
    ]);
    expect(extractPathRefs("[r](/etc/x) [o](../../../up.md)", ".context/knowledge/k.md")).toEqual(
      [],
    );
  });

  it("skips paths that climb out of the repo", () => {
    expect(extractPathRefs("`../outside.md`", ".context/spec.md")).toEqual([]);
  });

  it("strips a leading ./", () => {
    expect(extractPathRefs("`./src/a.ts`", ".context/spec.md")).toEqual(["src/a.ts"]);
  });

  it("dedupes in first-appearance order", () => {
    expect(extractPathRefs("`b.md` `a.md` `b.md`", ".context/spec.md")).toEqual(["b.md", "a.md"]);
  });

  it("ignores spans with glob or placeholder syntax", () => {
    const body = [
      "`.context/knowledge/*.md`",
      "`.context/decisions/NNNN-*.md`",
      "`.context/decisions/NNNN-title.md`",
      "`.context/explain/<slug>.md`",
      "`src/{a,b}.ts`",
      "`src/a?.ts`",
      "[g](docs/*.md) [p](docs/<slug>.md) [n](docs/NNNN-x.md)",
    ].join(" ");
    expect(extractPathRefs(body, ".context/spec.md")).toEqual([]);
  });
});

/** The fixture with `verified_at` stamped at the base commit; returns root and the 12-char stamp. */
function stampedRepo(files: Readonly<Record<string, string>> = CONTEXT_FIXTURE) {
  const root = makeRepo(files);
  const sha = commitAll(root, "base");
  const stamp = sha.slice(0, 12);
  stampFixture(root, stamp);
  commitAll(root, "stamp");
  return { root, stamp };
}

function edit(root: string, rel: string, fn: (text: string) => string): void {
  const abs = join(root, rel);
  writeFileSync(abs, fn(readFileSync(abs, "utf8")));
}

async function evaluate(root: string, config = defaultConfig()) {
  return evaluateFreshness(await loadSectionIndex(root), config);
}

const find = (r: Awaited<ReturnType<typeof evaluate>>, id: string) => {
  const s = r.sections.find((x) => x.section.meta.id === id);
  if (!s) throw new Error(`no section ${id}`);
  return s;
};

describe("evaluateFreshness", () => {
  it("stamping commit does not age", async () => {
    const { root } = stampedRepo();
    const r = await evaluate(root);
    for (const id of [
      "auth",
      "billing",
      "rules-project",
      "state",
      "knowledge-windows",
      "adr-0001",
    ]) {
      expect(find(r, id).result.level, id).toBe("fresh");
    }
    expect(find(r, "adr-0002").result.level).toBe("superseded");
    expect(find(r, "auth").commitsOutsideContext).toBe(0);
    expect(r.counts).toEqual({ fresh: 6, aging: 0, stale: 0, superseded: 1, unverified: 0 });
    expect(r.head).toMatch(/^[0-9a-f]{40}$/);
    expect(r.sections.map((s) => s.section.meta.id)).toEqual([
      "rules-project",
      "auth",
      "billing",
      "state",
      "knowledge-windows",
      "adr-0001",
      "adr-0002",
    ]);
  });

  it("a source change ages matching sections only", async () => {
    const { root } = stampedRepo();
    writeFiles(root, { "src/auth/login.ts": "export const login = 2;\n" });
    commitAll(root, "change login");
    const r = await evaluate(root);
    const auth = find(r, "auth");
    expect(auth.result.level).toBe("aging");
    expect(auth.result.commitsSince).toBe(1);
    expect(auth.commitsOutsideContext).toBe(1);
    expect(find(r, "knowledge-windows").result.level).toBe("aging");
    expect(find(r, "rules-project").result.level).toBe("fresh");
  });

  it(".context/-only commits are not counted", async () => {
    const { root } = stampedRepo();
    writeFiles(root, { "src/auth/login.ts": "export const login = 2;\n" });
    commitAll(root, "change login");
    writeFiles(root, { ".context/tasks.jsonl": '{"id":"bt-1"}\n' });
    commitAll(root, "task store");
    const auth = find(await evaluate(root), "auth");
    expect(auth.result.commitsSince).toBe(1);
    expect(auth.commitsOutsideContext).toBe(1);
  });

  it("goes stale at the threshold", async () => {
    const { root } = stampedRepo();
    const config = ConfigSchema.parse({ freshness: { staleAfter: { intent: 2 } } });
    writeFiles(root, { "src/auth/login.ts": "export const login = 2;\n" });
    commitAll(root, "one");
    expect(find(await evaluate(root, config), "auth").result.level).toBe("aging");
    writeFiles(root, { "src/auth/login.ts": "export const login = 3;\n" });
    commitAll(root, "two");
    const auth = find(await evaluate(root, config), "auth");
    expect(auth.result.level).toBe("stale");
    expect(auth.result.commitsSince).toBe(2);
  });

  it("a glob that matches nothing is a dead ref", async () => {
    const { root } = stampedRepo();
    edit(root, ".context/spec.md", (t) =>
      t.replace('source_paths: ["src/auth/**"]', 'source_paths: ["lib/**"]'),
    );
    commitAll(root, "move sources");
    const auth = find(await evaluate(root), "auth");
    expect(auth.result.level).toBe("stale");
    expect(auth.deadRefs).toContain("lib/**");
    expect(auth.result.reason).toContain("lib/**");
  });

  it("missing body paths are dead; ignored or unrooted ones are not", async () => {
    const { root } = stampedRepo();
    edit(root, ".context/spec.md", (t) =>
      t.replace(
        "(`src/auth/login.ts`).",
        "(`src/auth/login.ts`). See `src/auth/gone.ts`, `build/out.js` and `nope/x.ts`.",
      ),
    );
    writeFiles(root, { "build/keep.txt": "x\n", ".gitignore": ".context/.cache/\nbuild/\n" });
    commitAll(root, "refs");
    expect(find(await evaluate(root), "auth").deadRefs).toEqual(["src/auth/gone.ts"]);
  });

  it("glob and placeholder spans are not dead refs, a real missing path still is", async () => {
    const { root } = stampedRepo();
    edit(root, ".context/spec.md", (t) =>
      t.replace(
        "(`src/auth/login.ts`).",
        "(`src/auth/login.ts`). Files: `.context/knowledge/*.md`, `.context/decisions/NNNN-*.md`, `.context/explain/<slug>.md`, [g](../docs/*.md).",
      ),
    );
    commitAll(root, "placeholders");
    const clean = find(await evaluate(root), "auth");
    expect(clean.deadRefs).toEqual([]);
    expect(clean.result.level).toBe("fresh");

    edit(root, ".context/spec.md", (t) =>
      t.replace("Files:", "Files: `.context/knowledge/gone.md`,"),
    );
    commitAll(root, "real missing");
    expect(find(await evaluate(root), "auth").deadRefs).toEqual([".context/knowledge/gone.md"]);
  });

  it("an unknown sha is stale", async () => {
    const { root } = stampedRepo();
    edit(root, ".context/spec.md", (t) =>
      t.replace(/(id: auth.*?verified_at: )"[0-9a-f]+"/, '$1"0123456789ab"'),
    );
    commitAll(root, "bad stamp");
    const auth = find(await evaluate(root), "auth");
    expect(auth.result.level).toBe("stale");
    expect(auth.deadRefs).toContain("verified_at 0123456 is not a known commit");
    expect(auth.commitsOutsideContext).toBeNull();
  });

  it("a stamp that is not hex is handled like an unknown sha", async () => {
    const { root } = stampedRepo();
    edit(root, ".context/spec.md", (t) =>
      t.replace(/(id: auth.*?verified_at: )"[0-9a-f]+"/, '$1"--output=x"'),
    );
    commitAll(root, "garbage stamp");
    const auth = find(await evaluate(root), "auth");
    expect(auth.result.level).toBe("stale");
    expect(auth.deadRefs).toContain("verified_at --outpu is not a known commit");
  });

  it("unverified stays unverified but reports dead refs", async () => {
    const root = makeRepo();
    edit(root, ".context/spec.md", (t) =>
      t.replace("Stripe, monthly only.", "Stripe, monthly only. `src/auth/gone.ts`"),
    );
    commitAll(root, "dead ref");
    const billing = find(await evaluate(root), "billing");
    expect(billing.result.level).toBe("unverified");
    expect(billing.deadRefs).toContain("src/auth/gone.ts");
    expect(billing.commitsOutsideContext).toBeNull();
  });

  it("STATE body references are not checked", async () => {
    const { root } = stampedRepo();
    edit(root, ".context/STATE.md", (t) => `${t}\n- Edit \`src/auth/gone.ts\`\n`);
    commitAll(root, "state ref");
    const state = find(await evaluate(root), "state");
    expect(state.result.level).toBe("fresh");
    expect(state.deadRefs).toEqual([]);
  });

  it("works outside git", async () => {
    const root = makeRepo(CONTEXT_FIXTURE, { git: false });
    const r = await evaluate(root);
    expect(r.head).toBeNull();
    expect(r.counts.unverified).toBe(6);
    expect(
      r.sections.every((s) => s.deadRefs.length === 0 && s.commitsOutsideContext === null),
    ).toBe(true);
  });

  it("dogfood", async () => {
    const r = await evaluateFreshness(
      await loadSectionIndex(REPO_ROOT),
      await loadConfig(REPO_ROOT),
    );
    const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(r.sections.length);
  });
});
