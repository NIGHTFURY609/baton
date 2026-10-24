import { readdir } from "node:fs/promises";
import { BatonError } from "./errors.js";

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

export const PLACEHOLDERS = {
  context: "{Context: the problem, and why a decision is needed now.}",
  option: "{Considered option}",
  outcome: "{Chosen option and why.}",
  good: "Good, because {…}",
  bad: "Bad, because {…}",
} as const;

export type PlaceholderKey = keyof typeof PLACEHOLDERS;

export type StatusKind =
  | "proposed"
  | "accepted"
  | "superseded"
  | "rejected"
  | "deprecated"
  | "other";

const STATUS_KINDS = ["superseded", "accepted", "proposed", "rejected", "deprecated"] as const;

export function statusKind(status: string): StatusKind {
  const t = status.trim().toLowerCase();
  return STATUS_KINDS.find((k) => t.startsWith(k)) ?? "other";
}

export function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

export function adrId(n: number): string {
  return `adr-${pad4(n)}`;
}

/** Strict reference: "7", "0007", "ADR-0007", "adr 12". */
export function parseAdrRef(ref: string): number {
  const m = /^(?:adr[-\s]?)?(\d{1,4})$/i.exec(ref.trim());
  const n = m?.[1] === undefined ? 0 : Number(m[1]);
  if (n < 1) throw new BatonError(`not an ADR number: "${ref}"`);
  return n;
}

/** Loose: the first 1-4 digit run in `value`, or null when absent or zero. */
export function adrNumberFrom(value: string): number | null {
  const m = /\d{1,4}/.exec(value);
  const n = m ? Number(m[0]) : 0;
  return n > 0 ? n : null;
}

export function supersededStatus(n: number): string {
  return `superseded by ADR-${pad4(n)}`;
}

/** Local calendar date, YYYY-MM-DD. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface AdrDraft {
  number: number;
  title: string;
  status: "proposed" | "accepted";
  date: string;
  deciders: string[];
  verifiedAt: string | null;
  sourcePaths: string[];
  specSections: string[];
  supersedes?: number;
  context?: string;
  considered: string[];
  outcome?: string;
  consequences: string[];
  moreInformation: { summary: string; items: string[] };
}

/** A name safe to write as an unquoted YAML flow scalar that stays the same string. */
function isPlainName(name: string): boolean {
  return (
    /^[A-Za-z](?:[A-Za-z0-9._ -]*[A-Za-z0-9._])?$/.test(name) &&
    !/^(?:null|true|false|yes|no|on|off|~)$/i.test(name)
  );
}

function oneLine(label: string, value: string): string {
  if (value.includes("\n")) throw new BatonError(`${label} must be a single line`);
  return value;
}

function bullets(label: string, items: string[]): string {
  return items.map((i) => `* ${oneLine(label, i)}`).join("\n");
}

/** Render a MADR-minimal decision record as LF text with exactly one trailing newline. */
export function renderAdr(d: AdrDraft): string {
  const title = oneLine("title", d.title);
  const proposed = d.status === "proposed";
  const deciders = d.deciders.map((n) => (isPlainName(n) ? n : JSON.stringify(n))).join(", ");
  const front = [
    `id: ${adrId(d.number)}`,
    "kind: decision",
    `status: ${d.status}`,
    `date: ${d.date}`,
    `decision-makers: [${deciders}]`,
    d.verifiedAt === null ? "verified_at: null" : `verified_at: "${d.verifiedAt}"`,
    `source_paths: [${d.sourcePaths.map((p) => JSON.stringify(p)).join(", ")}]`,
    ...(d.supersedes === undefined ? [] : [`supersedes: "${pad4(d.supersedes)}"`]),
    `spec_sections: [${d.specSections.join(", ")}]`,
  ];

  let considered = d.considered;
  if (considered.length === 0 && proposed) considered = [PLACEHOLDERS.option, PLACEHOLDERS.option];
  let consequences = d.consequences;
  if (consequences.length === 0 && proposed) consequences = [PLACEHOLDERS.good, PLACEHOLDERS.bad];

  const blocks = [
    `---\n${front.join("\n")}\n---\n# ${title}`,
    `## Context and Problem Statement\n\n${d.context ?? PLACEHOLDERS.context}`,
  ];
  if (considered.length > 0) {
    blocks.push(`## Considered Options\n\n${bullets("considered option", considered)}`);
  }
  blocks.push(`## Decision Outcome\n\n${d.outcome ?? PLACEHOLDERS.outcome}`);
  if (consequences.length > 0) {
    blocks.push(`### Consequences\n\n${bullets("consequence", consequences)}`);
  }
  const more = d.moreInformation;
  blocks.push(
    more.items.length > 0
      ? `## More Information\n\n${more.summary}\n\n${bullets("more-information item", more.items)}`
      : `## More Information\n\n${more.summary}`,
  );
  return `${blocks.join("\n\n")}\n`;
}

export function placeholdersIn(text: string): PlaceholderKey[] {
  return (Object.keys(PLACEHOLDERS) as PlaceholderKey[]).filter((k) =>
    text.includes(PLACEHOLDERS[k]),
  );
}

function frontmatterMatch(text: string): RegExpExecArray | null {
  const lf = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  return /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(lf);
}

/** The `status:` value of a record's frontmatter (one pair of quotes stripped), or null. */
export function statusOf(text: string): string | null {
  const m = frontmatterMatch(text);
  if (!m) return null;
  const line = /^status:[ \t]*(.*)$/m.exec(m[1] ?? "");
  if (!line) return null;
  const value = (line[1] ?? "").trim();
  const quoted = /^(["'])([\s\S]*)\1$/.exec(value);
  return quoted ? (quoted[2] ?? "") : value;
}

/** The whole "---\n…\n---" frontmatter block, BOM/CRLF-normalised, or null. */
export function frontmatterBlock(text: string): string | null {
  const m = frontmatterMatch(text);
  return m ? m[0].replace(/\n$/, "") : null;
}

/** Replace (or insert before the closing fence) `key: rendered` in LF text's frontmatter. */
export function setFrontmatterField(lfText: string, key: string, rendered: string): string {
  const m = /^---\n(?:([\s\S]*?)\n)?---(?=\n|$)/.exec(lfText);
  if (!m) throw new Error("no frontmatter");
  const block = m[1] ?? "";
  const lines = block === "" ? [] : block.split("\n");
  const line = `${key}: ${rendered}`;
  const at = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (at === -1) lines.push(line);
  else lines[at] = line;
  return `---\n${lines.join("\n")}\n---${lfText.slice(m[0].length)}`;
}

/** True when another file in `entries` (not `ownName`) already uses ADR number `n`. */
export function numberTaken(entries: string[], n: number, ownName: string): boolean {
  return entries.some((e) => {
    if (e === ownName) return false;
    const m = /^(\d{4})-.+\.md$/.exec(e);
    return m?.[1] !== undefined && Number(m[1]) === n;
  });
}
