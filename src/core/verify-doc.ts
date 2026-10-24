import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BatonError } from "./errors.js";
import { porcelainPath } from "./git.js";
import { matchesAny } from "./glob.js";
import { type IndexedSection, loadSectionIndex } from "./sections.js";
import { writeFileAtomic } from "./tasks/native/jsonl.js";

/**
 * verify-doc stamps (ADR 0012): rewrite only the `verified_at` token of a
 * marker line or of a file's frontmatter, so a record's text never changes.
 * The file's line endings and BOM are kept.
 */

export const STAMP_LENGTH = 12;

const BOM = "﻿";
const MARKER_LINE_RE = /^(\s*<!--\s*baton:\s*)(\{[\s\S]*\})(\s*-->\s*)$/;
const VERIFIED_VALUE_RE = /(\bverified_at\s*:\s*)("[^"]*"|'[^']*'|[^,}]*?)(\s*[,}])/;

/** Replace or add `verified_at: "<sha>"` inside the `{…}` mapping of a baton marker line. */
export function stampMarkerLine(line: string, sha: string): string {
  const m = MARKER_LINE_RE.exec(line);
  if (!m) throw new Error(`not a baton marker line: ${line}`);
  const [, open = "", mapping = "", close = ""] = m;
  const stamped = /\bverified_at\s*:/.test(mapping)
    ? mapping.replace(
        VERIFIED_VALUE_RE,
        (_all, key: string, _old: string, end: string) => `${key}"${sha}"${end}`,
      )
    : `${mapping.slice(0, -1)}, verified_at: "${sha}"}`;
  return `${open}${stamped}${close}`;
}

/** Replace or add `verified_at: "<sha>"` in the frontmatter of LF text without a BOM. */
export function stampFrontmatter(text: string, sha: string): string {
  const m = /^---\n(?:([\s\S]*?)\n)?---(?=\n|$)/.exec(text);
  if (!m) throw new Error("no frontmatter to stamp");
  const block = m[1] ?? "";
  const stamp = `verified_at: "${sha}"`;
  let next: string;
  if (/^verified_at:.*$/m.test(block)) {
    next = block.replace(/^verified_at:.*$/m, stamp);
  } else {
    const fm = block === "" ? [] : block.split("\n");
    const kindAt = fm.findIndex((l) => /^kind:/.test(l));
    fm.splice(kindAt === -1 ? fm.length : kindAt + 1, 0, stamp);
    next = fm.join("\n");
  }
  return `---\n${next}\n---${text.slice(m[0].length)}`;
}

export interface Stamp {
  id: string;
  file: string;
  previous: string | null;
}

/** Stamp every id with `sha`. All-or-nothing on unknown ids; verifies the result by reloading the index. */
export async function stampSections(root: string, ids: string[], sha: string): Promise<Stamp[]> {
  const unique = [...new Set(ids)];
  const index = await loadSectionIndex(root);
  const unknown = unique.filter((id) => !index.byId.has(id));
  if (unknown.length > 0) throw new BatonError(`no section(s): ${unknown.join(", ")}`);

  const byFile = new Map<string, IndexedSection[]>();
  const stamps: Stamp[] = [];
  for (const id of unique) {
    const section = index.byId.get(id) as IndexedSection;
    byFile.set(section.file, [...(byFile.get(section.file) ?? []), section]);
    stamps.push({ id, file: section.file, previous: section.meta.verifiedAt });
  }

  for (const [file, sections] of byFile) {
    const abs = join(root, ...file.split("/"));
    const raw = readFileSync(abs, "utf8");
    const bom = raw.startsWith(BOM) ? BOM : "";
    const rest = raw.slice(bom.length);
    const eol = rest.includes("\r\n") ? "\r\n" : "\n";
    let lines = rest.split(/\r?\n/);
    for (const section of sections) {
      if (section.doc === "rules" || section.doc === "spec") {
        lines[section.line] = stampMarkerLine(lines[section.line] ?? "", sha);
      } else {
        lines = stampFrontmatter(lines.join("\n"), sha).split("\n");
      }
    }
    writeFileAtomic(abs, bom + lines.join(eol));
  }

  const after = await loadSectionIndex(root);
  for (const { id } of stamps) {
    if (after.byId.get(id)?.meta.verifiedAt !== sha) {
      throw new Error(`verify-doc: stamp did not round-trip for ${id}`);
    }
  }
  return stamps;
}

/** Paths from porcelain status lines that match any of `sourcePaths`, in input order. */
export function uncommittedSources(statusLines: string[], sourcePaths: string[]): string[] {
  return statusLines.map(porcelainPath).filter((p) => matchesAny(p, sourcePaths));
}
