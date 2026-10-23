import { pad4, statusKind } from "./decisions.js";
import { matchesAny } from "./glob.js";
import type { IndexedSection } from "./sections.js";

/**
 * Decision preflight (ADR 0018): relate a proposed decision to the section index by
 * path, spec id and title keyword. Pure and lexical, so it over- and under-reports.
 * Only path or spec relations to an accepted ADR or a load-bearing spec section
 * constrain; keyword matches never do.
 */

export type Relation = "path" | "spec" | "keyword" | "supersedes";
export type HitCategory = "constrains" | "related" | "possibly";

export interface PreflightQuery {
  title?: string;
  paths: string[];
  specIds: string[];
  supersedes?: number;
}

export interface PreflightHit {
  section: IndexedSection;
  category: HitCategory;
  relations: Relation[];
  why: string;
  loadBearing: boolean;
  matchedPath?: string;
  keywords: string[];
}

export interface PreflightReport {
  /** Category order, then pinned order. */
  hits: PreflightHit[];
  counts: { constrains: number; related: number; possibly: number };
  unknownSpecIds: string[];
}

export const PREFLIGHT_STOPWORDS: ReadonlySet<string> = new Set(
  (
    "the and for with from into onto over under that this these those when then than them they " +
    "their there here what which while where who why how not but are was were has have had does " +
    "did done use uses used using via per new add adds added make makes all any each every one " +
    "two its our your you can should would could will shall may might must also only just more " +
    "most less same such out off own too very"
  ).split(" "),
);

const MAX_POSSIBLY = 5;

export function normalizeQueryPath(p: string): string {
  return p.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

export function titleTokens(s: string): string[] {
  const out: string[] = [];
  for (const t of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (t.length >= 3 && !PREFLIGHT_STOPWORDS.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Only the marker form counts, e.g. "Not in scope (load-bearing): ...". */
export function isLoadBearing(s: IndexedSection): boolean {
  return s.doc !== "decision" && /\(load-bearing\)/i.test(s.body);
}

function isCandidate(s: IndexedSection): boolean {
  if (s.doc === "state") return false;
  if (s.doc !== "decision") return true;
  if (s.meta.supersededBy) return false;
  const kind = statusKind(s.adr?.status ?? "");
  return kind !== "rejected" && kind !== "deprecated";
}

function categoryOf(s: IndexedSection, relations: Relation[], q: PreflightQuery): HitCategory {
  const byPathOrSpec = relations.includes("path") || relations.includes("spec");
  if (byPathOrSpec) {
    const binding =
      s.doc === "decision"
        ? statusKind(s.adr?.status ?? "") === "accepted" && s.adr?.number !== q.supersedes
        : isLoadBearing(s);
    if (binding) return "constrains";
  }
  return byPathOrSpec || relations.includes("supersedes") ? "related" : "possibly";
}

function relate(
  s: IndexedSection,
  q: PreflightQuery,
  paths: readonly string[],
  queryTokens: readonly string[],
): PreflightHit | null {
  const relations: Relation[] = [];
  const parts: string[] = [];
  const src = s.meta.sourcePaths;

  const matchedPath = paths.find((p) => matchesAny(p, src) || src.some((g) => matchesAny(g, [p])));
  if (matchedPath !== undefined) {
    relations.push("path");
    parts.push(`path: ${matchedPath}`);
  }

  const specs =
    s.doc === "decision"
      ? (s.adr?.specSections ?? []).filter((id) => q.specIds.includes(id))
      : q.specIds.includes(s.meta.id)
        ? [s.meta.id]
        : [];
  if (specs.length > 0) {
    relations.push("spec");
    parts.push(`spec: ${specs.join(", ")}`);
  }

  const own = queryTokens.length > 0 ? titleTokens(s.title) : [];
  const keywords = queryTokens.filter((t) => own.includes(t));
  if (keywords.length > 0) {
    relations.push("keyword");
    parts.push(`keyword: ${keywords.join(", ")}`);
  }

  if (s.doc === "decision" && q.supersedes !== undefined && s.adr?.number === q.supersedes) {
    relations.push("supersedes");
    parts.push("replaced by this decision");
  }

  if (relations.length === 0) return null;
  const hit: PreflightHit = {
    section: s,
    category: categoryOf(s, relations, q),
    relations,
    why: parts.join("; "),
    loadBearing: isLoadBearing(s),
    keywords,
  };
  if (matchedPath !== undefined) hit.matchedPath = matchedPath;
  return hit;
}

export function preflight(
  index: { sections: readonly IndexedSection[] },
  q: PreflightQuery,
): PreflightReport {
  const paths = q.paths.map(normalizeQueryPath);
  const queryTokens = q.title ? titleTokens(q.title) : [];

  // Decisions by number first, then every other section in index order.
  const ordered = [
    ...index.sections
      .filter((s) => s.doc === "decision")
      .sort((a, b) => (a.adr?.number ?? 0) - (b.adr?.number ?? 0)),
    ...index.sections.filter((s) => s.doc !== "decision"),
  ];

  const hits: PreflightHit[] = [];
  for (const s of ordered) {
    if (!isCandidate(s)) continue;
    const hit = relate(s, q, paths, queryTokens);
    if (hit) hits.push(hit);
  }

  const of = (c: HitCategory) => hits.filter((h) => h.category === c);
  const possibly = of("possibly")
    .sort((a, b) => b.keywords.length - a.keywords.length)
    .slice(0, MAX_POSSIBLY);
  const constrains = of("constrains");
  const related = of("related");

  const byId = new Map(index.sections.map((s) => [s.meta.id, s]));
  const unknownSpecIds: string[] = [];
  for (const id of q.specIds) {
    const found = byId.get(id);
    const known = found !== undefined && found.doc !== "decision" && found.doc !== "state";
    if (!known && !unknownSpecIds.includes(id)) unknownSpecIds.push(id);
  }

  return {
    hits: [...constrains, ...related, ...possibly],
    counts: {
      constrains: constrains.length,
      related: related.length,
      possibly: possibly.length,
    },
    unknownSpecIds,
  };
}

const DOC_WORD: Record<string, string> = { spec: "spec", rules: "rule", knowledge: "knowledge" };

export function hitLabel(h: PreflightHit): string {
  const s = h.section;
  const title = s.title.replaceAll("`", "");
  if (s.doc === "decision") {
    return `ADR ${pad4(s.adr?.number ?? 0)} (${s.adr?.status ?? ""}) "${title}"`;
  }
  const word = DOC_WORD[s.doc] ?? s.doc;
  return `${word} ${s.meta.id} "${title}"${h.loadBearing ? " (load-bearing)" : ""}`;
}

const CAT_LABEL: Record<HitCategory, string> = {
  constrains: "CONSTRAINS",
  related: "RELATED",
  possibly: "POSSIBLY",
};

export function renderPreflight(r: PreflightReport): string {
  const { constrains, related, possibly } = r.counts;
  const lines = [
    `preflight: ${constrains} constraining, ${related} related, ${possibly} possibly related`,
  ];
  for (const h of r.hits) {
    lines.push(
      `${CAT_LABEL[h.category].padEnd(10)}  ${hitLabel(h)}  ${h.section.file}:${h.section.line}  ${h.why}`,
    );
  }
  if (r.unknownSpecIds.length > 0) lines.push(`unknown spec ids: ${r.unknownSpecIds.join(", ")}`);
  return lines.join("\n");
}

const ITEM_LABEL: Record<HitCategory, string> = {
  constrains: "constrains",
  related: "related",
  possibly: "possibly related",
};

/**
 * Plain text for a record's "More Information". No backticks and no markdown links, so
 * drift's dead-reference check never reads a planned path as dead.
 */
export function preflightMoreInformation(r: PreflightReport): { summary: string; items: string[] } {
  const { constrains, related, possibly } = r.counts;
  return {
    summary: `Preflight at creation (baton decide): ${constrains} constraining, ${related} related, ${possibly} possibly related.`,
    items: r.hits.map((h) =>
      `${ITEM_LABEL[h.category]}: ${hitLabel(h)} (${h.why})`.replaceAll("`", ""),
    ),
  };
}
