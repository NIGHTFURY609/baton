import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BatonError } from "../src/core/errors.js";
import { loadSectionIndex, supersededByFromStatus } from "../src/core/sections.js";
import { CONTEXT_FIXTURE, makeRepo, makeTempDir } from "./helpers/repo.js";

const SEVEN_IDS = [
  "rules-project",
  "auth",
  "billing",
  "state",
  "knowledge-windows",
  "adr-0001",
  "adr-0002",
];
const DUP = { ".context/knowledge/dup.md": "---\nid: auth\nkind: knowledge\n---\n# Dup\n" };

const ids = (idx: { sections: { meta: { id: string } }[] }) => idx.sections.map((s) => s.meta.id);

describe("loadSectionIndex", () => {
  it("indexes the five documents in order", async () => {
    const idx = await loadSectionIndex(makeRepo(CONTEXT_FIXTURE, { git: false }));
    expect(ids(idx)).toEqual(SEVEN_IDS);
    expect(idx.sections.map((s) => s.doc)).toEqual([
      "rules",
      "spec",
      "spec",
      "state",
      "knowledge",
      "decision",
      "decision",
    ]);
    expect(idx.problems).toEqual([]);
  });

  it("skips the ADR template and id-less files", async () => {
    const idx = await loadSectionIndex(makeRepo(CONTEXT_FIXTURE, { git: false }));
    expect(idx.byId.has("adr-NNNN")).toBe(false);
    expect(idx.sections.some((s) => s.file.endsWith("README.md"))).toBe(false);
  });

  it("keeps ADR info", async () => {
    const idx = await loadSectionIndex(makeRepo(CONTEXT_FIXTURE, { git: false }));
    expect(idx.byId.get("adr-0001")?.adr).toEqual({
      number: 1,
      status: "accepted",
      specSections: ["auth"],
    });
    expect(idx.byId.get("adr-0002")?.meta.supersededBy).toBe("adr-0001");
    expect(idx.byId.get("adr-0002")?.adr?.status).toBe("superseded by ADR-0001");
  });

  it("records files and lines", async () => {
    const idx = await loadSectionIndex(makeRepo(CONTEXT_FIXTURE, { git: false }));
    const auth = idx.byId.get("auth");
    expect(auth?.file).toBe(".context/spec.md");
    expect(auth?.line).toBe(3);
    expect(auth?.body).toBe("Users sign in with passkeys (`src/auth/login.ts`).");
    expect(idx.byId.get("billing")?.line).toBe(8);
    expect(idx.byId.get("state")?.file).toBe(".context/STATE.md");
    expect(idx.byId.get("state")?.line).toBe(1);
  });

  it("parses CRLF like LF", async () => {
    const files = Object.fromEntries(
      Object.entries(CONTEXT_FIXTURE).map(([k, v]) => [
        k,
        k.endsWith(".md") ? v.replace(/\n/g, "\r\n") : v,
      ]),
    );
    const idx = await loadSectionIndex(makeRepo(files, { git: false }));
    expect(ids(idx)).toEqual(SEVEN_IDS);
    expect(idx.byId.get("auth")?.line).toBe(3);
    for (const s of idx.sections) {
      expect(s.body).not.toContain("\r");
      expect(s.title).not.toContain("\r");
    }
  });

  it("strips a UTF-8 BOM", async () => {
    const root = makeRepo(CONTEXT_FIXTURE, { git: false });
    for (const rel of [".context/STATE.md", ".context/knowledge/windows.md", ".context/spec.md"]) {
      const abs = join(root, rel);
      writeFileSync(abs, `﻿${readFileSync(abs, "utf8")}`);
    }
    const idx = await loadSectionIndex(root);
    expect(ids(idx)).toEqual(SEVEN_IDS);
    for (const s of idx.sections) {
      expect(s.title).not.toContain("﻿");
      expect(s.body).not.toContain("﻿");
    }
  });

  it("rejects duplicate ids across files in strict mode", async () => {
    const root = makeRepo({ ...CONTEXT_FIXTURE, ...DUP }, { git: false });
    const err = await loadSectionIndex(root).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BatonError);
    expect((err as BatonError).exitCode).toBe(1);
    expect((err as BatonError).message).toContain('duplicate section id "auth"');
    expect((err as BatonError).message).toContain(".context/spec.md:3");
  });

  it("keeps the first duplicate in lenient mode", async () => {
    const root = makeRepo({ ...CONTEXT_FIXTURE, ...DUP }, { git: false });
    const idx = await loadSectionIndex(root, { lenient: true });
    expect(idx.byId.get("auth")?.file).toBe(".context/spec.md");
    expect(idx.problems).toHaveLength(1);
    expect(idx.problems[0]?.file).toBe(".context/knowledge/dup.md");
  });

  it("skips a broken file in lenient mode", async () => {
    const root = makeRepo(
      {
        ...CONTEXT_FIXTURE,
        ".context/rules.md": CONTEXT_FIXTURE[".context/rules.md"].replace(
          "kind: rule",
          "kind: vibes",
        ),
      },
      { git: false },
    );
    const idx = await loadSectionIndex(root, { lenient: true });
    expect(idx.byId.has("rules-project")).toBe(false);
    expect(idx.problems[0]?.file).toBe(".context/rules.md");
    expect(idx.byId.has("auth")).toBe(true);
    const err = await loadSectionIndex(root).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BatonError);
    expect((err as BatonError).exitCode).toBe(1);
  });

  it("problem messages are one line and name the file", async () => {
    const root = makeRepo(
      {
        ...CONTEXT_FIXTURE,
        ".context/knowledge/bad.md": "---\nid: [unclosed\nkind: knowledge\n---\n# Bad\n",
      },
      { git: false },
    );
    const idx = await loadSectionIndex(root, { lenient: true });
    const p = idx.problems.find((x) => x.file === ".context/knowledge/bad.md");
    expect(p).toBeDefined();
    expect(p?.message.startsWith(".context/knowledge/bad.md")).toBe(true);
    expect(p?.message).not.toContain("\n");
  });

  it("returns an empty index without .context/", async () => {
    const root = makeTempDir();
    const idx = await loadSectionIndex(root);
    expect(idx.sections).toEqual([]);
    expect(idx.problems).toEqual([]);
    expect(idx.byId.size).toBe(0);
  });
});

describe("supersededByFromStatus", () => {
  it("reads the successor from the MADR status", () => {
    expect(supersededByFromStatus("superseded by ADR-0009")).toBe("adr-0009");
    expect(supersededByFromStatus("Superseded by 12")).toBe("adr-0012");
    expect(supersededByFromStatus("accepted")).toBeUndefined();
  });
});
