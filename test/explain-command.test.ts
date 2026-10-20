import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  });

  it("joins variadic words into one query", async () => {
    await run("explain", "no", "such", "thing", "--format", "json");
    expect(JSON.parse(out)).toMatchObject({ status: "none", query: "no such thing" });
  });

  it("json format parses", async () => {
    await run("explain", "supabase", "--format", "json");
    expect(JSON.parse(out).status).toBe("ok");
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
  });

  it("create honours --scope", async () => {
    await run("explain", "-c", "solo", "-p", "Be brief.", "--scope", "project");
    expect(out.split("\n").filter((l) => l.startsWith("created "))).toHaveLength(1);
  });

  it("create twice without --force exits 2, with --force succeeds", async () => {
    await run("explain", "-c", "twice", "-p", "One.");
    process.exitCode = undefined;
    await run("explain", "-c", "twice", "-p", "Two.");
    expect(process.exitCode).toBe(2);
    expect(err).toContain("already exists");

    process.exitCode = undefined;
    await run("explain", "-c", "twice", "-p", "Two.", "--force");
    expect(process.exitCode ?? 0).toBe(0);
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
  });

  it("deleting a built-in exits 2", async () => {
    await run("explain", "--delete", "caveman");
    expect(process.exitCode).toBe(2);
  });

  it("tie exits 2 and still prints to stdout", async () => {
    await run("explain", "index.ts");
    expect(process.exitCode).toBe(2);
    expect(out).toContain("Ambiguous");
  });

  it("no match exits 1 and still prints to stdout", async () => {
    await run("explain", "zzzzqqqq");
    expect(process.exitCode).toBe(1);
    expect(out).toContain("Nothing named");
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
  });

  it("--templates shows the project source for an override", async () => {
    await run("explain", "-c", "caveman", "-p", "Custom caveman.", "--scope", "project");
    out = "";
    await run("explain", "--templates");
    expect(out).toMatch(/^caveman {2}project {2}Custom caveman\.$/m);
  });
});
