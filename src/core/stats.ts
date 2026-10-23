/**
 * Per-session metrics derived from a Claude Code transcript (ADR 0016).
 *
 * Doc tokens, corrections and "time to first edit" are estimates or
 * heuristics, and are documented as such in docs/design/metrics.md. A
 * `SessionMetrics` record holds derived numbers only, never transcript text.
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { CHARS_PER_TOKEN, PACKET_HEADER } from "./budget.js";
import { readDriftLog } from "./drift.js";
import { BatonError } from "./errors.js";
import { ContextPaths, contextPath } from "./paths.js";
import { writeFileAtomic } from "./tasks/native/jsonl.js";
import {
  findProjectTranscriptDirs,
  firstTurnContextTokens,
  listSessionTranscripts,
  parseTranscript,
  sumUsage,
  type TranscriptRecord,
  toolUses,
  type Usage,
} from "./transcript.js";

export interface SessionMetrics {
  v: 1;
  sessionId: string;
  source: "transcript" | "snapshot";
  startedAt: string | null;
  endedAt: string | null;
  firstTurnContextTokens: number | null;
  usage: Usage;
  docReads: number;
  docReadChars: number;
  packetInjections: number;
  packetChars: number;
  docTokensEstimate: number;
  tasksClosed: string[];
  corrections: number;
  secondsToFirstEdit: number | null;
  hookErrors: number;
  malformedLines: number;
}

export const CORRECTION_RE =
  /^(?:no\b|nope\b|wrong\b|stop\b|undo\b|revert\b|don['’]?t\b|do not\b|that['’]?s (?:not|wrong)\b|that is (?:not|wrong)\b|we (?:decided|agreed)\b|actually\b|not (?:that|what)\b)/i;

export function isCorrection(prompt: string): boolean {
  return CORRECTION_RE.test(prompt.trim().replace(/^[^A-Za-z]+/, ""));
}

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const TASK_ID_RE = /^[a-z0-9]+-[a-z0-9]+(?:\.\d+)*$/;

type Block = Record<string, unknown>;

function blocksOf(r: TranscriptRecord): Block[] {
  const content = r.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter((b): b is Block => !!b && typeof b === "object" && !Array.isArray(b));
}

/** Text of real user prompts, in order: no tool results, meta or compact summaries, tag-only text. */
export function userPrompts(records: TranscriptRecord[]): { text: string; timestamp?: string }[] {
  const out: { text: string; timestamp?: string }[] = [];
  for (const r of records) {
    if (r.type !== "user" || r.isMeta === true || r.isCompactSummary === true) continue;
    const content = r.message?.content;
    let text: string;
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      const blocks = blocksOf(r);
      if (blocks.some((b) => b.type === "tool_result")) continue;
      text = blocks
        .filter(
          (b): b is Block & { text: string } =>
            b.type === "text" && typeof b.text === "string" && !b.text.trimStart().startsWith("<"),
        )
        .map((b) => b.text)
        .join("\n");
    } else {
      continue;
    }
    text = text.trim();
    if (!text) continue;
    out.push({ text, ...(typeof r.timestamp === "string" ? { timestamp: r.timestamp } : {}) });
  }
  return out;
}

function resultChars(content: unknown): number {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  let n = 0;
  for (const b of content) {
    if (b && typeof b === "object" && (b as Block).type === "text") {
      const t = (b as Block).text;
      if (typeof t === "string") n += t.length;
    }
  }
  return n;
}

function closedTaskIds(command: string): string[] {
  const ids: string[] = [];
  for (const m of command.matchAll(/\btask\s+close\s+([^\n;&|]*)/g)) {
    for (const tok of (m[1] ?? "").split(/\s+/).filter(Boolean)) {
      if (tok.startsWith("-")) break;
      if (TASK_ID_RE.test(tok)) ids.push(tok);
    }
  }
  return ids;
}

export function sessionMetrics(
  allRecords: TranscriptRecord[],
  opts: {
    sessionId: string;
    root: string;
    malformedLines?: number;
    platform?: NodeJS.Platform;
  },
): SessionMetrics {
  const records = allRecords.filter((r) => r.isSidechain !== true);
  const platform = opts.platform ?? process.platform;
  const norm = (p: string): string => {
    const s = p.replace(/\\/g, "/");
    return platform === "win32" ? s.toLowerCase() : s;
  };
  const contextPrefix = `${norm(opts.root).replace(/\/$/, "")}/.context/`;

  let startedAt: string | null = null;
  let endedAt: string | null = null;
  for (const r of records) {
    if (typeof r.timestamp !== "string") continue;
    if (startedAt === null || r.timestamp < startedAt) startedAt = r.timestamp;
    if (endedAt === null || r.timestamp > endedAt) endedAt = r.timestamp;
  }

  const uses = toolUses(records);

  const docIds = new Set<string>();
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
      if (
        b.type === "tool_result" &&
        typeof b.tool_use_id === "string" &&
        docIds.has(b.tool_use_id)
      )
        docReadChars += resultChars(b.content);
    }
  }

  let packetInjections = 0;
  let packetChars = 0;
  let hookErrors = 0;
  for (const r of records) {
    if (r.type !== "attachment") continue;
    const a = r.attachment as Record<string, unknown> | undefined;
    if (!a || typeof a !== "object") continue;
    if (a.type === "hook_additional_context" && a.hookEvent === "SessionStart") {
      const text = Array.isArray(a.content)
        ? a.content.join("\n")
        : typeof a.content === "string"
          ? a.content
          : "";
      if (text.startsWith(PACKET_HEADER)) {
        packetInjections++;
        packetChars += text.length;
      }
    }
    const stderrHit =
      (a.type === "hook_success" || a.type === "hook_non_blocking_error") &&
      String(a.stderr ?? "").includes("baton hook ");
    const commandHit =
      a.type === "hook_non_blocking_error" &&
      /baton/.test(String(a.command ?? "") + JSON.stringify(a.args ?? []));
    if (stderrHit || commandHit) hookErrors++;
  }

  const tasksClosed: string[] = [];
  for (const t of uses) {
    if (t.name !== "Bash" || t.isError || typeof t.input.command !== "string") continue;
    for (const id of closedTaskIds(t.input.command)) {
      if (!tasksClosed.includes(id)) tasksClosed.push(id);
    }
  }

  let secondsToFirstEdit: number | null = null;
  const firstEdit = uses.find((t) => EDIT_TOOLS.has(t.name) && t.timestamp !== undefined);
  if (firstEdit?.timestamp !== undefined && startedAt !== null) {
    secondsToFirstEdit = Math.round(
      (Date.parse(firstEdit.timestamp) - Date.parse(startedAt)) / 1000,
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
    corrections: userPrompts(records)
      .slice(1)
      .filter((p) => isCorrection(p.text)).length,
    secondsToFirstEdit,
    hookErrors,
    malformedLines: opts.malformedLines ?? 0,
  };
}

/** Snapshots live in `.context/.cache/stats/` (git-ignored). */
export const STATS_DIR = "stats";

export interface StatsSummary {
  sessions: number;
  fromSnapshotsOnly: number;
  firstDay: string | null;
  lastDay: string | null;
  startTokens: { median: number; mean: number; min: number; max: number } | null;
  docTokens: {
    total: number;
    medianPerSession: number;
    tasksClosed: number;
    perTask: number | null;
  };
  packet: { sessions: number; avgChars: number; avgTokens: number };
  corrections: { total: number; perSession: number };
  secondsToFirstEdit: { median: number } | null;
  hookErrors: number;
  driftFlags: number;
}

/** Median; an even count rounds the mean of the two middle values. */
export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export function summarize(sessions: SessionMetrics[], driftFlags: number): StatsSummary {
  const starts = sessions
    .map((s) => s.firstTurnContextTokens)
    .filter((n): n is number => n !== null);
  const docTotal = sum(sessions.map((s) => s.docTokensEstimate));
  const tasksClosed = sum(sessions.map((s) => s.tasksClosed.length));
  const injections = sum(sessions.map((s) => s.packetInjections));
  const avgChars = injections
    ? Math.round(sum(sessions.map((s) => s.packetChars)) / injections)
    : 0;
  const corrections = sum(sessions.map((s) => s.corrections));
  const firstEdits = sessions
    .map((s) => s.secondsToFirstEdit)
    .filter((n): n is number => n !== null);
  const days = sessions
    .map((s) => s.startedAt)
    .filter((t): t is string => t !== null)
    .sort();
  return {
    sessions: sessions.length,
    fromSnapshotsOnly: sessions.filter((s) => s.source === "snapshot").length,
    firstDay: days.length ? (days[0] as string).slice(0, 10) : null,
    lastDay: days.length ? (days[days.length - 1] as string).slice(0, 10) : null,
    startTokens: starts.length
      ? {
          median: median(starts),
          mean: Math.round(sum(starts) / starts.length),
          min: Math.min(...starts),
          max: Math.max(...starts),
        }
      : null,
    docTokens: {
      total: docTotal,
      medianPerSession: median(sessions.map((s) => s.docTokensEstimate)),
      tasksClosed,
      perTask: tasksClosed ? Math.round(docTotal / tasksClosed) : null,
    },
    packet: {
      sessions: sessions.filter((s) => s.packetInjections > 0).length,
      avgChars,
      avgTokens: Math.ceil(avgChars / CHARS_PER_TOKEN),
    },
    corrections: {
      total: corrections,
      perSession: sessions.length ? Math.round((corrections / sessions.length) * 100) / 100 : 0,
    },
    secondsToFirstEdit: firstEdits.length ? { median: median(firstEdits) } : null,
    hookErrors: sum(sessions.map((s) => s.hookErrors)),
    driftFlags,
  };
}

export interface StatsOptions {
  sessionPath?: string;
  since?: string;
  projectsDir?: string;
  platform?: NodeJS.Platform;
}

export interface StatsReport {
  projectDirs: string[];
  sessions: SessionMetrics[];
  summary: StatsSummary;
}

async function readSnapshots(dir: string): Promise<SessionMetrics[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const out: SessionMetrics[] = [];
  for (const name of names) {
    try {
      const parsed: unknown = JSON.parse(await readFile(join(dir, name), "utf8"));
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as { v?: unknown }).v === 1 &&
        typeof (parsed as { sessionId?: unknown }).sessionId === "string"
      ) {
        out.push({ ...(parsed as SessionMetrics), source: "snapshot" });
      }
    } catch {
      // unreadable or unparsable snapshot: skip
    }
  }
  return out;
}

/**
 * Metrics for every session of the project: parsed from transcripts (and
 * snapshotted when `.context/` exists), plus snapshots of sessions whose
 * transcript has been deleted (ADR 0016). Works without `.context/`.
 */
export async function collectStats(root: string, opts: StatsOptions = {}): Promise<StatsReport> {
  if (opts.since !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(opts.since)) {
    throw new BatonError("since must be YYYY-MM-DD");
  }
  const dirs = opts.sessionPath
    ? []
    : await findProjectTranscriptDirs(root, {
        ...(opts.projectsDir !== undefined ? { projectsDir: opts.projectsDir } : {}),
        ...(opts.platform !== undefined ? { platform: opts.platform } : {}),
      });
  const files = opts.sessionPath
    ? [{ path: opts.sessionPath, sessionId: basename(opts.sessionPath, ".jsonl") }]
    : await listSessionTranscripts(dirs);

  const hasContext = existsSync(contextPath(root));
  const statsDir = contextPath(root, ContextPaths.cache, STATS_DIR);
  const seen = new Set<string>();
  let sessions: SessionMetrics[] = [];

  for (const file of files) {
    if (seen.has(file.sessionId)) continue;
    seen.add(file.sessionId);
    const parsed = parseTranscript(await readFile(file.path, "utf8"));
    const metrics = sessionMetrics(parsed.records, {
      sessionId: file.sessionId,
      root,
      malformedLines: parsed.malformedLines,
      ...(opts.platform !== undefined ? { platform: opts.platform } : {}),
    });
    sessions.push(metrics);
    if (hasContext) {
      writeFileAtomic(
        join(statsDir, `${file.sessionId}.json`),
        `${JSON.stringify(metrics, null, 2)}\n`,
      );
    }
  }

  if (!opts.sessionPath) {
    for (const snap of await readSnapshots(statsDir)) {
      if (seen.has(snap.sessionId)) continue;
      seen.add(snap.sessionId);
      sessions.push(snap);
    }
  }

  if (opts.since !== undefined) {
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

const fmt = (n: number): string => n.toLocaleString("en-US");

export function renderStats(r: StatsReport): string {
  if (r.sessions.length === 0) {
    return `no sessions found (looked in: ${r.projectDirs.length ? r.projectDirs.join(", ") : "none"})`;
  }
  const s = r.summary;
  const lines = [
    `sessions: ${fmt(s.sessions)} (${s.firstDay} to ${s.lastDay}; ${fmt(s.fromSnapshotsOnly)} from snapshots only)`,
    s.startTokens
      ? `tokens at session start: median ${fmt(s.startTokens.median)} · mean ${fmt(s.startTokens.mean)} · min ${fmt(s.startTokens.min)} · max ${fmt(s.startTokens.max)}`
      : "tokens at session start: no data",
    `doc tokens (estimate, chars/4): total ${fmt(s.docTokens.total)} · median per session ${fmt(s.docTokens.medianPerSession)} · per closed task ${s.docTokens.perTask === null ? "n/a" : fmt(s.docTokens.perTask)} (${fmt(s.docTokens.tasksClosed)} tasks closed)`,
    s.packet.sessions > 0
      ? `baton packet: injected in ${fmt(s.packet.sessions)} session(s), avg ${fmt(s.packet.avgChars)} chars (~${fmt(s.packet.avgTokens)} tokens)`
      : "baton packet: not seen in any session",
    `corrections (keyword heuristic): ${fmt(s.corrections.total)} total, ${s.corrections.perSession.toFixed(2)} per session`,
    s.secondsToFirstEdit
      ? `time to first edit: median ${fmt(s.secondsToFirstEdit.median)} s`
      : "time to first edit: no edits",
    `hook errors (baton): ${fmt(s.hookErrors)}`,
    `drift flags logged: ${fmt(s.driftFlags)}`,
  ];
  return lines.join("\n");
}
