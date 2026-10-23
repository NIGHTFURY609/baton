import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFileSection, parseSections } from "../src/core/frontmatter.js";
import { loadSectionIndex } from "../src/core/sections.js";
import {
  stampFrontmatter,
  stampMarkerLine,
  stampSections,
  uncommittedSources,
} from "../src/core/verify-doc.js";
import { runCli } from "./helpers/cli.js";
import {
  CONTEXT_FIXTURE,
  commitAll,
  makeRepo,
  makeTempDir,
  runGit,
  writeFiles,
} from "./helpers/repo.js";

const SHA = "0123456789ab";
const BOM = "﻿";

describe("stampMarkerLine", () => {
  it("replaces null", () => {
    expect(
      stampMarkerLine(
        '<!-- baton: {id: auth, kind: intent, verified_at: null, source_paths: ["src/auth/**"]} -->',
        SHA,
      ),
    ).toBe(
      '<!-- baton: {id: auth, kind: intent, verified_at: "0123456789ab", source_paths: ["src/auth/**"]} -->',
    );
  });

  it("replaces a single-quoted value", () => {
    expect(
      stampMarkerLine("<!-- baton: {id: a, kind: rule, verified_at: '3f2a1c9'} -->", SHA),
    ).toBe('<!-- baton: {id: a, kind: rule, verified_at: "0123456789ab"} -->');
  });

  it("inserts the key when absent", () => {
    expect(stampMarkerLine("<!-- baton: {id: a, kind: rule} -->", SHA)).toBe(
      '<!-- baton: {id: a, kind: rule, verified_at: "0123456789ab"} -->',
    );
  });

  it("throws on a non-marker line", () => {
    expect(() => stampMarkerLine("## Heading", SHA)).toThrow();
  });

  it("quoted stamps survive YAML", () => {
    for (const sha of ["012345678901", "1234e5678901"]) {
      const line = stampMarkerLine("<!-- baton: {id: a, kind: rule, verified_at: null} -->", sha);
      const [section] = parseSections(`## A\n${line}\n`, "spec.md");
      expect(section?.meta.verifiedAt).toBe(sha);
      expect(typeof section?.meta.verifiedAt).toBe("string");
    }
  });
});

describe("stampFrontmatter", () => {
  it("replaces verified_at in the fixture STATE", () => {
    const out = stampFrontmatter(CONTEXT_FIXTURE[".context/STATE.md"], SHA);
    expect(out).toContain(`verified_at: "${SHA}"`);
    expect(parseFileSection(out, "STATE.md")?.meta.verifiedAt).toBe(SHA);
  });

  it("inserts after kind when missing", () => {
    expect(stampFrontmatter("---\nid: k\nkind: knowledge\n---\n# K\n", SHA)).toBe(
      `---\nid: k\nkind: knowledge\nverified_at: "${SHA}"\n---\n# K\n`,
    );
  });

  it("throws without frontmatter", () => {
    expect(() => stampFrontmatter("# no frontmatter", SHA)).toThrow();
  });
});

describe("stampSections", () => {
  it("stamps sections in place", async () => {
    const root = makeRepo();
    const sha12 = commitAll(root, "another").slice(0, 12);
    const specPath = join(root, ".context", "spec.md");
    const before = readFileSync(specPath, "utf8").split("\n");

    const stamps = await stampSections(root, ["auth", "knowledge-windows", "adr-0001"], sha12);
    expect(stamps.map((s) => s.id)).toEqual(["auth", "knowledge-windows", "adr-0001"]);
    expect(stamps.every((s) => s.previous === null)).toBe(true);

    const index = await loadSectionIndex(root);
    for (const id of ["auth", "knowledge-windows", "adr-0001"]) {
      expect(index.byId.get(id)?.meta.verifiedAt).toBe(sha12);
    }
    expect(index.byId.get("billing")?.meta.verifiedAt).toBeNull();

    const after = readFileSync(specPath, "utf8").split("\n");
    expect(after).toHaveLength(before.length);
    const differing = after.flatMap((l, i) => (l === before[i] ? [] : [i]));
    expect(differing).toEqual([3]);
  });

  it("keeps CRLF files CRLF", async () => {
    const root = makeRepo();
    const specPath = join(root, ".context", "spec.md");
    writeFileSync(specPath, CONTEXT_FIXTURE[".context/spec.md"].replaceAll("\n", "\r\n"));
    await stampSections(root, ["auth"], SHA);
    const text = readFileSync(specPath, "utf8");
    expect(text).toContain("\r\n");
    expect(text).not.toMatch(/(?<!\r)\n/);
    expect(text).toContain(`verified_at: "${SHA}"`);
  });

  it("keeps a BOM", async () => {
    const root = makeRepo();
    const statePath = join(root, ".context", "STATE.md");
    const specPath = join(root, ".context", "spec.md");
    writeFileSync(statePath, BOM + CONTEXT_FIXTURE[".context/STATE.md"]);
    writeFileSync(specPath, BOM + CONTEXT_FIXTURE[".context/spec.md"]);
    await stampSections(root, ["state", "auth"], SHA);
    for (const p of [statePath, specPath]) {
      const text = readFileSync(p, "utf8");
      expect(text.startsWith(BOM)).toBe(true);
      expect(text.split(BOM)).toHaveLength(2);
    }
    const index = await loadSectionIndex(root);
    expect(index.byId.get("state")?.meta.verifiedAt).toBe(SHA);
    expect(index.byId.get("auth")?.meta.verifiedAt).toBe(SHA);
  });

  it("unknown ids write nothing", async () => {
    const root = makeRepo();
    const specPath = join(root, ".context", "spec.md");
    const before = readFileSync(specPath);
    await expect(stampSections(root, ["auth", "ghost"], SHA)).rejects.toMatchObject({
      exitCode: 1,
      message: expect.stringContaining("ghost"),
    });
    expect(readFileSync(specPath).equals(before)).toBe(true);
  });
});

describe("uncommittedSources", () => {
  it("maps porcelain lines to matching paths", () => {
    expect(
      uncommittedSources(
        [" M src/auth/a.ts", "R  old.ts -> src/auth/b.ts", "?? docs/x.md"],
        ["src/auth/**"],
      ),
    ).toEqual(["src/auth/a.ts", "src/auth/b.ts"]);
  });
});

describe("verify-doc command", () => {
  it("stamps HEAD and logs it", async () => {
    const root = makeRepo();
    const head12 = runGit(root, "rev-parse", "HEAD").slice(0, 12);
    const r = await runCli(["verify-doc", "auth"], root);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe(`verified auth at ${head12} (.context/spec.md)\n`);

    const log = readFileSync(join(root, ".context", ".cache", "drift.jsonl"), "utf8")
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => JSON.parse(l));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ event: "verified", id: "auth", head: head12 });

    const drift = await runCli(["drift", "--format", "json"], root);
    const auth = JSON.parse(drift.stdout).sections.find((s: { id: string }) => s.id === "auth");
    expect(auth.level).toBe("fresh");
  });

  it("notes uncommitted sources", async () => {
    const root = makeRepo();
    writeFileSync(join(root, "src", "auth", "login.ts"), "export const login = 2;\n");
    const r = await runCli(["verify-doc", "auth"], root);
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("note: auth: uncommitted changes in src/auth/login.ts");
  });

  it("needs a commit", async () => {
    const dir = makeTempDir();
    writeFiles(dir, CONTEXT_FIXTURE);
    runGit(dir, "init", "-q");
    const r = await runCli(["verify-doc", "auth"], dir);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("no commits yet");
  });
});
