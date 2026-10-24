import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acceptDecision,
  createDecision,
  findAdrFile,
  listDecisions,
  repoQueryPaths,
  rewriteRecord,
} from "../src/core/decide.js";
import { PLACEHOLDERS, statusOf } from "../src/core/decisions.js";
import { loadSectionIndex } from "../src/core/sections.js";
import { runCli } from "./helpers/cli.js";
import { makeRepo, makeTempDir, runGit } from "./helpers/repo.js";

const ADR1 = ".context/decisions/0001-use-passkeys.md";
const ADR3 = ".context/decisions/0003-use-webauthn-for-login.md";
const NOW = new Date("2026-10-21T12:00:00Z");
const BOM = String.fromCharCode(0xfeff);

const read = (root: string, rel: string) => readFileSync(join(root, rel), "utf8");
const decisionsDir = (root: string) => readdirSync(join(root, ".context", "decisions")).sort();

function proposal(over: Record<string, unknown> = {}) {
  return {
    title: "Use WebAuthn for login",
    status: "proposed" as const,
    specIds: ["auth"],
    paths: ["src/auth/**"],
    considered: [],
    consequences: [],
    deciders: ["tester"],
    now: NOW,
    ...over,
  };
}

function fillPlaceholders(root: string, rel: string): void {
  let text = read(root, rel);
  for (const value of Object.values(PLACEHOLDERS)) text = text.replaceAll(value, "Filled in.");
  writeFileSync(join(root, rel), text);
}

/** The line numbers where two texts of equal line count differ. */
function differingLines(a: string, b: string): number[] {
  const x = a.split("\n");
  const y = b.split("\n");
  expect(y.length).toBe(x.length);
  return x.flatMap((line, i) => (line === y[i] ? [] : [i]));
}

let savedActor: string | undefined;
beforeEach(() => {
  savedActor = process.env.BATON_ACTOR;
  process.env.BATON_ACTOR = "tester";
});
afterEach(() => {
  if (savedActor === undefined) delete process.env.BATON_ACTOR;
  else process.env.BATON_ACTOR = savedActor;
});

describe("createDecision", () => {
  it("creates a proposed record", async () => {
    const root = makeRepo();
    const before = read(root, ADR1);
    const r = await createDecision(root, proposal());
    expect(r.number).toBe(3);
    expect(r.file).toBe(ADR3);
    expect(r.placeholders).toBe(true);
    const text = read(root, ADR3);
    expect(text).toContain("status: proposed");
    expect(text).toContain("verified_at: null");
    expect(text).toContain('source_paths: ["src/auth/**"]');
    expect(text).toContain("spec_sections: [auth]");
    expect(text).toContain(
      "Preflight at creation (baton decide): 1 constraining, 2 related, 0 possibly related.",
    );
    expect(text).toContain(
      '* constrains: ADR 0001 (accepted) "Use passkeys for sign-in" (spec: auth)',
    );
    expect(read(root, ADR1)).toBe(before);
  });

  it("accepted at creation is stamped", async () => {
    const root = makeRepo();
    const r = await createDecision(
      root,
      proposal({ title: "Keep passwords out", status: "accepted", context: "C.", outcome: "O." }),
    );
    const head12 = runGit(root, "rev-parse", "HEAD").slice(0, 12);
    expect(read(root, r.file)).toContain(`verified_at: "${head12}"`);
    expect(r.placeholders).toBe(false);
  });

  it("accepted needs context and outcome", async () => {
    const root = makeRepo();
    const before = decisionsDir(root);
    await expect(
      createDecision(root, proposal({ status: "accepted", context: "C." })),
    ).rejects.toMatchObject({ exitCode: 1 });
    expect(decisionsDir(root)).toEqual(before);
  });

  it("unknown spec ids write nothing", async () => {
    const root = makeRepo();
    const before = decisionsDir(root);
    await expect(createDecision(root, proposal({ specIds: ["ghost"] }))).rejects.toMatchObject({
      exitCode: 1,
      message: expect.stringContaining("ghost"),
    });
    expect(decisionsDir(root)).toEqual(before);
  });

  it("rejects a blank or multi-line title and one with no letters", async () => {
    const root = makeRepo();
    for (const title of ["  ", "a\nb"]) {
      await expect(createDecision(root, proposal({ title }))).rejects.toMatchObject({
        exitCode: 1,
        message: "a decision needs a one-line title",
      });
    }
    await expect(createDecision(root, proposal({ title: "!!!" }))).rejects.toMatchObject({
      exitCode: 1,
      message: "title has no letters or digits",
    });
  });

  it("notes load-bearing sections", async () => {
    const root = makeRepo();
    const spec = read(root, ".context/spec.md").replace(
      "Stripe, monthly only.",
      "Stripe, monthly only (load-bearing).",
    );
    writeFileSync(join(root, ".context", "spec.md"), spec);
    const r = await createDecision(root, proposal({ specIds: ["billing"], paths: [] }));
    expect(r.notes.join("\n")).toContain("spec section billing is load-bearing");
  });
});

describe("acceptDecision", () => {
  it("refuses placeholders, then accepts and changes only status and verified_at", async () => {
    const root = makeRepo();
    await createDecision(root, proposal());
    await expect(acceptDecision(root, 3)).rejects.toMatchObject({
      exitCode: 2,
      message: expect.stringContaining("placeholders (context, option, outcome, good, bad)"),
    });
    fillPlaceholders(root, ADR3);
    const before = read(root, ADR3);
    const r = await acceptDecision(root, 3);
    expect(r).toEqual({ number: 3, file: ADR3 });
    const after = read(root, ADR3);
    const head12 = runGit(root, "rev-parse", "HEAD").slice(0, 12);
    const changed = differingLines(before, after);
    expect(changed.map((i) => after.split("\n")[i])).toEqual([
      "status: accepted",
      `verified_at: "${head12}"`,
    ]);
  });

  it("refuses a non-proposed record", async () => {
    const root = makeRepo();
    await expect(acceptDecision(root, 1)).rejects.toMatchObject({
      exitCode: 2,
      message: expect.stringContaining("ADR 0001 is accepted"),
    });
  });

  it("reports a missing record", async () => {
    const root = makeRepo();
    await expect(acceptDecision(root, 9)).rejects.toMatchObject({
      exitCode: 1,
      message: "no ADR 0009",
    });
  });
});

describe("supersede", () => {
  it("at acceptance rewrites only the old record's status line", async () => {
    const root = makeRepo();
    const old = read(root, ADR1);
    const r = await createDecision(
      root,
      proposal({
        title: "Passkeys v2",
        status: "accepted",
        supersedes: 1,
        context: "C.",
        outcome: "O.",
      }),
    );
    expect(r.superseded).toEqual({ number: 1, file: ADR1 });
    const now = read(root, ADR1);
    expect(statusOf(now)).toBe("superseded by ADR-0003");
    const changed = differingLines(old, now);
    expect(changed).toHaveLength(1);
    expect(now.split("\n")[changed[0] ?? 0]).toMatch(/^status:/);
    expect(read(root, r.file)).toContain('supersedes: "0001"');
    const index = await loadSectionIndex(root);
    expect(index.byId.get("adr-0001")?.meta.supersededBy).toBe("adr-0003");
  });

  it("a proposed successor leaves the old record alone until accepted", async () => {
    const root = makeRepo();
    const old = read(root, ADR1);
    const r = await createDecision(root, proposal({ supersedes: 1 }));
    expect(r.superseded).toBeUndefined();
    expect(read(root, ADR1)).toBe(old);
    fillPlaceholders(root, r.file);
    const accepted = await acceptDecision(root, 3);
    expect(accepted.superseded).toEqual({ number: 1, file: ADR1 });
    expect(statusOf(read(root, ADR1))).toBe("superseded by ADR-0003");
  });

  it("cannot supersede twice or a missing record, and writes nothing", async () => {
    const root = makeRepo();
    const before = decisionsDir(root);
    await expect(createDecision(root, proposal({ supersedes: 2 }))).rejects.toMatchObject({
      exitCode: 2,
    });
    await expect(createDecision(root, proposal({ supersedes: 9 }))).rejects.toMatchObject({
      exitCode: 1,
      message: "no ADR 0009",
    });
    expect(decisionsDir(root)).toEqual(before);
  });

  it("keeps CRLF and BOM on the old record", async () => {
    const root = makeRepo();
    const original = read(root, ADR1);
    writeFileSync(join(root, ADR1), BOM + original.replace(/\n/g, "\r\n"));
    await createDecision(
      root,
      proposal({ status: "accepted", supersedes: 1, context: "C.", outcome: "O." }),
    );
    const raw = read(root, ADR1);
    expect(raw.startsWith(BOM)).toBe(true);
    expect(/(^|[^\r])\n/.test(raw)).toBe(false);
    const lf = raw.slice(1).replace(/\r\n/g, "\n");
    expect(differingLines(original, lf)).toHaveLength(1);
    expect(statusOf(lf)).toBe("superseded by ADR-0003");
  });
});

describe("rewriteRecord and findAdrFile", () => {
  it("preserves LF-only and CRLF files", () => {
    const root = makeRepo();
    const abs = join(root, ADR1);
    rewriteRecord(abs, (t) => t.replace("accepted", "deprecated"));
    expect(read(root, ADR1)).not.toContain("\r");
    writeFileSync(abs, "a\r\nb\r\n");
    rewriteRecord(abs, (t) => `${t}c\n`);
    expect(read(root, ADR1)).toBe("a\r\nb\r\nc\r\n");
  });

  it("finds a file by number, null when absent, throws when ambiguous", async () => {
    const root = makeRepo();
    expect(await findAdrFile(root, 1)).toBe(ADR1);
    expect(await findAdrFile(root, 7)).toBeNull();
    writeFileSync(join(root, ".context", "decisions", "0001-other.md"), "x\n");
    await expect(findAdrFile(root, 1)).rejects.toMatchObject({
      exitCode: 1,
      message: expect.stringContaining("ADR 0001 has several files"),
    });
  });
});

describe("listDecisions", () => {
  it("lists records in number order", async () => {
    const rows = await listDecisions(makeRepo());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ number: 1, status: "accepted" });
    expect(rows[1]).toMatchObject({ number: 2, status: "superseded by ADR-0001" });
  });
});

describe("repoQueryPaths", () => {
  it("makes absolute paths root-relative and drops outside ones", () => {
    const root = makeRepo();
    expect(
      repoQueryPaths(root, [
        join(root, "src", "auth", "login.ts"),
        `${root}/src/auth/x.ts`,
        String.raw`.\src\auth\**`,
        join(root, "..", "elsewhere.ts"),
        " ",
      ]),
    ).toEqual(["src/auth/login.ts", "src/auth/x.ts", "src/auth/**"]);
  });

  it("an absolute Windows-style path still gives the path relation", async () => {
    const root = makeRepo();
    const r = await runCli(
      ["decide", "--preflight", "--paths", join(root, "src", "auth", "login.ts")],
      root,
    );
    expect(r.stdout).toContain("path: src/auth/login.ts");
    expect(r.stdout).toContain("spec auth");
  });
});

describe("baton decide", () => {
  it("creates a record and prints the report", async () => {
    const root = makeRepo();
    const r = await runCli(
      [
        "decide",
        "Use WebAuthn for login",
        "--spec",
        "auth",
        "--paths",
        "src/auth/**",
        "--deciders",
        "tester",
      ],
      root,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.startsWith(`created ADR 0003 (proposed): ${ADR3}`)).toBe(true);
    expect(r.stdout).toContain("CONSTRAINS  ADR 0001");
    expect(r.stdout).toContain("next: replace the {…} placeholders");
    expect(read(root, ADR3)).toContain("decision-makers: [tester]");
  });

  it("--preflight exits 2 when something constrains, and writes nothing", async () => {
    const root = makeRepo();
    const before = decisionsDir(root);
    const r = await runCli(["decide", "Use WebAuthn", "--preflight", "--spec", "auth"], root);
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toContain("preflight: 1 constraining");
    expect(r.stderr).toContain("constrain this change");
    expect(decisionsDir(root)).toEqual(before);
  });

  it("--preflight with --supersedes exits 0", async () => {
    const r = await runCli(
      ["decide", "Use WebAuthn", "--preflight", "--spec", "auth", "--supersedes", "1"],
      makeRepo(),
    );
    expect(r.exitCode).toBe(0);
  });

  it("--preflight with nothing else exits 1", async () => {
    expect((await runCli(["decide", "--preflight"], makeRepo())).exitCode).toBe(1);
  });

  it("--accept: exit codes", async () => {
    const root = makeRepo();
    expect((await runCli(["decide", "--accept", "1"], root)).exitCode).toBe(2);
    expect((await runCli(["decide", "--accept", "x"], root)).exitCode).toBe(1);
    expect((await runCli(["decide", "--accept", "1", "title"], root)).exitCode).toBe(1);
  });

  it("--accept accepts a filled-in proposal and reports the superseded record", async () => {
    const root = makeRepo();
    await runCli(["decide", "Use WebAuthn for login", "--supersedes", "1"], root);
    fillPlaceholders(root, ADR3);
    const r = await runCli(["decide", "--accept", "3"], root);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(`accepted ADR 0003: ${ADR3}`);
    expect(r.stdout).toContain("marked ADR 0001 superseded by ADR 0003");
  });

  it("no arguments lists the records", async () => {
    const r = await runCli(["decide"], makeRepo());
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("0001  accepted  Use passkeys for sign-in\n");
    expect(r.stdout).toContain("0002  superseded by ADR-0001  Use passwords\n");
  });

  it("creation options without a title exit 1 and write nothing", async () => {
    const root = makeRepo();
    const before = decisionsDir(root);
    for (const args of [
      ["decide", "--supersedes", "1"],
      ["decide", "--spec", "auth"],
    ]) {
      const r = await runCli(args, root);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain("a decision needs a title");
      expect(r.stdout).toBe("");
    }
    expect(decisionsDir(root)).toEqual(before);
  });

  it("an unknown status exits 1", async () => {
    const r = await runCli(["decide", "X", "--status", "maybe"], makeRepo());
    expect(r.exitCode).toBe(1);
  });

  it("exits 1 without .context/", async () => {
    const dir = makeTempDir();
    runGit(dir, "init", "-q");
    expect((await runCli(["decide"], dir)).exitCode).toBe(1);
  });
});
