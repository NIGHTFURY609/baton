/**
 * Claude Code session transcript (JSONL) reader for `baton stats`.
 *
 * The format is undocumented and changes between versions, so parsing is
 * lenient: unknown record types are skipped, malformed lines are counted, not
 * fatal. Facts this relies on are recorded in
 * docs/research/2026-10-16-implementation-notes.md (section 4).
 */

export interface Usage {
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
}

export interface TranscriptRecord {
  type?: string;
  uuid?: string;
  timestamp?: string;
  requestId?: string;
  isCompactSummary?: boolean;
  message?: {
    id?: string;
    role?: string;
    usage?: Record<string, unknown>;
    content?: unknown;
  };
  [key: string]: unknown;
}

export interface ParsedTranscript {
  records: TranscriptRecord[];
  malformedLines: number;
}

export function parseTranscript(jsonl: string): ParsedTranscript {
  const records: TranscriptRecord[] = [];
  let malformedLines = 0;
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === "object" && !Array.isArray(value)) records.push(value);
      else malformedLines++;
    } catch {
      malformedLines++;
    }
  }
  return { records, malformedLines };
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Sum token usage across assistant records. One API response is written as
 * several JSONL lines (one per content block) that repeat the same usage, so
 * records are de-duplicated on (message.id, requestId), as ccusage does.
 */
export function sumUsage(records: TranscriptRecord[]): Usage {
  const total: Usage = {
    inputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0,
  };
  const seen = new Set<string>();
  for (const r of records) {
    if (r.type !== "assistant" || !r.message?.usage) continue;
    const key = `${r.message.id ?? r.uuid ?? ""}:${r.requestId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const u = r.message.usage;
    total.inputTokens += num(u.input_tokens);
    total.cacheCreationInputTokens += num(u.cache_creation_input_tokens);
    total.cacheReadInputTokens += num(u.cache_read_input_tokens);
    total.outputTokens += num(u.output_tokens);
  }
  return total;
}

/**
 * Total context the model saw on the first assistant turn: the closest proxy
 * for "tokens at session start" (rules + injected packet + system prompt).
 */
export function firstTurnContextTokens(records: TranscriptRecord[]): number | null {
  const first = records.find((r) => r.type === "assistant" && r.message?.usage);
  if (!first?.message?.usage) return null;
  const u = first.message.usage;
  return num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens);
}

/** Encode a cwd the way Claude Code names its per-project transcript folder. */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}
