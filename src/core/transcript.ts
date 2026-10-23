/**
 * Claude Code session transcript (JSONL) reader for `baton stats`.
 *
 * The format is undocumented and changes between versions, so parsing is
 * lenient: unknown record types are skipped, malformed lines are counted, not
 * fatal. Facts this relies on are recorded in
 * docs/research/2026-10-16-implementation-notes.md (section 4).
 */

import type { Dirent } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

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

/** `<CLAUDE_CONFIG_DIR or ~/.claude>/projects`, where Claude Code keeps per-project transcripts. */
export function claudeProjectsDir(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  return join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "projects");
}

/**
 * Transcript folders for a project root. A project has one folder, but its
 * name can differ in case from the encoded cwd (drive letter on Windows), so
 * the match is case-insensitive on win32 only.
 */
export async function findProjectTranscriptDirs(
  root: string,
  opts: { projectsDir?: string; platform?: NodeJS.Platform } = {},
): Promise<string[]> {
  const projectsDir = opts.projectsDir ?? claudeProjectsDir();
  const platform = opts.platform ?? process.platform;
  const encoded = encodeProjectDir(root);
  let entries: Dirent[];
  try {
    entries = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const matches = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter(
      (name) =>
        name === encoded || (platform === "win32" && name.toLowerCase() === encoded.toLowerCase()),
    );
  const others = matches.filter((n) => n !== encoded).sort();
  const ordered = matches.includes(encoded) ? [encoded, ...others] : others;
  return ordered.map((name) => join(projectsDir, name));
}

export interface TranscriptFile {
  path: string;
  sessionId: string;
  mtimeMs: number;
}

/** Session transcripts (`*.jsonl` files directly in `dirs`), newest first. */
export async function listSessionTranscripts(dirs: string[]): Promise<TranscriptFile[]> {
  const files: TranscriptFile[] = [];
  for (const dir of dirs) {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".jsonl")) continue;
      const path = join(dir, e.name);
      try {
        const s = await stat(path);
        files.push({ path, sessionId: e.name.slice(0, -".jsonl".length), mtimeMs: s.mtimeMs });
      } catch {
        // vanished between readdir and stat
      }
    }
  }
  return files.sort(
    (a, b) => b.mtimeMs - a.mtimeMs || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );
}

/** Parse the last `maxBytes` of a transcript, dropping the partial first line. */
export async function readTranscriptTail(
  path: string,
  maxBytes = 262_144,
): Promise<ParsedTranscript> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    if (size <= maxBytes) return parseTranscript(await handle.readFile("utf8"));
    const buf = Buffer.alloc(maxBytes);
    let read = 0;
    while (read < maxBytes) {
      const { bytesRead } = await handle.read(buf, read, maxBytes - read, size - maxBytes + read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    const text = buf.subarray(0, read).toString("utf8");
    return parseTranscript(text.slice(text.indexOf("\n") + 1));
  } finally {
    await handle.close();
  }
}

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
  timestamp?: string;
  isError: boolean;
}

function contentBlocks(r: TranscriptRecord): Record<string, unknown>[] {
  const content = r.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter(
    (b): b is Record<string, unknown> => !!b && typeof b === "object" && !Array.isArray(b),
  );
}

/** Tool calls in order, de-duplicated by id, with failed results marked. */
export function toolUses(records: TranscriptRecord[]): ToolUse[] {
  const uses = new Map<string, ToolUse>();
  for (const r of records) {
    if (r.type !== "assistant") continue;
    for (const b of contentBlocks(r)) {
      if (b.type !== "tool_use" || typeof b.id !== "string" || typeof b.name !== "string") continue;
      if (uses.has(b.id)) continue;
      const input =
        b.input && typeof b.input === "object" && !Array.isArray(b.input)
          ? (b.input as Record<string, unknown>)
          : {};
      uses.set(b.id, {
        id: b.id,
        name: b.name,
        input,
        ...(typeof r.timestamp === "string" ? { timestamp: r.timestamp } : {}),
        isError: false,
      });
    }
  }
  for (const r of records) {
    if (r.type !== "user") continue;
    for (const b of contentBlocks(r)) {
      if (b.type !== "tool_result" || b.is_error !== true) continue;
      const use = typeof b.tool_use_id === "string" ? uses.get(b.tool_use_id) : undefined;
      if (use) use.isError = true;
    }
  }
  return [...uses.values()];
}

/** Redaction and path shortening look at this many characters of a line; the display cut is 80. */
const MAX_SCAN = 1024;

/**
 * Mask common credential shapes. Applied to everything that can reach a committed file.
 * Only the first 1024 characters are examined and returned (with a trailing "…" when cut):
 * some patterns are quadratic on long adversarial input, and the hooks that call this have
 * a hard time budget. Dropping the tail can never leak a secret.
 */
export function redactSecrets(text: string): string {
  const head = text.length > MAX_SCAN ? `${text.slice(0, MAX_SCAN)}…` : text;
  return (
    head
      .replace(/\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/g, "[redacted]")
      .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[redacted]")
      .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "[redacted]")
      .replace(/\bglpat-[A-Za-z0-9_-]{16,}/g, "[redacted]")
      .replace(/\bAIza[0-9A-Za-z_-]{30,}/g, "[redacted]")
      .replace(/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, "[redacted]")
      .replace(/\bnpm_[A-Za-z0-9]{36}/g, "[redacted]")
      .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]")
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]")
      .replace(/\b(Authorization\s*[:=]\s*)(token|bearer|basic)\s+\S+/gi, "$1$2 [redacted]")
      // URL userinfo, with or without a password. The password may contain "@" or "/", so the
      // colon form runs greedily to the last "@" of the token. "host:8080/a@b" is a port, not userinfo.
      .replace(
        /\b([a-z][a-z0-9+.-]{0,31}:\/\/)(?:[^\s/@:]*:(?!\d+(?:[/?#]|$))\S*@|[^\s/@:]+@)/gi,
        "$1[redacted]@",
      )
      .replace(/\b(curl\b[^\n]*?\s(?:-u|--user)[\s=]*)([^\s:]*):\S+/gi, "$1$2:[redacted]")
      // `mysql -pSECRET` (attached) and `docker login -p SECRET` (separate). Port maps,
      // `mkdir -pv` and the like are left alone.
      .replace(/(?<![\w-])(-p)(?!\d+(?::\d+){0,2}(?:\s|$))[^\s-]\S{3,}/g, "$1[redacted]")
      .replace(/(\b(?:login|sshpass)\b[^\n]*?\s-p\s+)("[^"]*"|'[^']*'|\S+)/g, "$1[redacted]")
      // Each [\w-] run is bounded so a long run of dashes cannot go quadratic.
      .replace(
        /(?<![\w-])(--?[\w-]{0,64}?(?:password|passwd|secret|token|api[_-]?key)[\w-]{0,64}|--(?:pass|pw|pwd|auth|credentials?)(?![\w-]))(\s+|=)("[^"]*"|'[^']*'|\S+)/gi,
        "$1$2[redacted]",
      )
      // `aws configure set aws_secret_access_key VALUE`: a space, not "=", before the value.
      .replace(
        /(\b(?:set|config|configure)\s+(?:--?[\w-]+\s+){0,4}[\w.:/-]{0,64}(?:secret_access_key|password|passwd|secret|token)[\w.:/-]{0,64}\s+)("[^"]*"|'[^']*'|\S+)/gi,
        "$1[redacted]",
      )
      // netrc: `machine h login u password SECRET`
      .replace(
        /(\blogin\s+\S{1,64}\s+(?:password|passwd)\s+)("[^"]*"|'[^']*'|[^\s'"]+)/gi,
        "$1[redacted]",
      )
      .replace(
        /(?<!\$)\b([A-Za-z0-9_]*(?:password|passwd|pwd|secret|token|api[_-]?key)[A-Za-z0-9_]*)(["']?)\s*[=:]\s*("[^"]*"|'[^']*'|\S+)/gi,
        "$1$2=[redacted]",
      )
  );
}

const MAX_ARG = 80;

const PATH_REST = "[^\\s\"'`<>|;&()]+";
/**
 * Absolute paths inside free text: Windows drive (`C:\x`, `C:/x`), `file://`,
 * UNC (`\\host\x`, `//host/x`), WSL (`/mnt/c/x`), Git Bash (`/c/x`) and POSIX
 * home-like folders. The lookbehinds skip ordinary URLs such as `https://h/home/x`.
 */
const ABSOLUTE_PATH_TOKEN = new RegExp(
  [
    `(?<![A-Za-z0-9_])[A-Za-z]:[\\\\/]${PATH_REST}`,
    `(?<![\\w.~/\\\\-])file:\\/\\/${PATH_REST}`,
    `(?<![\\w.:~/\\\\-])(?:\\\\\\\\|\\/\\/)[^\\s\\\\/"'\`<>|;&()]+[\\\\/]${PATH_REST}`,
    `(?<![\\w.:~/\\\\-])\\/mnt\\/[A-Za-z]\\/${PATH_REST}`,
    `(?<![\\w.:~/\\\\-])\\/[A-Za-z]\\/${PATH_REST}`,
    `(?<![\\w.:~/\\\\-])\\/(?:home|Users|root)\\/${PATH_REST}`,
  ].join("|"),
  "g",
);

/** Normalise a matched path token and shorten it like a path argument. */
function shortenPathToken(tok: string, root: string, platform: NodeJS.Platform): string {
  let p = tok.replace(/\\/g, "/");
  if (p.startsWith("file://")) {
    p = p.slice("file://".length).replace(/^\/+(?=[A-Za-z]:)/, "");
    if (!/^[A-Za-z]:\//.test(p)) p = `/${p.replace(/^\/+/, "")}`;
  } else if (platform === "win32") {
    // Git Bash `/c/x` and WSL `/mnt/c/x` name the drive `c:`.
    p = p.replace(/^(?:\/mnt)?\/([A-Za-z])\//, "$1:/");
  }
  return shownPath(p, root, platform);
}

/** Redact, optionally shorten out-of-repo absolute paths in free text, then cut to 80 chars. */
function bounded(text: string, root: string, platform: NodeJS.Platform, paths = false): string {
  let s = redactSecrets(text);
  if (paths) s = s.replace(ABSOLUTE_PATH_TOKEN, (tok) => shortenPathToken(tok, root, platform));
  return s.length > MAX_ARG ? `${s.slice(0, MAX_ARG)}…` : s;
}

/** Repo-relative path when under `root`, `…/<file>` for other absolute paths. */
function shownPath(p: string, root: string, platform: NodeJS.Platform): string {
  const a = p.replace(/\\/g, "/");
  const r = root.replace(/\\/g, "/").replace(/\/$/, "");
  const under =
    platform === "win32"
      ? a.toLowerCase().startsWith(`${r.toLowerCase()}/`)
      : a.startsWith(`${r}/`);
  if (under) return a.slice(r.length + 1);
  if (/^[A-Za-z]:\//.test(a) || a.startsWith("/")) return `…/${a.slice(a.lastIndexOf("/") + 1)}`;
  return a;
}

const PATH_TOOLS = new Set(["Read", "Edit", "Write", "MultiEdit", "NotebookEdit"]);

/** One redacted, bounded line per tool call, safe to commit in STATE.md. */
export function summarizeToolUse(
  t: ToolUse,
  root: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  let line: string;
  if (PATH_TOOLS.has(t.name)) {
    const p = str(t.input.file_path) ?? str(t.input.notebook_path);
    line = p ? `${t.name} ${bounded(shownPath(p, root, platform), root, platform)}` : t.name;
  } else if (t.name === "Bash") {
    const cmd = str(t.input.command);
    line =
      cmd === undefined
        ? t.name
        : `Bash: ${bounded(cmd.split(/\r?\n/)[0] ?? "", root, platform, true)}`;
  } else if (t.name === "Grep" || t.name === "Glob") {
    const pattern = str(t.input.pattern);
    line = pattern === undefined ? t.name : `${t.name} ${bounded(pattern, root, platform, true)}`;
  } else if (t.name === "Task" || t.name === "Agent") {
    const d = str(t.input.description);
    line = d === undefined ? t.name : `${t.name}: ${bounded(d, root, platform, true)}`;
  } else {
    line = t.name;
  }
  return t.isError ? `${line} (failed)` : line;
}

/** Summaries of the last `limit` tool calls, oldest first. */
export function recentToolCalls(
  records: TranscriptRecord[],
  root: string,
  limit: number,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const uses = toolUses(records);
  return uses
    .slice(Math.max(0, uses.length - limit))
    .map((t) => summarizeToolUse(t, root, platform));
}
