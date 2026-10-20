import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { BatonError } from "../src/core/errors.js";
import {
  createTemplate,
  DEFAULT_TEMPLATE,
  deleteTemplate,
  listTemplates,
  resolveTemplate,
  templateDirs,
} from "../src/core/explain/templates.js";
import { parseFrontmatter } from "../src/core/frontmatter.js";

function freshDirs() {
  const base = mkdtempSync(join(tmpdir(), "baton-explain-"));
  return templateDirs(join(base, "repo"), join(base, "home"));
}

async function exitCodeOf(p: Promise<unknown>): Promise<number | undefined> {
  try {
    await p;
  } catch (e) {
    if (e instanceof BatonError) return e.exitCode;
    throw e;
  }
  return undefined;
}

const both = { scope: "both", force: false } as const;
const projectOnly = { scope: "project", force: false } as const;
const personalOnly = { scope: "personal", force: false } as const;

describe("explain templates", () => {
  it("derives the project and personal dirs", () => {
    const dirs = templateDirs("/r", "/h");
    expect(dirs.project.replace(/\\/g, "/")).toMatch(/\/r\/\.context\/explain$/);
    expect(dirs.personal.replace(/\\/g, "/")).toMatch(/\/h\/\.baton\/explain$/);
  });

  it("lists the five built-ins with student as default", async () => {
    const dirs = freshDirs();
    const names = (await listTemplates(dirs)).map((t) => t.name);
    expect(names).toEqual(["baby", "caveman", "engineer", "pitch", "student"]);
    expect(DEFAULT_TEMPLATE).toBe("student");
  });

  it("creates in both scopes by default", async () => {
    const dirs = freshDirs();
    const paths = await createTemplate(dirs, "Hackathon Judge", "Pitch to a judge.", both);
    expect(paths).toHaveLength(2);
    for (const p of paths) {
      expect(basename(p)).toBe("hackathon-judge.md");
      expect(existsSync(p)).toBe(true);
    }
    const { data, body } = parseFrontmatter(readFileSync(paths[0] as string, "utf8"));
    expect(data.name).toBe("hackathon-judge");
    expect(data.description).toBe("Pitch to a judge.");
    expect(body.trim()).toBe("Pitch to a judge.");
  });

  it("resolves every name form", async () => {
    const dirs = freshDirs();
    await createTemplate(dirs, "Hackathon Judge", "Pitch to a judge.", both);
    expect((await resolveTemplate(dirs, "hackathon judge")).name).toBe("hackathon-judge");
    expect((await resolveTemplate(dirs, "hackathon-judge")).name).toBe("hackathon-judge");
    expect((await resolveTemplate(dirs, "Hackathon Judge")).name).toBe("hackathon-judge");
  });

  it("project beats personal beats built-in", async () => {
    const dirs = freshDirs();
    await createTemplate(dirs, "caveman", "P", personalOnly);
    await createTemplate(dirs, "caveman", "Q", projectOnly);
    let t = await resolveTemplate(dirs, "caveman");
    expect(t.prompt).toBe("Q");
    expect(t.source).toBe("project");

    await deleteTemplate(dirs, "caveman", "project");
    t = await resolveTemplate(dirs, "caveman");
    expect(t.prompt).toBe("P");
    expect(t.source).toBe("personal");

    await deleteTemplate(dirs, "caveman", "personal");
    t = await resolveTemplate(dirs, "caveman");
    expect(t.source).toBe("builtin");
  });

  it("lists one entry per name with precedence applied", async () => {
    const dirs = freshDirs();
    await createTemplate(dirs, "caveman", "Q", projectOnly);
    await createTemplate(dirs, "zeta", "Z", personalOnly);
    const all = await listTemplates(dirs);
    expect(all.map((t) => t.name)).toEqual([
      "baby",
      "caveman",
      "engineer",
      "pitch",
      "student",
      "zeta",
    ]);
    expect(all.find((t) => t.name === "caveman")?.source).toBe("project");
    expect(all.find((t) => t.name === "zeta")?.source).toBe("personal");
  });

  it("refuses to overwrite without --force", async () => {
    const dirs = freshDirs();
    await createTemplate(dirs, "x", "one", personalOnly);
    expect(await exitCodeOf(createTemplate(dirs, "x", "two", both))).toBe(2);
    // The refused call wrote nothing to the project scope.
    expect(existsSync(join(dirs.project, "x.md"))).toBe(false);
    await createTemplate(dirs, "x", "two", { scope: "both", force: true });
    expect((await resolveTemplate(dirs, "x")).prompt).toBe("two");
  });

  it("refuses empty prompt and empty name", async () => {
    const dirs = freshDirs();
    expect(await exitCodeOf(createTemplate(dirs, "ok", "   ", both))).toBe(1);
    expect(await exitCodeOf(createTemplate(dirs, "  ", "prompt", both))).toBe(1);
    expect(await exitCodeOf(createTemplate(dirs, "!!!", "prompt", both))).toBe(1);
  });

  it("errors on an unknown template and lists what is available", async () => {
    const dirs = freshDirs();
    const err = await resolveTemplate(dirs, "nope").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BatonError);
    expect((err as BatonError).exitCode).toBe(1);
    expect((err as BatonError).message).toContain('unknown template "nope"');
    expect((err as BatonError).message).toContain(
      "available: baby, caveman, engineer, pitch, student",
    );
  });

  it("cannot delete a built-in", async () => {
    const dirs = freshDirs();
    expect(await exitCodeOf(deleteTemplate(dirs, "student", "both"))).toBe(2);
  });

  it("deleting a missing custom name is an error", async () => {
    const dirs = freshDirs();
    expect(await exitCodeOf(deleteTemplate(dirs, "ghost", "both"))).toBe(1);
  });

  it("deletes from both scopes and returns the removed paths", async () => {
    const dirs = freshDirs();
    await createTemplate(dirs, "gone", "bye", both);
    const removed = await deleteTemplate(dirs, "gone", "both");
    expect(removed).toHaveLength(2);
    for (const p of removed) expect(existsSync(p)).toBe(false);
  });

  it("creates .context/explain when missing", async () => {
    const dirs = freshDirs();
    expect(existsSync(dirs.project)).toBe(false);
    const paths = await createTemplate(dirs, "fresh", "hello", projectOnly);
    expect(paths).toHaveLength(1);
    expect(existsSync(dirs.project)).toBe(true);
  });

  it("description is the prompt's first line, max 80 chars", async () => {
    const dirs = freshDirs();
    await createTemplate(dirs, "multi", "First line here.\nSecond line.", projectOnly);
    expect((await resolveTemplate(dirs, "multi")).description).toBe("First line here.");

    await createTemplate(dirs, "long", "a".repeat(120), projectOnly);
    expect((await resolveTemplate(dirs, "long")).description).toHaveLength(80);
  });

  it("round-trips prompts whose first line needs YAML quoting", async () => {
    const dirs = freshDirs();
    const prompt = 'Note: use # carefully - "quotes" too\nbody';
    await createTemplate(dirs, "tricky", prompt, projectOnly);
    const t = await resolveTemplate(dirs, "tricky");
    expect(t.prompt).toBe(prompt);
    expect(t.description).toBe('Note: use # carefully - "quotes" too');
  });

  it("reads a template file with CRLF line endings", async () => {
    const dirs = freshDirs();
    mkdirSync(dirs.project, { recursive: true });
    writeFileSync(
      join(dirs.project, "crlf-one.md"),
      "---\r\nname: crlf-one\r\ndescription: Windows made\r\n---\r\nLine one.\r\nLine two.\r\n",
    );
    const t = await resolveTemplate(dirs, "crlf one");
    expect(t.name).toBe("crlf-one");
    expect(t.description).toBe("Windows made");
    expect(t.source).toBe("project");
    expect(t.prompt).toBe("Line one.\nLine two.");
  });

  it("uses the filename slug as the name and the body as the prompt", async () => {
    const dirs = freshDirs();
    mkdirSync(dirs.personal, { recursive: true });
    writeFileSync(join(dirs.personal, "plain.md"), "Just a body.\n");
    const t = await resolveTemplate(dirs, "plain");
    expect(t.name).toBe("plain");
    expect(t.prompt).toBe("Just a body.");
    expect(t.description).toBe("Just a body.");
  });
});
