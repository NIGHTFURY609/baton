#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  BatonError
} from "./chunk-YXJRO53B.mjs";

// src/core/decisions.ts
import { readdir } from "fs/promises";
var ADR_FILE_RE = /^(\d{4})-([a-z0-9-]+)\.md$/;
var ADR_NUMBERED_RE = /^(\d{4})-.+\.md$/;
function slugify(title) {
  const slug = title.normalize("NFKD").replace(new RegExp("\\p{Mark}", "gu"), "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
  return slug === "" ? "decision" : slug;
}
function adrFileName(num, title) {
  return `${String(num).padStart(4, "0")}-${slugify(title)}.md`;
}
async function nextAdrNumber(dir) {
  let entries = [];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const nums = entries.map((f) => ADR_NUMBERED_RE.exec(f)?.[1]).filter((n) => n !== void 0).map(Number);
  return Math.max(0, ...nums) + 1;
}
var PLACEHOLDERS = {
  context: "{Context: the problem, and why a decision is needed now.}",
  option: "{Considered option}",
  outcome: "{Chosen option and why.}",
  good: "Good, because {\u2026}",
  bad: "Bad, because {\u2026}"
};
var STATUS_KINDS = ["superseded", "accepted", "proposed", "rejected", "deprecated"];
function statusKind(status) {
  const t = status.trim().toLowerCase();
  return STATUS_KINDS.find((k) => t.startsWith(k)) ?? "other";
}
function pad4(n) {
  return String(n).padStart(4, "0");
}
function adrId(n) {
  return `adr-${pad4(n)}`;
}
function parseAdrRef(ref) {
  const m = /^(?:adr[-\s]?)?(\d{1,4})$/i.exec(ref.trim());
  const n = m?.[1] === void 0 ? 0 : Number(m[1]);
  if (n < 1) throw new BatonError(`not an ADR number: "${ref}"`);
  return n;
}
function adrNumberFrom(value) {
  const m = /\d{1,4}/.exec(value);
  const n = m ? Number(m[0]) : 0;
  return n > 0 ? n : null;
}
function supersededStatus(n) {
  return `superseded by ADR-${pad4(n)}`;
}
function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isPlainName(name) {
  return /^[A-Za-z](?:[A-Za-z0-9._ -]*[A-Za-z0-9._])?$/.test(name) && !/^(?:null|true|false|yes|no|on|off|~)$/i.test(name);
}
function oneLine(label, value) {
  if (value.includes("\n")) throw new BatonError(`${label} must be a single line`);
  return value;
}
function bullets(label, items) {
  return items.map((i) => `* ${oneLine(label, i)}`).join("\n");
}
function renderAdr(d) {
  const title = oneLine("title", d.title);
  const proposed = d.status === "proposed";
  const deciders = d.deciders.map((n) => isPlainName(n) ? n : JSON.stringify(n)).join(", ");
  const front = [
    `id: ${adrId(d.number)}`,
    "kind: decision",
    `status: ${d.status}`,
    `date: ${d.date}`,
    `decision-makers: [${deciders}]`,
    d.verifiedAt === null ? "verified_at: null" : `verified_at: "${d.verifiedAt}"`,
    `source_paths: [${d.sourcePaths.map((p) => JSON.stringify(p)).join(", ")}]`,
    ...d.supersedes === void 0 ? [] : [`supersedes: "${pad4(d.supersedes)}"`],
    `spec_sections: [${d.specSections.join(", ")}]`
  ];
  let considered = d.considered;
  if (considered.length === 0 && proposed) considered = [PLACEHOLDERS.option, PLACEHOLDERS.option];
  let consequences = d.consequences;
  if (consequences.length === 0 && proposed) consequences = [PLACEHOLDERS.good, PLACEHOLDERS.bad];
  const blocks = [
    `---
${front.join("\n")}
---
# ${title}`,
    `## Context and Problem Statement

${d.context ?? PLACEHOLDERS.context}`
  ];
  if (considered.length > 0) {
    blocks.push(`## Considered Options

${bullets("considered option", considered)}`);
  }
  blocks.push(`## Decision Outcome

${d.outcome ?? PLACEHOLDERS.outcome}`);
  if (consequences.length > 0) {
    blocks.push(`### Consequences

${bullets("consequence", consequences)}`);
  }
  const more = d.moreInformation;
  blocks.push(
    more.items.length > 0 ? `## More Information

${more.summary}

${bullets("more-information item", more.items)}` : `## More Information

${more.summary}`
  );
  return `${blocks.join("\n\n")}
`;
}
function placeholdersIn(text) {
  return Object.keys(PLACEHOLDERS).filter(
    (k) => text.includes(PLACEHOLDERS[k])
  );
}
function frontmatterMatch(text) {
  const lf = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  return /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(lf);
}
function statusOf(text) {
  const m = frontmatterMatch(text);
  if (!m) return null;
  const line = /^status:[ \t]*(.*)$/m.exec(m[1] ?? "");
  if (!line) return null;
  const value = (line[1] ?? "").trim();
  const quoted = /^(["'])([\s\S]*)\1$/.exec(value);
  return quoted ? quoted[2] ?? "" : value;
}
function frontmatterBlock(text) {
  const m = frontmatterMatch(text);
  return m ? m[0].replace(/\n$/, "") : null;
}
function setFrontmatterField(lfText, key, rendered) {
  const m = /^---\n(?:([\s\S]*?)\n)?---(?=\n|$)/.exec(lfText);
  if (!m) throw new Error("no frontmatter");
  const block = m[1] ?? "";
  const lines = block === "" ? [] : block.split("\n");
  const line = `${key}: ${rendered}`;
  const at = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (at === -1) lines.push(line);
  else lines[at] = line;
  return `---
${lines.join("\n")}
---${lfText.slice(m[0].length)}`;
}
function numberTaken(entries, n, ownName) {
  return entries.some((e) => {
    if (e === ownName) return false;
    const m = /^(\d{4})-.+\.md$/.exec(e);
    return m?.[1] !== void 0 && Number(m[1]) === n;
  });
}

export {
  ADR_FILE_RE,
  adrFileName,
  nextAdrNumber,
  statusKind,
  pad4,
  adrId,
  parseAdrRef,
  adrNumberFrom,
  supersededStatus,
  localDate,
  renderAdr,
  placeholdersIn,
  statusOf,
  frontmatterBlock,
  setFrontmatterField,
  numberTaken
};
//# sourceMappingURL=chunk-5VA3OZXQ.mjs.map