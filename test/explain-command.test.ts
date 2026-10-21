import { existsSync } from "node:fs";
import { join, win32 } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { displayPath } from "../src/commands/explain.js";
import { buildProgram } from "../src/program.js";
import { makeFixture, makeTempDir } from "./helpers/explain-fixture.js";

let out: string;
let err: string;
let cwd: string;
let savedHome: string | undefined;
let savedExit: typeof process.exitCode;

beforeEach(async () => {
  out = "";
  err = "";
  cwd = process.cwd();
  savedHome = process.env.BATON_HOME;
  savedExit = process.exitCode;
  process.exitCode = undefined;
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    err += String(chunk);
    return true;
  });
  process.env.BATON_HOME = await makeTempDir("baton-home-");
  process.chdir(await makeFixture());
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(cwd);
  if (savedHome === undefined) delete process.env.BATON_HOME;
  else process.env.BATON_HOME = savedHome;
  process.exitCode = savedExit;
});

async function run(...args: string[]): Promise<void> {
  await buildProgram()
    .exitOverride()
    .parseAsync(["node", "baton", ...args]);
}

describe("baton explain", () => {
  it("prints text with the chosen template", async () => {
    await run("explain", "supabase", "--as", "caveman");
    expect(out).toContain("Template: caveman (builtin)");
    expect(out.endsWith("\n")).toBe(true);
    expect(process.exitCode ?? 0).toBe(0);
    expect(err).toBe("");
  });

  it("joins variadic words into one query", async () => {
    await run("explain", "no", "such", "thing", "--format", "json");
    expect(JSON.parse(out)).toMatchObject({ status: "none", query: "no such thing" });
    expect(err).toBe("");
  });

  it("json format parses", async () => {
    await run("explain", "supabase", "--format", "json");
    expect(JSON.parse(out).status).toBe("ok");
    expect(err).toBe("");
  });

  it("rejects an unknown format", async () => {
    await run("explain", "supabase", "--format", "xml");
    expect(process.exitCode).toBe(1);
    expect(err).toContain("format");
  });

  it("creates then uses a custom template", async () => {
    await run("explain", "-c", "hackathon judge", "-p", "Pitch it.");
    const created = out.split("\n").filter((l) => l.startsWith("created "));
    expect(created).toHaveLength(2);
    expect(created[0]).toBe("created .context/explain/hackathon-judge.md");
    expect(created[1]).toBe("created ~/.baton/explain/hackathon-judge.md");

    out = "";
    await run("explain", "supabase", "--as", "hackathon judge");
    expect(out).toContain("Template: hackathon-judge (project)");
    expect(err).toBe("");
  });

  it("create honours --scope", async () => {
    await run("explain", "-c", "solo", "-p", "Be brief.", "--scope", "project");
    expect(out).toBe("created .context/explain/solo.md\n");
    expect(err).toBe("");
  });

  it("create --scope personal writes only the personal file", async () => {
    await run("explain", "-c", "mine", "-p", "Be brief.", "--scope", "personal");
    expect(out).toBe("created ~/.baton/explain/mine.md\n");
    expect(err).toBe("");
    const personal = join(process.env.BATON_HOME as string, ".baton", "explain", "mine.md");
    expect(existsSync(personal)).toBe(true);
    expect(existsSync(join(process.cwd(), ".context", "explain", "mine.md"))).toBe(false);
  });

  it("create twice without --force exits 2, with --force succeeds", async () => {
    await run("explain", "-c", "twice", "-p", "One.");
    process.exitCode = undefined;
    await run("explain", "-c", "twice", "-p", "Two.");
    expect(process.exitCode).toBe(2);
    expect(err).toContain("already exists");

    process.exitCode = undefined;
    err = "";
    await run("explain", "-c", "twice", "-p", "Two.", "--force");
    expect(process.exitCode ?? 0).toBe(0);
    expect(err).toBe("");
  });

  it("create without --prompt exits 1", async () => {
    await run("explain", "-c", "nope");
    expect(process.exitCode).toBe(1);
    expect(err).toContain("--prompt");
  });

  it("a bad --scope exits 1", async () => {
    await run("explain", "-c", "x", "-p", "y", "--scope", "galaxy");
    expect(process.exitCode).toBe(1);
    expect(err).toContain("scope");
  });

  it("deletes a custom template and prints the removed paths", async () => {
    await run("explain", "-c", "gone", "-p", "Bye.");
    out = "";
    await run("explain", "--delete", "gone");
    expect(out).toContain("removed .context/explain/gone.md");
    expect(out).toContain("removed ~/.baton/explain/gone.md");
    expect(process.exitCode ?? 0).toBe(0);
    expect(err).toBe("");
  });

  it("deleting a built-in exits 2", async () => {
    await run("explain", "--delete", "caveman");
    expect(process.exitCode).toBe(2);
    expect(err).toContain('"caveman" is a built-in template and cannot be deleted');
  });

  it("tie exits 2 and still prints to stdout", async () => {
    await run("explain", "index.ts");
    expect(process.exitCode).toBe(2);
    expect(out).toContain("Ambiguous");
    expect(err).toBe("");
  });

  it("no match exits 1 and still prints to stdout", async () => {
    await run("explain", "zzzzqqqq");
    expect(process.exitCode).toBe(1);
    expect(out).toContain("Nothing named");
    expect(err).toBe("");
  });

  it("no mode exits 1", async () => {
    await run("explain");
    expect(process.exitCode).toBe(1);
    expect(err).toContain("use one of: explain <thing>, --create, --delete, --templates");
  });

  it("several modes exit 1", async () => {
    await run("explain", "supabase", "--templates");
    expect(process.exitCode).toBe(1);
    expect(err).toContain("use one of");
  });

  it("--templates lists built-ins", async () => {
    await run("explain", "--templates");
    expect(out).toContain("caveman  builtin");
    expect(err).toBe("");
  });

  it("--templates shows the project source for an override", async () => {
    await run("explain", "-c", "caveman", "-p", "Custom caveman.", "--scope", "project");
    out = "";
    await run("explain", "--templates");
    expect(out).toMatch(/^caveman {2}project {2}Custom caveman\.$/m);
    expect(err).toBe("");
  });
});

/** Write a Windows path with backslashes from a forward-slash spelling. */
const w = (p: string): string => p.replaceAll("/", String.fromCharCode(92));

describe("displayPath", () => {
  const drives = {
    root: w("N:/coding/proj"),
    home: w("C:/Users/jeswi"),
    personalDir: w("C:/Users/jeswi/.baton/explain"),
  };

  it("prints ~ for the personal dir when project and home are on different drives", () => {
    expect(displayPath(w("C:/Users/jeswi/.baton/explain/x.md"), drives, win32)).toBe(
      "~/.baton/explain/x.md",
    );
    expect(displayPath(w("N:/coding/proj/.context/explain/x.md"), drives, win32)).toBe(
      ".context/explain/x.md",
    );
  });

  it("keeps project paths project-relative when the project is nested under home", () => {
    const nested = { ...drives, root: w("C:/Users/jeswi/proj") };
    expect(displayPath(w("C:/Users/jeswi/proj/.context/explain/x.md"), nested, win32)).toBe(
      ".context/explain/x.md",
    );
    expect(displayPath(w("C:/Users/jeswi/.baton/explain/x.md"), nested, win32)).toBe(
      "~/.baton/explain/x.md",
    );
  });

  it("prints the full path for a path outside both dirs", () => {
    expect(displayPath(w("D:/elsewhere/x.md"), drives, win32)).toBe("D:/elsewhere/x.md");
  });
});
