/**
 * Per-session metrics derived from a Claude Code transcript (ADR 0016).
 *
 * Doc tokens, corrections and "time to first edit" are estimates or
 * heuristics, and are documented as such in docs/design/metrics.md. A
 * `SessionMetrics` record holds derived numbers only, never transcript text.
 */

import { CHARS_PER_TOKEN, PACKET_HEADER } from "./budget.js";
import {
  firstTurnContextTokens,
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
