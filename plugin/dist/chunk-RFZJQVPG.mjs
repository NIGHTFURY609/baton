#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  matchesAny
} from "./chunk-POYJG6UX.mjs";
import {
  pad4,
  statusKind
} from "./chunk-5VA3OZXQ.mjs";

// src/core/preflight.ts
var PREFLIGHT_STOPWORDS = new Set(
  "the and for with from into onto over under that this these those when then than them they their there here what which while where who why how not but are was were has have had does did done use uses used using via per new add adds added make makes all any each every one two its our your you can should would could will shall may might must also only just more most less same such out off own too very".split(" ")
);
var MAX_POSSIBLY = 5;
function normalizeQueryPath(p) {
  return p.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}
function titleTokens(s) {
  const out = [];
  for (const t of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (t.length >= 3 && !PREFLIGHT_STOPWORDS.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}
function isLoadBearing(s) {
  return s.doc !== "decision" && /\(load-bearing\)/i.test(s.body);
}
function isCandidate(s) {
  if (s.doc === "state") return false;
  if (s.doc !== "decision") return true;
  if (s.meta.supersededBy) return false;
  const kind = statusKind(s.adr?.status ?? "");
  return kind !== "rejected" && kind !== "deprecated";
}
function categoryOf(s, relations, q) {
  const byPathOrSpec = relations.includes("path") || relations.includes("spec");
  if (byPathOrSpec) {
    const binding = s.doc === "decision" ? statusKind(s.adr?.status ?? "") === "accepted" && s.adr?.number !== q.supersedes : isLoadBearing(s);
    if (binding) return "constrains";
  }
  return byPathOrSpec || relations.includes("supersedes") ? "related" : "possibly";
}
function relate(s, q, paths, queryTokens) {
  const relations = [];
  const parts = [];
  const src = s.meta.sourcePaths;
  const matchedPath = paths.find((p) => matchesAny(p, src) || src.some((g) => matchesAny(g, [p])));
  if (matchedPath !== void 0) {
    relations.push("path");
    parts.push(`path: ${matchedPath}`);
  }
  const specs = s.doc === "decision" ? (s.adr?.specSections ?? []).filter((id) => q.specIds.includes(id)) : q.specIds.includes(s.meta.id) ? [s.meta.id] : [];
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
  if (s.doc === "decision" && q.supersedes !== void 0 && s.adr?.number === q.supersedes) {
    relations.push("supersedes");
    parts.push("replaced by this decision");
  }
  if (relations.length === 0) return null;
  const hit = {
    section: s,
    category: categoryOf(s, relations, q),
    relations,
    why: parts.join("; "),
    loadBearing: isLoadBearing(s),
    keywords
  };
  if (matchedPath !== void 0) hit.matchedPath = matchedPath;
  return hit;
}
function preflight(index, q) {
  const paths = q.paths.map(normalizeQueryPath);
  const queryTokens = q.title ? titleTokens(q.title) : [];
  const ordered = [
    ...index.sections.filter((s) => s.doc === "decision").sort((a, b) => (a.adr?.number ?? 0) - (b.adr?.number ?? 0)),
    ...index.sections.filter((s) => s.doc !== "decision")
  ];
  const hits = [];
  for (const s of ordered) {
    if (!isCandidate(s)) continue;
    const hit = relate(s, q, paths, queryTokens);
    if (hit) hits.push(hit);
  }
  const of = (c) => hits.filter((h) => h.category === c);
  const possibly = of("possibly").sort((a, b) => b.keywords.length - a.keywords.length).slice(0, MAX_POSSIBLY);
  const constrains = of("constrains");
  const related = of("related");
  const byId = new Map(index.sections.map((s) => [s.meta.id, s]));
  const unknownSpecIds = [];
  for (const id of q.specIds) {
    const found = byId.get(id);
    const known = found !== void 0 && found.doc !== "decision" && found.doc !== "state";
    if (!known && !unknownSpecIds.includes(id)) unknownSpecIds.push(id);
  }
  return {
    hits: [...constrains, ...related, ...possibly],
    counts: {
      constrains: constrains.length,
      related: related.length,
      possibly: possibly.length
    },
    unknownSpecIds
  };
}
var DOC_WORD = { spec: "spec", rules: "rule", knowledge: "knowledge" };
function hitLabel(h) {
  const s = h.section;
  const title = s.title.replaceAll("`", "");
  if (s.doc === "decision") {
    return `ADR ${pad4(s.adr?.number ?? 0)} (${s.adr?.status ?? ""}) "${title}"`;
  }
  const word = DOC_WORD[s.doc] ?? s.doc;
  return `${word} ${s.meta.id} "${title}"${h.loadBearing ? " (load-bearing)" : ""}`;
}
var CAT_LABEL = {
  constrains: "CONSTRAINS",
  related: "RELATED",
  possibly: "POSSIBLY"
};
function renderPreflight(r) {
  const { constrains, related, possibly } = r.counts;
  const lines = [
    `preflight: ${constrains} constraining, ${related} related, ${possibly} possibly related`
  ];
  for (const h of r.hits) {
    lines.push(
      `${CAT_LABEL[h.category].padEnd(10)}  ${hitLabel(h)}  ${h.section.file}:${h.section.line}  ${h.why}`
    );
  }
  if (r.unknownSpecIds.length > 0) lines.push(`unknown spec ids: ${r.unknownSpecIds.join(", ")}`);
  return lines.join("\n");
}
var ITEM_LABEL = {
  constrains: "constrains",
  related: "related",
  possibly: "possibly related"
};
function preflightMoreInformation(r) {
  const { constrains, related, possibly } = r.counts;
  return {
    summary: `Preflight at creation (baton decide): ${constrains} constraining, ${related} related, ${possibly} possibly related.`,
    items: r.hits.map(
      (h) => `${ITEM_LABEL[h.category]}: ${hitLabel(h)} (${h.why})`.replaceAll("`", "")
    )
  };
}

export {
  PREFLIGHT_STOPWORDS,
  normalizeQueryPath,
  titleTokens,
  isLoadBearing,
  preflight,
  hitLabel,
  renderPreflight,
  preflightMoreInformation
};
//# sourceMappingURL=chunk-RFZJQVPG.mjs.map