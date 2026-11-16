#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  fencedLines
} from "./chunk-7ITVWEWP.mjs";
import {
  ADR_FILE_RE,
  adrId,
  adrNumberFrom,
  statusKind
} from "./chunk-5VA3OZXQ.mjs";
import {
  require_dist
} from "./chunk-HAV7IRWM.mjs";
import {
  BatonError,
  ExitCode
} from "./chunk-YXJRO53B.mjs";
import {
  contextPath
} from "./chunk-HVIRJWHJ.mjs";
import {
  __toESM
} from "./chunk-UC4Y6CAD.mjs";

// src/core/sections.ts
import { existsSync } from "fs";
import { readdir, readFile } from "fs/promises";

// src/core/frontmatter.ts
var import_yaml = __toESM(require_dist(), 1);

// src/core/types.ts
var SECTION_KINDS = [
  "rule",
  "intent",
  "decision",
  "state",
  "knowledge"
];

// src/core/frontmatter.ts
var FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
var HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
var MARKER_RE = /^<!--\s*baton:\s*(\{[\s\S]*?\})\s*-->\s*$/;
function parseFrontmatter(text) {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return { data: {}, body: text };
  const data = (0, import_yaml.parse)(m[1] ?? "") ?? {};
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new Error("frontmatter must be a YAML mapping");
  }
  return { data, body: text.slice(m[0].length) };
}
function toSectionMeta(raw, where) {
  const id = raw.id;
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(`${where}: section id must be kebab-case, got ${JSON.stringify(id)}`);
  }
  const kind = raw.kind;
  if (typeof kind !== "string" || !SECTION_KINDS.includes(kind)) {
    throw new Error(`${where}: kind must be one of ${SECTION_KINDS.join(", ")}`);
  }
  const verified = raw.verified_at;
  const sources = raw.source_paths ?? [];
  if (!Array.isArray(sources) || !sources.every((s) => typeof s === "string")) {
    throw new Error(`${where}: source_paths must be a list of strings`);
  }
  const meta = {
    id,
    kind,
    verifiedAt: verified == null || verified === "" ? null : String(verified),
    sourcePaths: sources
  };
  if (typeof raw.superseded_by === "string") meta.supersededBy = raw.superseded_by;
  return meta;
}
function parseFileSection(text, file) {
  const { data, body } = parseFrontmatter(text);
  if (data.id === void 0) return null;
  const meta = toSectionMeta(data, file);
  const bodyLines = body.split(/\r?\n/);
  const fenced = fencedLines(bodyLines);
  const heading = bodyLines.find((l, i) => !fenced[i] && HEADING_RE.test(l));
  const title = heading ? HEADING_RE.exec(heading)?.[2] ?? meta.id : meta.id;
  return { meta, title, body: body.trim(), file, line: 1 };
}
function parseSections(text, file) {
  const lines = text.split(/\r?\n/);
  const fenced = fencedLines(lines);
  const sections = [];
  const open = [];
  const closeFrom = (level) => {
    while (open.length > 0 && (open[open.length - 1]?.level ?? 0) >= level) {
      const done = open.pop();
      if (!done) break;
      done.section.body = done.collected.join("\n").trim();
      sections.push(done.section);
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const h = fenced[i] ? null : HEADING_RE.exec(line);
    if (h) {
      const level = (h[1] ?? "#").length;
      closeFrom(level);
      const marker = MARKER_RE.exec((lines[i + 1] ?? "").trim());
      if (marker) {
        const raw = (0, import_yaml.parse)(marker[1] ?? "{}");
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
          throw new Error(`${file}:${i + 2}: baton marker must be a YAML mapping`);
        }
        const meta = toSectionMeta(raw, `${file}:${i + 2}`);
        open.push({
          section: { meta, title: h[2] ?? meta.id, body: "", file, line: i + 1 },
          level,
          collected: []
        });
        i++;
        continue;
      }
    }
    open[open.length - 1]?.collected.push(line);
  }
  closeFrom(0);
  sections.sort((a, b) => a.line - b.line);
  const seen = /* @__PURE__ */ new Set();
  for (const s of sections) {
    if (seen.has(s.meta.id)) throw new Error(`${file}: duplicate section id "${s.meta.id}"`);
    seen.add(s.meta.id);
  }
  return sections;
}

// src/core/sections.ts
function supersededByFromStatus(status) {
  const m = /^superseded by\s+(?:adr[-\s]?)?(\d{1,4})\b/i.exec(status);
  return m?.[1] === void 0 ? void 0 : `adr-${m[1].padStart(4, "0")}`;
}
var isString = (v) => typeof v === "string";
async function readNormalised(abs) {
  const text = await readFile(abs, "utf8");
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}
async function listMarkdown(dir) {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}
function adrInfo(text, number) {
  const { data } = parseFrontmatter(text);
  const status = typeof data.status === "string" ? data.status : "";
  const info = {
    number,
    status,
    specSections: Array.isArray(data.spec_sections) ? data.spec_sections.filter(isString) : []
  };
  if (data.supersedes != null) info.supersedes = String(data.supersedes);
  return { info, status };
}
async function loadSectionIndex(root, opts = {}) {
  if (!existsSync(contextPath(root))) {
    return { root, sections: [], byId: /* @__PURE__ */ new Map(), problems: [] };
  }
  const collected = [];
  const problems = [];
  const fail = (file, err) => {
    const first = (err instanceof Error ? err.message : String(err)).split("\n")[0]?.trim() ?? "";
    problems.push({ file, message: first.startsWith(file) ? first : `${file}: ${first}` });
  };
  const load = async (rel, doc, parse2, extra) => {
    const abs = contextPath(root, ...rel.split("/"));
    if (!existsSync(abs)) return;
    const file = `.context/${rel}`;
    try {
      const text = await readNormalised(abs);
      for (const s of parse2(text, file)) {
        const indexed = { ...s, doc };
        extra?.(text, indexed);
        collected.push(indexed);
      }
    } catch (err) {
      fail(file, err);
    }
  };
  const wholeFile = (text, file) => {
    const s = parseFileSection(text, file);
    return s ? [s] : [];
  };
  await load("rules.md", "rules", parseSections);
  await load("spec.md", "spec", parseSections);
  await load("STATE.md", "state", wholeFile);
  const knowledge = (await listMarkdown(contextPath(root, "knowledge"))).sort(
    (a, b) => a < b ? -1 : a > b ? 1 : 0
  );
  for (const name of knowledge) await load(`knowledge/${name}`, "knowledge", wholeFile);
  const decisions = (await listMarkdown(contextPath(root, "decisions"))).flatMap((name) => {
    const m = ADR_FILE_RE.exec(name);
    const number = m?.[1] === void 0 ? 0 : Number(m[1]);
    return number >= 1 ? [{ name, number }] : [];
  }).sort((a, b) => a.number - b.number);
  for (const { name, number } of decisions) {
    await load(`decisions/${name}`, "decision", wholeFile, (text, s) => {
      const { info, status } = adrInfo(text, number);
      s.adr = info;
      const by = supersededByFromStatus(status);
      if (s.meta.supersededBy === void 0 && by !== void 0) s.meta.supersededBy = by;
    });
  }
  const sections = [];
  const byId = /* @__PURE__ */ new Map();
  for (const s of collected) {
    const first = byId.get(s.meta.id);
    if (first) {
      problems.push({
        file: s.file,
        message: `${s.file}:${s.line}: duplicate section id "${s.meta.id}" (also in ${first.file}:${first.line})`
      });
      continue;
    }
    byId.set(s.meta.id, s);
    sections.push(s);
  }
  for (const s of sections) {
    if (s.doc !== "decision" || !s.adr?.supersedes || s.meta.supersededBy) continue;
    if (statusKind(s.adr.status) !== "accepted") continue;
    const n = adrNumberFrom(s.adr.supersedes);
    const t = n === null ? void 0 : byId.get(adrId(n));
    if (t && t.doc === "decision" && t !== s && !t.meta.supersededBy) {
      t.meta.supersededBy = s.meta.id;
    }
  }
  if (problems.length > 0 && !opts.lenient) {
    throw new BatonError(
      `.context/ has ${problems.length} problem(s):
${problems.map((p) => `  ${p.message}`).join("\n")}`,
      ExitCode.Error
    );
  }
  return { root, sections, byId, problems };
}

export {
  parseFrontmatter,
  parseSections,
  supersededByFromStatus,
  loadSectionIndex
};
//# sourceMappingURL=chunk-3GYDKCE7.mjs.map