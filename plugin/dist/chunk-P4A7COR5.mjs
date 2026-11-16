#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  findProjectTranscriptDirs,
  listSessionTranscripts,
  readTranscriptTail,
  recentToolCalls
} from "./chunk-JONWDC7U.mjs";
import {
  readTaskSnapshot
} from "./chunk-6V7F4CRM.mjs";
import {
  currentBranch,
  diffStat,
  headSha,
  isGitRepo,
  porcelainPath,
  statusLines
} from "./chunk-MEHZNG47.mjs";
import {
  resolvePrefix
} from "./chunk-M47P2UXW.mjs";
import {
  readTextOrEmpty,
  writeFileAtomic
} from "./chunk-QYQVMIUC.mjs";
import {
  contextPath
} from "./chunk-HVIRJWHJ.mjs";

// src/core/handoff.ts
import { basename, join } from "path";
var STATE_PATH = ".context/STATE.md";
var HANDOFF_LIMITS = {
  ready: 5,
  closed: 5,
  toolCalls: 10,
  statusLines: 30,
  statLines: 30,
  summaryItems: 3
};
var prio = (t) => t.priority === void 0 ? "" : ` P${t.priority}`;
var day = (iso) => iso.slice(0, 10);
function summaryList(items) {
  if (items.length === 0) return "none";
  const shown = items.slice(0, HANDOFF_LIMITS.summaryItems).join("; ");
  const more = items.length - HANDOFF_LIMITS.summaryItems;
  return more > 0 ? `${shown} (+${more} more)` : shown;
}
function lastHandoffLine(d) {
  const head = d.head === null ? "none" : d.head.slice(0, 12);
  let where = "";
  if (!d.git) where = " (not a git repository)";
  else if (d.branch !== null) where = ` on branch ${d.branch}`;
  else where = " on a detached HEAD";
  return `Last handoff: ${d.generatedAt} (${d.reason}) at commit ${head}${where}.`;
}
function workingTreeSummary(d) {
  if (!d.git) return "not a git repository";
  if (d.status.length === 0) return "clean";
  const last = d.diffStat[d.diffStat.length - 1]?.trim();
  const stat = last !== void 0 && /\bchanged\b/.test(last) ? `; ${last}` : "";
  return `${d.status.length} changed path(s)${stat}`;
}
function fenced(lines) {
  return ["```text", ...lines, "```"];
}
function workingTreeSection(d) {
  if (!d.git) return ["- not a git repository"];
  if (d.status.length === 0) return ["- clean"];
  const cap = HANDOFF_LIMITS.statusLines;
  if (d.status.length <= cap) return fenced(d.status);
  return fenced([...d.status.slice(0, cap), `\u2026 ${d.status.length - cap} more`]);
}
function diffStatSection(d) {
  if (!d.git) return ["- not a git repository"];
  if (d.head === null) return ["- no commits yet"];
  if (d.diffStat.length === 0) return ["- no changes against HEAD"];
  const cap = HANDOFF_LIMITS.statLines;
  if (d.diffStat.length <= cap + 1) return fenced(d.diffStat);
  const last = d.diffStat[d.diffStat.length - 1] ?? "";
  return fenced([...d.diffStat.slice(0, cap), `\u2026 ${d.diffStat.length - cap - 1} more files`, last]);
}
function orNone(lines) {
  return lines.length === 0 ? ["- none"] : lines;
}
function renderState(d) {
  const s = d.snapshot;
  const epics = s.openEpics.map((t) => `${t.id} ${t.title}`);
  const closed = s.recentlyClosed.map(
    (t) => t.closedAt === void 0 ? `${t.id} ${t.title}` : `${t.id} ${t.title} (${day(t.closedAt)})`
  );
  const blocked = s.blocked.map((b) => `${b.task.id} by ${b.blockedBy.join(", ")}`);
  const blockedSummary = s.blocked.length === 0 ? "none" : `${s.blocked.length} (${summaryList(blocked)})`;
  const lastCalls = d.toolCalls.length === 0 ? "none recorded" : d.toolCalls.slice(-3).join("; ");
  const inProgress = s.inProgress.map(
    (t) => `- ${t.id}${prio(t)} ${t.title}${t.assignee ? ` (@${t.assignee})` : ""}`
  );
  const ready = s.ready.slice(0, HANDOFF_LIMITS.ready).map((t) => `- ${t.id}${prio(t)} ${t.title}`);
  const recentlyClosed = s.recentlyClosed.map((t) => {
    const when = t.closedAt === void 0 ? "" : ` ${day(t.closedAt)}`;
    const why = t.closeReason ? `: ${t.closeReason}` : "";
    const note = when === "" ? "(closed)" : `(closed${when}${why})`;
    return `- ${t.id} ${t.title} ${note}`;
  });
  const blockedLines = s.blocked.map(
    (b) => `- ${b.task.id} ${b.task.title} (blocked by ${b.blockedBy.join(", ")})`
  );
  const calls = d.toolCalls.length === 0 ? ["- none recorded"] : [
    `From session ${d.sessionId ?? "unknown"} (oldest first):`,
    "",
    ...d.toolCalls.map((c) => `- ${c}`)
  ];
  const lines = [
    "---",
    "id: state",
    "kind: state",
    `verified_at: ${d.head === null ? "null" : `"${d.head.slice(0, 12)}"`}`,
    "source_paths: []",
    "generated_by: baton handoff",
    `generated_at: ${d.generatedAt}`,
    `reason: ${JSON.stringify(d.reason)}`,
    "---",
    "# State",
    "",
    lastHandoffLine(d),
    "",
    "## Summary",
    "",
    `- Open epics: ${summaryList(epics)}`,
    `- Recently closed: ${summaryList(closed)}`,
    `- Blocked: ${blockedSummary}`,
    `- Working tree: ${workingTreeSummary(d)}`,
    `- Last tool calls: ${lastCalls}`,
    "",
    "## In progress",
    "",
    ...orNone(inProgress),
    "",
    "## Ready next",
    "",
    ...orNone(ready),
    "",
    "## Recently closed",
    "",
    ...orNone(recentlyClosed),
    "",
    "## Blocked",
    "",
    ...orNone(blockedLines),
    "",
    "## Working tree",
    "",
    ...workingTreeSection(d),
    "",
    "## Diff stat",
    "",
    ...diffStatSection(d),
    "",
    "## Recent tool calls",
    "",
    ...calls
  ];
  return `${lines.join("\n")}
`;
}
function stripVolatile(text) {
  return text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/^generated_at: .*$/m, "").replace(/^Last handoff: \S+ /m, "Last handoff: ");
}
function npmScriptNames(root) {
  try {
    const pkg = JSON.parse(readTextOrEmpty(join(root, "package.json")) || "null");
    const scripts = pkg !== null && typeof pkg === "object" ? pkg.scripts : void 0;
    if (scripts === null || typeof scripts !== "object" || Array.isArray(scripts)) return void 0;
    return new Set(Object.keys(scripts));
  } catch {
    return void 0;
  }
}
function snapshotTaskIds(s) {
  const ids = /* @__PURE__ */ new Set();
  for (const t of [...s.inProgress, ...s.ready, ...s.recentlyClosed, ...s.openEpics]) ids.add(t.id);
  for (const b of s.blocked) {
    ids.add(b.task.id);
    for (const id of b.blockedBy) ids.add(id);
  }
  return ids;
}
function knownShellWords(root, config, snapshot) {
  const known = {};
  if (config.tasks.backend === "native") {
    known.taskPrefix = resolvePrefix(root, config);
    known.taskIds = snapshotTaskIds(snapshot);
  }
  const scripts = npmScriptNames(root);
  if (scripts !== void 0) known.npmScripts = scripts;
  return known;
}
async function readToolCalls(root, opts, known) {
  try {
    let path = opts.transcriptPath;
    if (path === void 0) {
      const newest = (await listSessionTranscripts(await findProjectTranscriptDirs(root)))[0];
      path = newest?.path;
    }
    if (path === void 0) return { toolCalls: [], sessionId: null };
    const { records } = await readTranscriptTail(path, opts.tailBytes ?? 262144);
    return {
      toolCalls: recentToolCalls(records, root, HANDOFF_LIMITS.toolCalls, process.platform, known),
      sessionId: basename(path).replace(/\.jsonl$/, "")
    };
  } catch {
    return { toolCalls: [], sessionId: null };
  }
}
async function gatherHandoff(root, config, opts) {
  const git = await isGitRepo(root);
  const headP = git ? headSha(root) : Promise.resolve(null);
  const statP = headP.then(async (h) => {
    if (h === null) return "";
    try {
      return await diffStat(root, [STATE_PATH]);
    } catch {
      return "";
    }
  });
  const snapshotP = readTaskSnapshot(root, config, {
    readyLimit: HANDOFF_LIMITS.ready,
    closedLimit: HANDOFF_LIMITS.closed
  });
  const transcriptP = snapshotP.then(
    (s) => readToolCalls(root, opts, knownShellWords(root, config, s))
  );
  const [head, branch, status, stat, snapshot, transcript] = await Promise.all([
    headP,
    git ? currentBranch(root) : Promise.resolve(null),
    git ? statusLines(root) : Promise.resolve([]),
    statP,
    snapshotP,
    transcriptP
  ]);
  return {
    generatedAt: (opts.now ?? /* @__PURE__ */ new Date()).toISOString(),
    reason: opts.reason,
    git,
    head,
    branch,
    snapshot,
    status: status.filter((line) => porcelainPath(line) !== STATE_PATH),
    diffStat: stat === "" ? [] : stat.split("\n"),
    toolCalls: transcript.toolCalls,
    sessionId: transcript.sessionId
  };
}
async function runHandoff(root, config, opts) {
  const text = renderState(await gatherHandoff(root, config, opts));
  const path = contextPath(root, "STATE.md");
  const changed = stripVolatile(readTextOrEmpty(path)) !== stripVolatile(text);
  if (changed && !opts.dryRun) writeFileAtomic(path, text);
  return { text, changed, path };
}

export {
  STATE_PATH,
  HANDOFF_LIMITS,
  renderState,
  stripVolatile,
  gatherHandoff,
  runHandoff
};
//# sourceMappingURL=chunk-P4A7COR5.mjs.map