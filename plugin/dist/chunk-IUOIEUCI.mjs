#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  CHARS_PER_TOKEN,
  PACKET_HEADER,
  readDriftLog
} from "./chunk-TUW6WTQN.mjs";
import {
  findProjectTranscriptDirs,
  firstTurnContextTokens,
  listSessionTranscripts,
  parseTranscript,
  sumUsage,
  toolUses
} from "./chunk-JONWDC7U.mjs";
import {
  BatonError
} from "./chunk-YXJRO53B.mjs";
import {
  writeFileAtomic
} from "./chunk-QYQVMIUC.mjs";
import {
  ContextPaths,
  contextPath
} from "./chunk-HVIRJWHJ.mjs";

// src/core/stats.ts
import { existsSync } from "fs";
import { readdir, readFile } from "fs/promises";
import { basename, join } from "path";
var CORRECTION_RE = /^(?:no\b|nope\b|wrong\b|stop\b|undo\b|revert\b|don['’]?t\b|do not\b|that['’]?s (?:not|wrong)\b|that is (?:not|wrong)\b|we (?:decided|agreed)\b|actually\b|not (?:that|what)\b)/i;
function isCorrection(prompt) {
  return CORRECTION_RE.test(prompt.trim().replace(/^[^A-Za-z]+/, ""));
}
var EDIT_TOOLS = /* @__PURE__ */ new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
var TASK_ID_RE = /^[a-z0-9]+-[a-z0-9]+(?:\.\d+)*$/;
function blocksOf(r) {
  const content = r.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter((b) => !!b && typeof b === "object" && !Array.isArray(b));
}
function userPrompts(records) {
  const out = [];
  for (const r of records) {
    if (r.type !== "user" || r.isMeta === true || r.isCompactSummary === true) continue;
    const content = r.message?.content;
    let text;
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      const blocks = blocksOf(r);
      if (blocks.some((b) => b.type === "tool_result")) continue;
      text = blocks.filter(
        (b) => b.type === "text" && typeof b.text === "string" && !b.text.trimStart().startsWith("<")
      ).map((b) => b.text).join("\n");
    } else {
      continue;
    }
    text = text.trim();
    if (!text) continue;
    out.push({ text, ...typeof r.timestamp === "string" ? { timestamp: r.timestamp } : {} });
  }
  return out;
}
function resultChars(content) {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  let n = 0;
  for (const b of content) {
    if (b && typeof b === "object" && b.type === "text") {
      const t = b.text;
      if (typeof t === "string") n += t.length;
    }
  }
  return n;
}
function closedTaskIds(command) {
  const ids = [];
  for (const m of command.matchAll(/\b(?:task\s+close|verify)\s+([^\n;&|]*)/g)) {
    for (const tok of (m[1] ?? "").split(/\s+/).filter(Boolean)) {
      if (tok.startsWith("-")) break;
      if (TASK_ID_RE.test(tok)) ids.push(tok);
    }
  }
  return ids;
}
function sessionMetrics(allRecords, opts) {
  const records = allRecords.filter((r) => r.isSidechain !== true);
  const platform = opts.platform ?? process.platform;
  const norm = (p) => {
    const s = p.replace(/\\/g, "/");
    return platform === "win32" ? s.toLowerCase() : s;
  };
  const contextPrefix = `${norm(opts.root).replace(/\/$/, "")}/.context/`;
  let startedAt = null;
  let endedAt = null;
  for (const r of records) {
    if (typeof r.timestamp !== "string") continue;
    if (startedAt === null || r.timestamp < startedAt) startedAt = r.timestamp;
    if (endedAt === null || r.timestamp > endedAt) endedAt = r.timestamp;
  }
  const uses = toolUses(records);
  const docIds = /* @__PURE__ */ new Set();
  let docReads = 0;
  for (const t of uses) {
    if (t.name !== "Read" || typeof t.input.file_path !== "string") continue;
    if (norm(t.input.file_path).startsWith(contextPrefix)) {
      docReads++;
      docIds.add(t.id);
    }
  }
  let docReadChars = 0;
  for (const r of records) {
    if (r.type !== "user") continue;
    for (const b of blocksOf(r)) {
      if (b.type === "tool_result" && typeof b.tool_use_id === "string" && docIds.has(b.tool_use_id))
        docReadChars += resultChars(b.content);
    }
  }
  let packetInjections = 0;
  let packetChars = 0;
  let hookErrors = 0;
  for (const r of records) {
    if (r.type !== "attachment") continue;
    const a = r.attachment;
    if (!a || typeof a !== "object") continue;
    if (a.type === "hook_additional_context" && a.hookEvent === "SessionStart") {
      const text = Array.isArray(a.content) ? a.content.join("\n") : typeof a.content === "string" ? a.content : "";
      if (text.startsWith(PACKET_HEADER)) {
        packetInjections++;
        packetChars += text.length;
      }
    }
    const stderrHit = (a.type === "hook_success" || a.type === "hook_non_blocking_error") && String(a.stderr ?? "").includes("baton hook ");
    const commandHit = a.type === "hook_non_blocking_error" && /baton/.test(String(a.command ?? "") + JSON.stringify(a.args ?? []));
    if (stderrHit || commandHit) hookErrors++;
  }
  const tasksClosed = [];
  for (const t of uses) {
    if (t.name !== "Bash" || t.isError || typeof t.input.command !== "string") continue;
    for (const id of closedTaskIds(t.input.command)) {
      if (!tasksClosed.includes(id)) tasksClosed.push(id);
    }
  }
  let secondsToFirstEdit = null;
  const firstEdit = uses.find((t) => EDIT_TOOLS.has(t.name) && t.timestamp !== void 0);
  if (firstEdit?.timestamp !== void 0 && startedAt !== null) {
    secondsToFirstEdit = Math.round(
      (Date.parse(firstEdit.timestamp) - Date.parse(startedAt)) / 1e3
    );
  }
  return {
    v: 1,
    sessionId: opts.sessionId,
    source: "transcript",
    startedAt,
    endedAt,
    firstTurnContextTokens: firstTurnContextTokens(records),
    usage: sumUsage(records),
    docReads,
    docReadChars,
    packetInjections,
    packetChars,
    docTokensEstimate: Math.ceil((docReadChars + packetChars) / CHARS_PER_TOKEN),
    tasksClosed,
    corrections: userPrompts(records).slice(1).filter((p) => isCorrection(p.text)).length,
    secondsToFirstEdit,
    hookErrors,
    malformedLines: opts.malformedLines ?? 0
  };
}
var STATS_DIR = "stats";
function median(xs) {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}
var sum = (xs) => xs.reduce((a, b) => a + b, 0);
function summarize(sessions, driftFlags) {
  const starts = sessions.map((s) => s.firstTurnContextTokens).filter((n) => n !== null);
  const docTotal = sum(sessions.map((s) => s.docTokensEstimate));
  const tasksClosed = sum(sessions.map((s) => s.tasksClosed.length));
  const injections = sum(sessions.map((s) => s.packetInjections));
  const avgChars = injections ? Math.round(sum(sessions.map((s) => s.packetChars)) / injections) : 0;
  const corrections = sum(sessions.map((s) => s.corrections));
  const firstEdits = sessions.map((s) => s.secondsToFirstEdit).filter((n) => n !== null);
  const days = sessions.map((s) => s.startedAt).filter((t) => t !== null).sort();
  return {
    sessions: sessions.length,
    fromSnapshotsOnly: sessions.filter((s) => s.source === "snapshot").length,
    firstDay: days.length ? days[0].slice(0, 10) : null,
    lastDay: days.length ? days[days.length - 1].slice(0, 10) : null,
    startTokens: starts.length ? {
      median: median(starts),
      mean: Math.round(sum(starts) / starts.length),
      min: Math.min(...starts),
      max: Math.max(...starts)
    } : null,
    docTokens: {
      total: docTotal,
      medianPerSession: median(sessions.map((s) => s.docTokensEstimate)),
      tasksClosed,
      perTask: tasksClosed ? Math.round(docTotal / tasksClosed) : null
    },
    packet: {
      sessions: sessions.filter((s) => s.packetInjections > 0).length,
      avgChars,
      avgTokens: Math.ceil(avgChars / CHARS_PER_TOKEN)
    },
    corrections: {
      total: corrections,
      perSession: sessions.length ? Math.round(corrections / sessions.length * 100) / 100 : 0
    },
    secondsToFirstEdit: firstEdits.length ? { median: median(firstEdits) } : null,
    hookErrors: sum(sessions.map((s) => s.hookErrors)),
    driftFlags
  };
}
async function readSnapshots(dir) {
  let names;
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    try {
      const parsed = JSON.parse(await readFile(join(dir, name), "utf8"));
      if (parsed && typeof parsed === "object" && parsed.v === 1 && typeof parsed.sessionId === "string") {
        out.push({ ...parsed, source: "snapshot" });
      }
    } catch {
    }
  }
  return out;
}
function metricsOf(text, sessionId, root, platform) {
  const parsed = parseTranscript(text);
  return sessionMetrics(parsed.records, {
    sessionId,
    root,
    malformedLines: parsed.malformedLines,
    ...platform !== void 0 ? { platform } : {}
  });
}
function writeSnapshot(statsDir, metrics) {
  writeFileAtomic(
    join(statsDir, `${metrics.sessionId}.json`),
    `${JSON.stringify(metrics, null, 2)}
`
  );
}
async function snapshotSession(root, transcriptPath) {
  const text = await readFile(transcriptPath, "utf8");
  const sessionId = basename(transcriptPath, ".jsonl");
  writeSnapshot(
    contextPath(root, ContextPaths.cache, STATS_DIR),
    metricsOf(text, sessionId, root, void 0)
  );
}
async function collectStats(root, opts = {}) {
  if (opts.since !== void 0 && !/^\d{4}-\d{2}-\d{2}$/.test(opts.since)) {
    throw new BatonError("since must be YYYY-MM-DD");
  }
  const dirs = opts.sessionPath ? [] : await findProjectTranscriptDirs(root, {
    ...opts.projectsDir !== void 0 ? { projectsDir: opts.projectsDir } : {},
    ...opts.platform !== void 0 ? { platform: opts.platform } : {}
  });
  const files = opts.sessionPath ? [{ path: opts.sessionPath, sessionId: basename(opts.sessionPath, ".jsonl") }] : await listSessionTranscripts(dirs);
  const hasContext = existsSync(contextPath(root));
  const statsDir = contextPath(root, ContextPaths.cache, STATS_DIR);
  const seen = /* @__PURE__ */ new Set();
  let sessions = [];
  for (const file of files) {
    if (seen.has(file.sessionId)) continue;
    seen.add(file.sessionId);
    let text;
    try {
      text = await readFile(file.path, "utf8");
    } catch {
      throw new BatonError(`cannot read ${file.path}`);
    }
    const metrics = metricsOf(text, file.sessionId, root, opts.platform);
    sessions.push(metrics);
    if (hasContext && !opts.sessionPath) writeSnapshot(statsDir, metrics);
  }
  if (!opts.sessionPath) {
    for (const snap of await readSnapshots(statsDir)) {
      if (seen.has(snap.sessionId)) continue;
      seen.add(snap.sessionId);
      sessions.push(snap);
    }
  }
  if (opts.since !== void 0) {
    const from = `${opts.since}T00:00:00.000Z`;
    sessions = sessions.filter((s) => s.startedAt !== null && s.startedAt >= from);
  }
  sessions.sort((a, b) => {
    if (a.startedAt === b.startedAt) return 0;
    if (a.startedAt === null) return 1;
    if (b.startedAt === null) return -1;
    return a.startedAt < b.startedAt ? -1 : 1;
  });
  const driftFlags = (await readDriftLog(root)).filter((e) => e.event === "flag").length;
  return { projectDirs: dirs, sessions, summary: summarize(sessions, driftFlags) };
}
var fmt = (n) => n.toLocaleString("en-US");
function renderStats(r) {
  if (r.sessions.length === 0) {
    return `no sessions found (looked in: ${r.projectDirs.length ? r.projectDirs.join(", ") : "none"})`;
  }
  const s = r.summary;
  const lines = [
    `sessions: ${fmt(s.sessions)} (${s.firstDay} to ${s.lastDay}; ${fmt(s.fromSnapshotsOnly)} from snapshots only)`,
    s.startTokens ? `tokens at session start: median ${fmt(s.startTokens.median)} \xB7 mean ${fmt(s.startTokens.mean)} \xB7 min ${fmt(s.startTokens.min)} \xB7 max ${fmt(s.startTokens.max)}` : "tokens at session start: no data",
    `doc tokens (estimate, chars/4): total ${fmt(s.docTokens.total)} \xB7 median per session ${fmt(s.docTokens.medianPerSession)} \xB7 per closed task ${s.docTokens.perTask === null ? "n/a" : fmt(s.docTokens.perTask)} (${fmt(s.docTokens.tasksClosed)} tasks closed)`,
    s.packet.sessions > 0 ? `baton packet: injected in ${fmt(s.packet.sessions)} session(s), avg ${fmt(s.packet.avgChars)} chars (~${fmt(s.packet.avgTokens)} tokens)` : "baton packet: not seen in any session",
    `corrections (keyword heuristic): ${fmt(s.corrections.total)} total, ${s.corrections.perSession.toFixed(2)} per session`,
    s.secondsToFirstEdit ? `time to first edit: median ${fmt(s.secondsToFirstEdit.median)} s` : "time to first edit: no edits",
    `hook errors (baton): ${fmt(s.hookErrors)}`,
    `drift flags logged: ${fmt(s.driftFlags)}`
  ];
  return lines.join("\n");
}

export {
  CORRECTION_RE,
  isCorrection,
  userPrompts,
  sessionMetrics,
  STATS_DIR,
  median,
  summarize,
  snapshotSession,
  collectStats,
  renderStats
};
//# sourceMappingURL=chunk-IUOIEUCI.mjs.map