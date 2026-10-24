import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requireContext } from "../src/commands/_shared.js";
import { type FreshnessReport, failingSections, type SectionFreshness } from "../src/core/drift.js";
import { BatonError } from "../src/core/errors.js";
import type { IndexedSection } from "../src/core/sections.js";
import type { FreshnessLevel } from "../src/core/types.js";
import { runCli } from "./helpers/cli.js";
import {
  commitAll,
  makeRepo,
  makeTempDir,
  runGit,
  stampFixture,
  writeFiles,
} from "./helpers/repo.js";

function fakeSection(id: string, level: FreshnessLevel): SectionFreshness {
  const section = {
    meta: { id, kind: "intent", verifiedAt: null, sourcePaths: [] },
    title: id,
    body: "",
    file: ".context/spec.md",
    line: 1,
    doc: "spec",
  } satisfies IndexedSection;
  return {
    section,
    result: { level, commitsSince: 0, reason: level },
    deadRefs: [],
    commitsOutsideContext: null,
  };
}

function fakeReport(): FreshnessReport {
  const levels: FreshnessLevel[] = ["fresh", "aging", "stale", "unverified", "superseded"];
  return {
    head: null,
    sections: levels.map((l) => fakeSection(l, l)),
    counts: { fresh: 1, aging: 1, stale: 1, unverified: 1, superseded: 1 },
  };
}

function stampedFixture(): string {
  const root = makeRepo();
  const sha = commitAll(root, "base");
  stampFixture(root, sha.slice(0, 12));
  commitAll(root, "stamp");
  return root;
}

function logLines(root: string): { event: string; id: string; level: string; bodyHash: string }[] {
  const file = join(root, ".context", ".cache", "drift.jsonl");
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l));
}

describe("failingSections", () => {
  it("aging fails aging, stale and unverified", () => {
    const ids = failingSections(fakeReport(), "aging").map((s) => s.section.meta.id);
    expect(ids).toEqual(["aging", "stale", "unverified"]);
  });

  it("stale fails stale and unverified", () => {
    const ids = failingSections(fakeReport(), "stale").map((s) => s.section.meta.id);
    expect(ids).toEqual(["stale", "unverified"]);
  });
});

describe("requireContext", () => {
  it("throws a BatonError with exit 1 without .context/", () => {
    try {
      requireContext(makeTempDir());
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(BatonError);
      expect((err as BatonError).exitCode).toBe(1);
    }
  });

  it("passes with .context/", () => {
    expect(() => requireContext(makeRepo())).not.toThrow();
  });
});

describe("baton drift", () => {
  it("prints a summary and a line per non-fresh section", async () => {
    const root = makeRepo();
    const r = await runCli(["drift"], root);
    expect(
      r.stdout.startsWith("7 sections: 0 fresh, 0 aging, 0 stale, 6 unverified, 1 superseded"),
    ).toBe(true);
    expect(r.stdout).toContain("UNVERIFIED  auth  .context/spec.md:3  never verified");
    expect(r.stdout).toContain(
      "SUPERSEDED  adr-0002  .context/decisions/0002-use-passwords.md:1  superseded by adr-0001",
    );
    expect(r.exitCode).toBe(0);
  });

  it("JSON lists every section", async () => {
    const r = await runCli(["drift", "--format", "json"], makeRepo());
    const json = JSON.parse(r.stdout);
    expect(json.sections).toHaveLength(7);
    const auth = json.sections.find((s: { id: string }) => s.id === "auth");
    expect(auth.level).toBe("unverified");
    expect(auth.line).toBe(3);
  });

  it("flags aging sections after a source change and logs them", async () => {
    const root = stampedFixture();
    writeFiles(root, { "src/auth/login.ts": "export const login = 2;\n" });
    commitAll(root, "change");

    const first = await runCli(["drift"], root);
    expect(first.stdout.split("\n")[0]).toBe(
      "7 sections: 4 fresh, 2 aging, 0 stale, 0 unverified, 1 superseded",
    );

    const lines = logLines(root);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.event === "flag")).toBe(true);
    expect(lines.map((l) => l.id).sort()).toEqual(["auth", "knowledge-windows"]);
    expect(lines.every((l) => l.level === "aging")).toBe(true);
    expect(lines.every((l) => /^[0-9a-f]{12}$/.test(l.bodyHash))).toBe(true);

    await runCli(["drift"], root);
    expect(logLines(root)).toHaveLength(4);
  });

  it("does not log unverified sections", async () => {
    const root = makeRepo();
    await runCli(["drift"], root);
    const file = join(root, ".context", ".cache", "drift.jsonl");
    expect(!existsSync(file) || readFileSync(file, "utf8") === "").toBe(true);
  });

  it("--fail-on stale exits 2 on unverified sections", async () => {
    const r = await runCli(["drift", "--fail-on", "stale"], makeRepo());
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("at or beyond stale");
  });

  it("--fail-on aging passes when everything is fresh", async () => {
    const r = await runCli(["drift", "--fail-on", "aging"], stampedFixture());
    expect(r.exitCode).toBe(0);
  });

  it("rejects a bad --fail-on", async () => {
    const r = await runCli(["drift", "--fail-on", "bogus"], makeRepo());
    expect(r.exitCode).toBe(1);
  });

  it("needs .context/", async () => {
    const dir = makeTempDir();
    runGit(dir, "init", "-q");
    const r = await runCli(["drift"], dir);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("run `baton init`");
  });

  it("rejects duplicate ids", async () => {
    const root = makeRepo();
    writeFiles(root, {
      ".context/knowledge/dup.md": "---\nid: auth\nkind: knowledge\n---\n# Dup\n",
    });
    const r = await runCli(["drift"], root);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('duplicate section id "auth"');
  });
});
