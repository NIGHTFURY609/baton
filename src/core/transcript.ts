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
import { isTaskIdShape } from "./tasks/native/ids.js";

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
  return redactHead(capScan(text));
}

/**
 * Cut to MAX_SCAN. A token the cut lands inside is dropped whole: its fragment could be too
 * short for a secret pattern to match yet still be shown (e.g. after path shortening pulls it
 * into the 80-char window).
 */
function capScan(text: string): string {
  return text.length <= MAX_SCAN ? text : `${headAtBoundary(text, /\s/)}…`;
}

/**
 * The first MAX_SCAN characters of a longer text, cut back to the last `boundary` character
 * when the cut lands inside a token, so no fragment of that token is kept.
 */
function headAtBoundary(text: string, boundary: RegExp): string {
  const head = text.slice(0, MAX_SCAN);
  if (boundary.test(text.charAt(MAX_SCAN))) return head;
  for (let i = head.length - 1; i >= 0; i--) {
    if (boundary.test(head.charAt(i))) return head.slice(0, i);
  }
  return "";
}

function redactHead(head: string): string {
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
      // openssl pass-phrase syntax (`-passin pass:SECRET`, `-pass pass:SECRET`, ...). `env:` and
      // `file:` name where the secret lives, not the secret, and are kept.
      .replace(/\bpass:("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/g, "pass:[redacted]")
      // `mysql -pSECRET` and `mysql -p"my secret"` (attached), `docker login -p SECRET` (separate).
      // Port maps, `mkdir -pv` and the like are left alone. A bare `-password`, `-passwd`,
      // `-passphrase`, `-passin`, `-passout`, `-pass`, `-pw` or `-pwd` flag is left to the flag
      // rule below, which redacts the value after it. An unclosed quote runs to the end of the text.
      .replace(/(?<![\w-])(-p)(?:"[^"]*(?:"|$)|'[^']*(?:'|$))/g, "$1[redacted]")
      .replace(/(?<![\w-])(-p)(?!\d+(?::\d+){0,2}(?:\s|$))[^\s-]\S{3,}/g, (m, flag: string) =>
        /^-p(?:ass(?:word|wd|phrase|in|out)?|wd?)(?:=|\s|$)/i.test(m) ? m : `${flag}[redacted]`,
      )
      .replace(
        /(\b(?:login|sshpass)\b[^\n]*?\s-p\s+)("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/g,
        "$1[redacted]",
      )
      // Capital `-P` is a password only for these: `zip -P SECRET`, `unzip -P SECRET`, `7z a -P SECRET`.
      // The search stops at `&&`, `||`, `;` and `|`, so a later `grep -P` is left alone.
      .replace(
        /(\b(?:zip|unzip|7z|7za|7zr)\b[^\n&|;]*?\s-P\s+)("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/g,
        "$1[redacted]",
      )
      // `openssl enc -k SECRET`
      .replace(/(\bopenssl\b[^\n]*?\s-k\s+)("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/g, "$1[redacted]")
      // PowerShell: `-Password (ConvertTo-SecureString 'SECRET' -AsPlainText -Force)`. Every quoted
      // literal in the cmdlet's arguments (up to `)`, `|`, `;` or the end) goes, wherever it sits,
      // as does an unquoted value after `-String` or in first position.
      .replace(/\bConvertTo-SecureString(?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^)|;"'])*/gi, (seg) =>
        seg
          .replace(/"[^"]*(?:"|$)|'[^']*(?:'|$)/g, "[redacted]")
          .replace(/(\s-String\s+)[^\s)|;[]+/gi, "$1[redacted]")
          .replace(/^(ConvertTo-SecureString\s+)[^\s)|;[-][^\s)|;[]*/i, "$1[redacted]"),
      )
      // Each [\w-] run is bounded so a long run of dashes cannot go quadratic.
      .replace(
        /(?<![\w-])(--?[\w-]{0,64}?(?:password|passwd|passphrase|passin|passout|storepass|keypass|secret|token|api[_-]?key)[\w-]{0,64}|-(?:-(?:auth|credentials?)|-?(?:pass|pw|pwd))(?![\w-]))(\s+|=)("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/gi,
        "$1$2[redacted]",
      )
      // `aws configure set aws_secret_access_key VALUE`: a space, not "=", before the value.
      .replace(
        /(\b(?:set|config|configure)\s+(?:--?[\w-]+\s+){0,4}[\w.:/-]{0,64}(?:secret_access_key|password|passwd|secret|token)[\w.:/-]{0,64}\s+)("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/gi,
        "$1[redacted]",
      )
      // netrc: `machine h login u password SECRET`
      .replace(
        /(\blogin\s+\S{1,64}\s+(?:password|passwd)\s+)("[^"]*(?:"|$)|'[^']*(?:'|$)|[^\s'"]+)/gi,
        "$1[redacted]",
      )
      .replace(
        /(?<!\$)\b([A-Za-z0-9_]*(?:password|passwd|pwd|secret|token|api[_-]?key)[A-Za-z0-9_]*)(["']?)\s*[=:]\s*("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/gi,
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

/** The shell grammar a command line is read with. */
export type ShellDialect = "bash" | "powershell";

/**
 * Shell tools whose `command` is summarised by command names only (as SHELL_TOOLS in
 * hooks/guards.ts), with their grammar. Gemini's `run_shell_command` may run either.
 */
const SHELL_SUMMARY_TOOLS = new Map<string, ShellDialect | undefined>([
  ["Bash", "bash"],
  ["PowerShell", "powershell"],
  ["run_shell_command", undefined],
]);

/** A simple command of a shell line and the operator after it. */
interface ShellPart {
  words: string[];
  op: string;
}

/** PowerShell also reads typographic quotes as quotes. */
const isDoubleQuote = (c: string, ps: boolean): boolean =>
  c === '"' || (ps && (c === "“" || c === "”" || c === "„"));
const isSingleQuote = (c: string, ps: boolean): boolean =>
  c === "'" || (ps && (c === "‘" || c === "’" || c === "‚" || c === "‛"));

/** Whether a Bash `case` keyword starts at `i` (after a separator, before a blank). */
function startsCase(line: string, i: number): boolean {
  return (
    line.startsWith("case", i) &&
    (i === 0 || /[\s;&|(]/.test(line.charAt(i - 1))) &&
    /\s/.test(line.charAt(i + 4))
  );
}

/**
 * Split one shell line into simple commands and their words. Quotes, escaped characters
 * (Bash `\` outside single quotes, PowerShell's backtick) and groups ((), {}, `$( )` and
 * `${ }` also inside double quotes, Bash backticks and `[[ ]]`) are kept whole and never
 * split, so text inside them can never become a command name. Redirections (`2>&1`, `>|`,
 * `<&3`) stay inside their word. An unclosed quote or group runs to the end of the line; a
 * comment and PowerShell's `--%` end the scan, and a Bash `case` makes the rest of the line
 * one opaque word. Every doubt keeps more text inside one word, so a summary can only show
 * less.
 */
function shellParts(line: string, dialect: ShellDialect): ShellPart[] {
  const ps = dialect === "powershell";
  const escapeChar = ps ? "`" : "\\";
  const parts: ShellPart[] = [];
  let words: string[] = [];
  let word = "";
  /** Open quotes and groups, innermost last: ' $' " ( { ` [[ */
  const open: string[] = [];
  const endWord = (): void => {
    if (word !== "") words.push(word);
    word = "";
  };
  const endPart = (op: string): void => {
    endWord();
    parts.push({ words, op });
    words = [];
  };
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i);
    const next = line.charAt(i + 1);
    const top = open[open.length - 1];
    if (top === "'") {
      word += c;
      if (isSingleQuote(c, ps)) open.pop();
      continue;
    }
    if (c === escapeChar) {
      word += c + next;
      i++;
      continue;
    }
    if (top === "$'") {
      word += c;
      if (c === "'") open.pop();
      continue;
    }
    if (top === '"') {
      word += c;
      if (isDoubleQuote(c, ps)) open.pop();
      else if (c === "$" && (next === "(" || next === "{")) {
        word += next;
        open.push(next);
        i++;
      } else if (!ps && c === "`") open.push("`");
      continue;
    }
    // Outside quotes: at the top level or inside a group.
    const prev = line.charAt(i - 1);
    const lengthOf = prev === "{" && line.charAt(i - 2) === "$"; // ${#name}
    if (c === "#" && !lengthOf && (word === "" || /[\s;&|(){}]/.test(prev))) break; // comment
    if (ps && c === "<" && next === "#") break; // <# block comment #>
    if (isDoubleQuote(c, ps)) open.push('"');
    else if (isSingleQuote(c, ps)) open.push("'");
    else if (!ps && c === "$" && next === "'") {
      open.push("$'");
      word += c;
      i++;
      word += next;
      continue;
    } else if (!ps && c === "`") {
      if (top === "`") open.pop();
      else open.push("`");
    } else if (c === "(" || c === "{") open.push(c);
    else if ((c === ")" && top === "(") || (c === "}" && top === "{")) open.pop();
    else if (!ps && open.length === 0 && word === "" && c === "[" && next === "[") {
      open.push("[[");
      word += "[[";
      i++;
      continue;
    } else if (
      top === "[[" &&
      c === "]" &&
      next === "]" &&
      /\s/.test(line.charAt(i - 1)) &&
      /^(?:$|[\s;&|)])/.test(line.charAt(i + 2))
    ) {
      open.pop();
      word += "]]";
      i++;
      continue;
    } else if (open.length > 0) {
      // Inside a group: kept whole. A Bash `case` pattern's `)` would close a `$( )` early,
      // so a `case` inside a group makes the rest of the line opaque.
      if (!ps && startsCase(line, i)) {
        word += line.slice(i);
        break;
      }
    } else if (ps && word === "" && line.startsWith("--%", i)) {
      // Stop-parsing token: what follows is passed on verbatim, so the scan ends here.
      word = line.slice(i);
      break;
    } else if (!ps && word === "case" && /[\s;&|]/.test(c)) {
      // An unquoted `case` word, wherever it stands (`f() case`, `coproc case`, `echo case;`):
      // a case statement's patterns and `;;` are not commands, so the rest of the line is one
      // opaque argument.
      endWord();
      const rest = line.slice(i).trim();
      if (rest !== "") words.push(rest);
      break;
    } else if (/\s/.test(c)) {
      endWord();
      continue;
    } else if (c === "&" && (prev === ">" || prev === "<" || next === ">")) {
      // 2>&1, &>, <&3
    } else if (c === "|" && prev === ">") {
      // >| (clobber)
    } else if ((c === "&" || c === "|") && next === c) {
      endPart(c + c);
      i++;
      continue;
    } else if (c === "&" || c === "|" || c === ";") {
      endPart(c);
      continue;
    }
    word += c;
  }
  endPart("");
  return parts.filter((p) => p.words.length > 0);
}

const SHELL_WRAPPERS = new Set(["sudo", "env", "command", "nohup", "time"]);
const ASSIGNMENT = /^[A-Za-z_]\w*=/;
const SAFE_NAME = /^[A-Za-z0-9_][\w.+-]*$/;
const SCRIPT_NAME = /^[\w:.-]+$/;

/** What handoff knows about the project, so a summary can show these words and no others. */
export interface ShellKnownWords {
  /** The native task id prefix (`bt`); without it no task id is shown. */
  taskPrefix?: string;
  /** Ids of the tasks the store returned; a task id is shown only if it is one of them. */
  taskIds?: ReadonlySet<string>;
  /** Script names of the root package.json; without them no `npm run` script is shown. */
  npmScripts?: ReadonlySet<string>;
}

/** git's built-in commands (`git help -a`: porcelain and common plumbing). */
const GIT_SUBCOMMANDS = new Set(
  (
    "add am annotate apply archive bisect blame branch bugreport bundle cat-file check-attr " +
    "check-ignore check-mailmap check-ref-format checkout checkout-index cherry cherry-pick citool " +
    "clean clone column commit commit-graph commit-tree config count-objects credential describe " +
    "diff diff-files diff-index diff-tree difftool fast-export fast-import fetch fetch-pack " +
    "filter-branch fmt-merge-msg for-each-ref for-each-repo format-patch fsck gc " +
    "get-tar-commit-id grep gui hash-object help index-pack init instaweb interpret-trailers log " +
    "ls-files ls-remote ls-tree mailinfo mailsplit maintenance merge merge-base merge-file " +
    "merge-index merge-tree mergetool mktag mktree multi-pack-index mv name-rev notes " +
    "pack-objects pack-redundant pack-refs patch-id prune prune-packed pull push range-diff " +
    "read-tree rebase reflog remote repack replace request-pull rerere reset restore rev-list " +
    "rev-parse revert rm send-email send-pack shortlog show show-branch show-index show-ref " +
    "sparse-checkout stash status stripspace submodule switch symbolic-ref tag unpack-file " +
    "unpack-objects update-index update-ref update-server-info var verify-commit verify-pack " +
    "verify-tag version whatchanged worktree write-tree"
  ).split(" "),
);

/** git global options that take the next word as their value (git.c, handle_options). */
const GIT_VALUE_OPTIONS = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--config-env",
  "--attr-source",
  "--shallow-file",
]);
/** git global options that may carry an attached `=value`. */
const GIT_EQUALS_OPTIONS = new Set([
  ...[...GIT_VALUE_OPTIONS].filter((o) => o.startsWith("--")),
  "--exec-path",
  "--list-cmds",
]);
/** git global options without a value. */
const GIT_FLAGS = new Set([
  "-p",
  "-P",
  "-v",
  "-h",
  "--paginate",
  "--no-pager",
  "--bare",
  "--no-replace-objects",
  "--literal-pathspecs",
  "--no-literal-pathspecs",
  "--glob-pathspecs",
  "--noglob-pathspecs",
  "--icase-pathspecs",
  "--no-optional-locks",
  "--no-advice",
  "--exec-path",
  "--html-path",
  "--man-path",
  "--info-path",
  "--version",
  "--help",
]);

/**
 * baton's commands (`baton --help`), each mapped to whether its first argument is a task id.
 * `task` and `hook` are groups: their action is shown too.
 */
const BATON_COMMANDS = new Map<string, boolean>([
  ["init", false],
  ["mission", false],
  ["handoff", false],
  ["drift", false],
  ["verify-doc", false],
  ["decide", false],
  ["verify", true],
  ["explain", false],
  ["compile", false],
  ["stats", false],
  ["remember", false],
  ["recall", false],
  ["forget", false],
  ["memories", false],
  ["mcp", false],
  ["help", false],
]);
const BATON_GROUPS = new Map<string, Map<string, boolean>>([
  [
    "task",
    new Map([
      ["create", false],
      ["list", false],
      ["show", true],
      ["ready", false],
      ["blocked", false],
      ["update", true],
      ["close", true],
      ["reopen", true],
      ["delete", true],
      ["dep", false],
      ["comment", true],
      ["import", false],
      ["help", false],
    ]),
  ],
  [
    "hook",
    new Map(
      ["session-start", "pre-compact", "session-end", "pre-tool-use", "post-tool-use", "stop"].map(
        (e): [string, boolean] => [e, false],
      ),
    ),
  ],
]);

const withCount = (shown: string[], rest: number): string =>
  rest > 0 ? `${shown.join(" ")} (+${rest} args)` : shown.join(" ");

/** The words shown for git: a built-in subcommand after known global options, else none. */
function gitShown(rest: string[]): string[] {
  for (let i = 0; i < rest.length; i++) {
    const w = rest[i] ?? "";
    if (GIT_VALUE_OPTIONS.has(w)) i++;
    else if (GIT_FLAGS.has(w)) continue;
    else if (w.startsWith("-")) {
      const eq = w.indexOf("=");
      if (eq === -1 || !GIT_EQUALS_OPTIONS.has(w.slice(0, eq))) return [];
    } else return GIT_SUBCOMMANDS.has(w) ? [w] : [];
  }
  return [];
}

/**
 * The words shown for baton: a known command, a group's known action, then a task id for
 * the commands that take one, when the word is a task of the store with the project's prefix.
 */
function batonShown(rest: string[], known: ShellKnownWords): string[] {
  const sub = rest[0] ?? "";
  const shown = [sub];
  const group = BATON_GROUPS.get(sub);
  let takesId = BATON_COMMANDS.get(sub);
  if (group !== undefined) {
    const action = rest[1] ?? "";
    takesId = group.get(action);
    if (takesId === undefined) return shown;
    shown.push(action);
  } else if (takesId === undefined) {
    return [];
  }
  const id = rest[shown.length] ?? "";
  const { taskPrefix, taskIds } = known;
  if (takesId && taskPrefix !== undefined && taskIds?.has(id) && isTaskIdShape(id, taskPrefix)) {
    shown.push(id);
  }
  return shown;
}

/** One simple command as its name, an allowlisted subcommand and an argument count. */
function summarizeShellPart(
  words: string[],
  dialect: ShellDialect,
  known: ShellKnownWords,
): string {
  let i = 0;
  let wrapper = -1;
  while (i < words.length) {
    const w = words[i] ?? "";
    if (SHELL_WRAPPERS.has(w.toLowerCase())) {
      if (wrapper === -1) wrapper = i;
    } else if (dialect !== "bash" || !ASSIGNMENT.test(w)) break; // PowerShell has no NAME=value prefix
    i++;
  }
  if (i >= words.length) {
    // Only assignments, or a wrapper with no command after it (bare `time`).
    if (wrapper === -1) return "(assignment)";
    return withCount([(words[wrapper] ?? "").toLowerCase()], words.length - wrapper - 1);
  }
  const raw = (words[i] ?? "").replace(/\\/g, "/");
  const name = raw.slice(raw.lastIndexOf("/") + 1);
  if (!SAFE_NAME.test(name)) return "(expression)";
  const rest = words.slice(i + 1);
  const cmd = name.toLowerCase().replace(/\.(?:exe|cmd)$/, "");
  const firstArg = (rest[0] ?? "").replace(/\\/g, "/");
  if (cmd === "node" && /(?:^|\/)baton\.mjs$/i.test(firstArg)) {
    const args = rest.slice(1);
    const shown = batonShown(args, known);
    return withCount(["baton", ...shown], args.length - shown.length);
  }
  if (cmd === "baton" || cmd === "baton.mjs") {
    const shown = batonShown(rest, known);
    return withCount(["baton", ...shown], rest.length - shown.length);
  }
  if (cmd === "git") {
    const shown = gitShown(rest);
    return withCount([name, ...shown], rest.length - shown.length);
  }
  if (cmd === "npm" && rest[0] === "run") {
    const script = rest[1] ?? "";
    if (known.npmScripts?.has(script) && SCRIPT_NAME.test(script)) {
      return withCount([name, "run", script], rest.length - 2);
    }
    return withCount([name, "run"], rest.length - 1);
  }
  return withCount([name], rest.length);
}

/**
 * The first line of a command, scanned up to MAX_SCAN characters. A longer line is cut back
 * to the last space or operator before the cut, so no fragment of a word is read.
 */
function scannedLine(command: string): { line: string; cut: boolean } {
  const head = command.slice(0, MAX_SCAN + 1);
  const nl = head.search(/\r?\n/);
  if (nl !== -1) return { line: head.slice(0, nl), cut: false };
  if (head.length <= MAX_SCAN) return { line: head, cut: false };
  return { line: headAtBoundary(head, /[\s;&|]/), cut: true };
}

/**
 * A shell command line as command names only (ADR 0024): each simple command shows its
 * name, plus the subcommand for `git <sub>` (a built-in subcommand), `npm run <script>` (a
 * script of `known.npmScripts`) and `baton <sub> [<action>] [task-id]` (an id of
 * `known.taskIds` with `known.taskPrefix`), plus `(+N args)`. Arguments never appear, so no secret or path in
 * them reaches STATE.md. Without a dialect, both grammars must agree, or the whole line
 * shows as `(expression)`.
 */
export function summarizeShellCommand(
  command: string,
  dialect?: ShellDialect,
  known: ShellKnownWords = {},
): string {
  if (dialect === undefined) {
    const bash = summarizeShellCommand(command, "bash", known);
    return bash === summarizeShellCommand(command, "powershell", known) ? bash : "(expression)";
  }
  const { line, cut } = scannedLine(command);
  const summary = shellParts(line, dialect)
    .map((p) => {
      const s = summarizeShellPart(p.words, dialect, known);
      if (p.op === "") return s;
      return p.op === ";" ? `${s};` : `${s} ${p.op}`;
    })
    .join(" ")
    .replace(/ (?:&&|\|\||\||&)$|;$/, "");
  if (!cut) return summary;
  return summary === "" ? "…" : `${summary} …`;
}

/** One redacted, bounded line per tool call, safe to commit in STATE.md. */
export function summarizeToolUse(
  t: ToolUse,
  root: string,
  platform: NodeJS.Platform = process.platform,
  known: ShellKnownWords = {},
): string {
  const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  let line: string;
  if (PATH_TOOLS.has(t.name)) {
    const p = str(t.input.file_path) ?? str(t.input.notebook_path);
    line = p ? `${t.name} ${bounded(shownPath(p, root, platform), root, platform)}` : t.name;
  } else if (SHELL_SUMMARY_TOOLS.has(t.name)) {
    const cmd = str(t.input.command);
    line =
      cmd === undefined
        ? t.name
        : `${t.name}: ${bounded(summarizeShellCommand(cmd, SHELL_SUMMARY_TOOLS.get(t.name), known), root, platform)}`;
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
  known: ShellKnownWords = {},
): string[] {
  const uses = toolUses(records);
  return uses
    .slice(Math.max(0, uses.length - limit))
    .map((t) => summarizeToolUse(t, root, platform, known));
}
