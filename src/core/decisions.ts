import { readdir } from "node:fs/promises";

/**
 * Decision records follow MADR 4.0 (docs/decisions convention, but stored in
 * .context/decisions/). MADR has no `supersedes` field; supersession is the
 * status string "superseded by ADR-NNNN". baton adds two optional frontmatter
 * keys as its own extension: `supersedes` and `spec_sections` (ADR 0001).
 */

export const ADR_FILE_RE = /^(\d{4})-([a-z0-9-]+)\.md$/;

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

export function adrFileName(num: number, title: string): string {
  return `${String(num).padStart(4, "0")}-${slugify(title)}.md`;
}

/** Next free ADR number in a decisions/ directory (0000 is reserved for the template). */
export async function nextAdrNumber(dir: string): Promise<number> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const nums = entries
    .map((f) => ADR_FILE_RE.exec(f)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return Math.max(0, ...nums) + 1;
}
