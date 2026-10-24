import { parse } from "yaml";
import { fencedLines } from "./fences.js";
import { SECTION_KINDS, type Section, type SectionKind, type SectionMeta } from "./types.js";

/**
 * Two ways a section carries provenance (ADR 0003):
 *
 * 1. Whole-file sections (STATE.md, knowledge/*.md, decisions/*.md) use
 *    ordinary YAML frontmatter with `id`, `kind`, `verified_at`, `source_paths`.
 *
 * 2. Multi-section files (spec.md, rules.md) put an HTML comment directly
 *    under each heading, holding a YAML flow mapping:
 *
 *      ## Authentication
 *      <!-- baton: {id: auth, kind: intent, verified_at: 3f2a1c9, source_paths: [src/auth/**]} -->
 *
 *    The comment renders invisibly on GitHub and diffs cleanly.
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const MARKER_RE = /^<!--\s*baton:\s*(\{[\s\S]*?\})\s*-->\s*$/;

export interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(text: string): Frontmatter {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return { data: {}, body: text };
  const data = parse(m[1] ?? "") ?? {};
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new Error("frontmatter must be a YAML mapping");
  }
  return { data: data as Record<string, unknown>, body: text.slice(m[0].length) };
}

/** Normalise raw YAML (snake_case on disk) into SectionMeta. Throws on invalid input. */
export function toSectionMeta(raw: Record<string, unknown>, where: string): SectionMeta {
  const id = raw.id;
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(`${where}: section id must be kebab-case, got ${JSON.stringify(id)}`);
  }
  const kind = raw.kind;
  if (typeof kind !== "string" || !SECTION_KINDS.includes(kind as SectionKind)) {
    throw new Error(`${where}: kind must be one of ${SECTION_KINDS.join(", ")}`);
  }
  const verified = raw.verified_at;
  const sources = raw.source_paths ?? [];
  if (!Array.isArray(sources) || !sources.every((s) => typeof s === "string")) {
    throw new Error(`${where}: source_paths must be a list of strings`);
  }
  const meta: SectionMeta = {
    id,
    kind: kind as SectionKind,
    verifiedAt: verified == null || verified === "" ? null : String(verified),
    sourcePaths: sources as string[],
  };
  if (typeof raw.superseded_by === "string") meta.supersededBy = raw.superseded_by;
  return meta;
}

/** Parse a whole-file section (frontmatter + body). Returns null when the file has no `id`. */
export function parseFileSection(text: string, file: string): Section | null {
  const { data, body } = parseFrontmatter(text);
  if (data.id === undefined) return null;
  const meta = toSectionMeta(data, file);
  const bodyLines = body.split(/\r?\n/);
  const fenced = fencedLines(bodyLines);
  const heading = bodyLines.find((l, i) => !fenced[i] && HEADING_RE.test(l));
  const title = heading ? (HEADING_RE.exec(heading)?.[2] ?? meta.id) : meta.id;
  return { meta, title, body: body.trim(), file, line: 1 };
}

/**
 * Parse every marked section in a multi-section file. A section runs from its
 * heading to the next heading of the same or higher level, so an outer section
 * spans its nested marked sections. Each line belongs to the innermost open
 * marked section: a nested section's text is in its own body only, never in
 * its parent's. Headings without a marker are plain text inside the innermost
 * open section. Sections come back in document order.
 */
export function parseSections(text: string, file: string): Section[] {
  const lines = text.split(/\r?\n/);
  const fenced = fencedLines(lines);
  const sections: Section[] = [];
  const open: { section: Section; level: number; collected: string[] }[] = [];

  const closeFrom = (level: number) => {
    while (open.length > 0 && (open[open.length - 1]?.level ?? 0) >= level) {
      const done = open.pop();
      if (!done) break;
      done.section.body = done.collected.join("\n").trim();
      sections.push(done.section);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // Inside a fenced code block a `#` line is code, not a heading.
    const h = fenced[i] ? null : HEADING_RE.exec(line);
    if (h) {
      const level = (h[1] ?? "#").length;
      closeFrom(level);
      const marker = MARKER_RE.exec((lines[i + 1] ?? "").trim());
      if (marker) {
        const raw = parse(marker[1] ?? "{}");
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
          throw new Error(`${file}:${i + 2}: baton marker must be a YAML mapping`);
        }
        const meta = toSectionMeta(raw as Record<string, unknown>, `${file}:${i + 2}`);
        open.push({
          section: { meta, title: h[2] ?? meta.id, body: "", file, line: i + 1 },
          level,
          collected: [],
        });
        i++; // the marker line is not body
        continue;
      }
    }
    open[open.length - 1]?.collected.push(line);
  }
  closeFrom(0);
  sections.sort((a, b) => a.line - b.line);

  const seen = new Set<string>();
  for (const s of sections) {
    if (seen.has(s.meta.id)) throw new Error(`${file}: duplicate section id "${s.meta.id}"`);
    seen.add(s.meta.id);
  }
  return sections;
}
