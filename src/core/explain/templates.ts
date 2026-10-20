/**
 * Explain templates: the persona/prompt a `baton explain` answer is written in.
 * Three sources, highest precedence first: project (`<root>/.context/explain`),
 * personal (`<home>/.baton/explain`), built-in. One markdown file per template:
 * `---\nname: …\ndescription: …\n---\n<prompt>\n`. The filename slug is the name.
 */
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringify } from "yaml";
import { BatonError, ExitCode } from "../errors.js";
import { parseFrontmatter } from "../frontmatter.js";
import { toKey } from "./match.js";

export type TemplateSource = "project" | "personal" | "builtin";
export type Scope = "both" | "project" | "personal";

export interface Template {
  name: string;
  description: string;
  prompt: string;
  source: TemplateSource;
}

/** Absolute template directories. */
export interface TemplateDirs {
  project: string;
  personal: string;
}

export const DEFAULT_TEMPLATE = "student";

const MAX_DESCRIPTION = 80;
const NO_REASON =
  "If the repo records no reason for something, say so plainly instead of guessing one.";

function builtin(name: string, prompt: string): Template {
  return { name, description: describe(prompt), prompt, source: "builtin" };
}

export const BUILTIN_TEMPLATES: readonly Template[] = [
  builtin(
    "caveman",
    `Explain like a caveman: tiny words, short sentences, no jargon. ${NO_REASON}`,
  ),
  builtin(
    "baby",
    `Explain as if to a small child, using analogies from everyday life. ${NO_REASON}`,
  ),
  builtin(
    "student",
    `Explain to a curious beginner: plain language, and define every term the first time you use it. ${NO_REASON}`,
  ),
  builtin(
    "engineer",
    `Explain to an engineer: technical and precise, naming the files and interfaces involved. ${NO_REASON}`,
  ),
  builtin(
    "pitch",
    `Explain as a spoken pitch of about 30 seconds (about 75 words): state the problem first, then why the solution is impressive. ${NO_REASON}`,
  ),
];

export function templateDirs(root: string, home: string): TemplateDirs {
  return { project: join(root, ".context", "explain"), personal: join(home, ".baton", "explain") };
}

/** First non-empty line of a prompt, capped at 80 characters. */
function describe(prompt: string): string {
  const first = prompt.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  return first.trim().slice(0, MAX_DESCRIPTION);
}

async function readDir(dir: string, source: TemplateSource): Promise<Template[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: Template[] = [];
  for (const file of files.sort()) {
    if (!file.endsWith(".md")) continue;
    const name = toKey(file.slice(0, -".md".length));
    if (name === "") continue;
    let parsed: ReturnType<typeof parseFrontmatter>;
    try {
      parsed = parseFrontmatter(await readFile(join(dir, file), "utf8"));
    } catch {
      continue; // unreadable or malformed template files are skipped, not fatal
    }
    const prompt = parsed.body.replace(/\r\n/g, "\n").trim();
    if (prompt === "") continue;
    const description =
      typeof parsed.data.description === "string" && parsed.data.description.trim() !== ""
        ? parsed.data.description.trim()
        : describe(prompt);
    out.push({ name, description, prompt, source });
  }
  return out;
}

/** One entry per name: project beats personal beats built-in. Sorted by name. */
export async function listTemplates(dirs: TemplateDirs): Promise<Template[]> {
  const byName = new Map<string, Template>();
  const layers = [
    BUILTIN_TEMPLATES,
    await readDir(dirs.personal, "personal"),
    await readDir(dirs.project, "project"),
  ];
  for (const layer of layers) for (const t of layer) byName.set(t.name, t);
  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export async function resolveTemplate(dirs: TemplateDirs, name: string): Promise<Template> {
  const key = toKey(name);
  const all = await listTemplates(dirs);
  const hit = all.find((t) => t.name === key);
  if (!hit) {
    throw new BatonError(
      `unknown template "${name}"; available: ${all.map((t) => t.name).join(", ")}`,
    );
  }
  return hit;
}

function scopeDirs(dirs: TemplateDirs, scope: Scope): string[] {
  if (scope === "project") return [dirs.project];
  if (scope === "personal") return [dirs.personal];
  return [dirs.project, dirs.personal];
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}

export async function createTemplate(
  dirs: TemplateDirs,
  name: string,
  prompt: string,
  opts: { scope: Scope; force: boolean },
): Promise<string[]> {
  const key = toKey(name);
  if (key === "") throw new BatonError(`template name "${name}" has no letters or numbers`);
  const body = prompt.replace(/\r\n/g, "\n").trim();
  if (body === "") throw new BatonError("template prompt is empty");

  const targets = scopeDirs(dirs, opts.scope).map((dir) => ({ dir, path: join(dir, `${key}.md`) }));
  if (!opts.force) {
    for (const { path } of targets) {
      if (await exists(path)) {
        throw new BatonError(`${path} already exists; pass --force to overwrite`, ExitCode.Blocked);
      }
    }
  }

  const frontmatter = stringify({ name: key, description: describe(body) }).trimEnd();
  const text = `---\n${frontmatter}\n---\n${body}\n`;
  for (const { dir, path } of targets) {
    await mkdir(dir, { recursive: true });
    await writeFile(path, text, "utf8");
  }
  return targets.map((t) => t.path);
}

export async function deleteTemplate(
  dirs: TemplateDirs,
  name: string,
  scope: Scope,
): Promise<string[]> {
  const key = toKey(name);
  const removed: string[] = [];
  for (const dir of scopeDirs(dirs, scope)) {
    const path = join(dir, `${key}.md`);
    try {
      await unlink(path);
      removed.push(path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  if (removed.length > 0) return removed;
  if (BUILTIN_TEMPLATES.some((t) => t.name === key)) {
    throw new BatonError(`"${key}" is a built-in template and cannot be deleted`, ExitCode.Blocked);
  }
  throw new BatonError(`no custom template "${name}" to delete`);
}
