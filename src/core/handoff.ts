/**
 * `baton handoff`: regenerate .context/STATE.md from structured sources only
 * (task store, git status, diff --stat, recent tool calls). Format and
 * idempotence rules: ADR 0023 (superseding ADR 0015).
 */

import { basename } from "node:path";
import type { Config } from "./config.js";
import { currentBranch, diffStat, headSha, isGitRepo, porcelainPath, statusLines } from "./git.js";
import { contextPath } from "./paths.js";
import { readTextOrEmpty, writeFileAtomic } from "./tasks/native/jsonl.js";
import { readTaskSnapshot, type TaskSnapshot } from "./tasks/snapshot.js";
import {
  findProjectTranscriptDirs,
  listSessionTranscripts,
  readTranscriptTail,
  recentToolCalls,
} from "./transcript.js";
import type { Task } from "./types.js";

export const STATE_PATH = ".context/STATE.md";

export const HANDOFF_LIMITS = {
  ready: 5,
  closed: 5,
  toolCalls: 10,
  statusLines: 30,
  statLines: 30,
  summaryItems: 3,
} as const;

export interface HandoffData {
  generatedAt: string;
  reason: string;
  git: boolean;
  head: string | null;
  branch: string | null;
  snapshot: TaskSnapshot;
  /** Uncapped; the renderer caps. */
  status: string[];
  diffStat: string[];
  toolCalls: string[];
  sessionId: string | null;
}

const prio = (t: Task): string => (t.priority === undefined ? "" : ` P${t.priority}`);
const day = (iso: string): string => iso.slice(0, 10);

/** First `summaryItems` items joined with "; ", then " (+n more)". Empty is "none". */
function summaryList(items: string[]): string {
  if (items.length === 0) return "none";
  const shown = items.slice(0, HANDOFF_LIMITS.summaryItems).join("; ");
  const more = items.length - HANDOFF_LIMITS.summaryItems;
  return more > 0 ? `${shown} (+${more} more)` : shown;
}

function lastHandoffLine(d: HandoffData): string {
  const head = d.head === null ? "none" : d.head.slice(0, 12);
  let where = "";
  if (!d.git) where = " (not a git repository)";
  else if (d.branch !== null) where = ` on branch ${d.branch}`;
  else where = " on a detached HEAD";
  return `Last handoff: ${d.generatedAt} (${d.reason}) at commit ${head}${where}.`;
}

function workingTreeSummary(d: HandoffData): string {
  if (!d.git) return "not a git repository";
  if (d.status.length === 0) return "clean";
  const last = d.diffStat[d.diffStat.length - 1]?.trim();
  const stat = last !== undefined && /\bchanged\b/.test(last) ? `; ${last}` : "";
  return `${d.status.length} changed path(s)${stat}`;
}

function fenced(lines: string[]): string[] {
  return ["```text", ...lines, "```"];
}

function workingTreeSection(d: HandoffData): string[] {
  if (!d.git) return ["- not a git repository"];
  if (d.status.length === 0) return ["- clean"];
  const cap = HANDOFF_LIMITS.statusLines;
  if (d.status.length <= cap) return fenced(d.status);
  return fenced([...d.status.slice(0, cap), `… ${d.status.length - cap} more`]);
}

function diffStatSection(d: HandoffData): string[] {
  if (!d.git) return ["- not a git repository"];
  if (d.head === null) return ["- no commits yet"];
  if (d.diffStat.length === 0) return ["- no changes against HEAD"];
  const cap = HANDOFF_LIMITS.statLines;
  if (d.diffStat.length <= cap + 1) return fenced(d.diffStat);
  const last = d.diffStat[d.diffStat.length - 1] ?? "";
  return fenced([...d.diffStat.slice(0, cap), `… ${d.diffStat.length - cap - 1} more files`, last]);
}

function orNone(lines: string[]): string[] {
  return lines.length === 0 ? ["- none"] : lines;
}

/** Pure. LF line endings, ends with a newline. */
export function renderState(d: HandoffData): string {
  const s = d.snapshot;
  const epics = s.openEpics.map((t) => `${t.id} ${t.title}`);
  const closed = s.recentlyClosed.map((t) =>
    t.closedAt === undefined ? `${t.id} ${t.title}` : `${t.id} ${t.title} (${day(t.closedAt)})`,
  );
  const blocked = s.blocked.map((b) => `${b.task.id} by ${b.blockedBy.join(", ")}`);
  const blockedSummary =
    s.blocked.length === 0 ? "none" : `${s.blocked.length} (${summaryList(blocked)})`;
  const lastCalls = d.toolCalls.length === 0 ? "none recorded" : d.toolCalls.slice(-3).join("; ");

  const inProgress = s.inProgress.map(
    (t) => `- ${t.id}${prio(t)} ${t.title}${t.assignee ? ` (@${t.assignee})` : ""}`,
  );
  const ready = s.ready.slice(0, HANDOFF_LIMITS.ready).map((t) => `- ${t.id}${prio(t)} ${t.title}`);
  const recentlyClosed = s.recentlyClosed.map((t) => {
    const when = t.closedAt === undefined ? "" : ` ${day(t.closedAt)}`;
    const why = t.closeReason ? `: ${t.closeReason}` : "";
    const note = when === "" ? "(closed)" : `(closed${when}${why})`;
    return `- ${t.id} ${t.title} ${note}`;
  });
  const blockedLines = s.blocked.map(
    (b) => `- ${b.task.id} ${b.task.title} (blocked by ${b.blockedBy.join(", ")})`,
  );
  const calls =
    d.toolCalls.length === 0
      ? ["- none recorded"]
      : [
          `From session ${d.sessionId ?? "unknown"} (oldest first):`,
          "",
          ...d.toolCalls.map((c) => `- ${c}`),
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
    ...calls,
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * Text with the parts that change on every run removed: one leading BOM, CRLF,
 * the `generated_at` line and the timestamp in the "Last handoff" line.
 */
export function stripVolatile(text: string): string {
  return text
    .replace(/^﻿/, "")
    .replace(/\r\n/g, "\n")
    .replace(/^generated_at: .*$/m, "")
    .replace(/^Last handoff: \S+ /m, "Last handoff: ");
}

export interface HandoffOptions {
  reason: string;
  transcriptPath?: string;
  tailBytes?: number;
  now?: Date;
}

async function readToolCalls(
  root: string,
  opts: HandoffOptions,
): Promise<{ toolCalls: string[]; sessionId: string | null }> {
  try {
    let path = opts.transcriptPath;
    if (path === undefined) {
      const newest = (await listSessionTranscripts(await findProjectTranscriptDirs(root)))[0];
      path = newest?.path;
    }
    if (path === undefined) return { toolCalls: [], sessionId: null };
    const { records } = await readTranscriptTail(path, opts.tailBytes ?? 262_144);
    return {
      toolCalls: recentToolCalls(records, root, HANDOFF_LIMITS.toolCalls),
      sessionId: basename(path).replace(/\.jsonl$/, ""),
    };
  } catch {
    return { toolCalls: [], sessionId: null };
  }
}

export async function gatherHandoff(
  root: string,
  config: Config,
  opts: HandoffOptions,
): Promise<HandoffData> {
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
  const [head, branch, status, stat, snapshot, transcript] = await Promise.all([
    headP,
    git ? currentBranch(root) : Promise.resolve(null),
    git ? statusLines(root) : Promise.resolve([] as string[]),
    statP,
    readTaskSnapshot(root, config, {
      readyLimit: HANDOFF_LIMITS.ready,
      closedLimit: HANDOFF_LIMITS.closed,
    }),
    readToolCalls(root, opts),
  ]);
  return {
    generatedAt: (opts.now ?? new Date()).toISOString(),
    reason: opts.reason,
    git,
    head,
    branch,
    snapshot,
    status: status.filter((line) => porcelainPath(line) !== STATE_PATH),
    diffStat: stat === "" ? [] : stat.split("\n"),
    toolCalls: transcript.toolCalls,
    sessionId: transcript.sessionId,
  };
}

export async function runHandoff(
  root: string,
  config: Config,
  opts: HandoffOptions & { dryRun?: boolean },
): Promise<{ text: string; changed: boolean; path: string }> {
  const text = renderState(await gatherHandoff(root, config, opts));
  const path = contextPath(root, "STATE.md");
  const changed = stripVolatile(readTextOrEmpty(path)) !== stripVolatile(text);
  if (changed && !opts.dryRun) writeFileAtomic(path, text);
  return { text, changed, path };
}
