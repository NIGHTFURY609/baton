import { posix } from "node:path";
import { frontmatterBlock, statusKind } from "../core/decisions.js";
import { matchesAny } from "../core/glob.js";

/**
 * Paths agents must not edit directly; changes go through the baton CLI.
 * STATE.md is regenerated, decisions are append-only, tasks and memories are
 * changed with `baton task` / `baton remember` (validation, cycle checks and
 * the SQLite cache all depend on it).
 */
export const PROTECTED_GLOBS = [
  ".context/STATE.md",
  ".context/decisions/**",
  ".context/tasks.jsonl",
  ".context/memories.jsonl",
  ".context/.cache/**",
  ".beads/**",
] as const;

/** Edit-like tools per harness and the input field holding the target path. */
const EDIT_TOOLS: Record<string, string[]> = {
  // Claude Code
  Edit: ["file_path"],
  Write: ["file_path"],
  MultiEdit: ["file_path"],
  NotebookEdit: ["notebook_path"],
  // Gemini CLI
  write_file: ["file_path", "absolute_path", "path"],
  replace: ["file_path", "absolute_path", "path"],
};

export function isProtectedPath(repoPath: string): boolean {
  return matchesAny(repoPath, PROTECTED_GLOBS);
}

/** Target paths of an edit-like tool call, as given (absolute or relative). */
export function editTargets(toolName: string, toolInput: Record<string, unknown>): string[] {
  const fields = EDIT_TOOLS[toolName];
  if (fields) {
    return fields.map((f) => toolInput[f]).filter((v): v is string => typeof v === "string");
  }
  // Codex apply_patch: paths appear in "*** Update File: <path>" style headers.
  if (toolName === "apply_patch") {
    const patch = typeof toolInput.input === "string" ? toolInput.input : "";
    return [...patch.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm)].map((m) =>
      (m[1] ?? "").trim(),
    );
  }
  return [];
}

export type ProtectedRule =
  | "state"
  | "tasks"
  | "memories"
  | "cache"
  | "beads"
  | "context-dir"
  | "adr-new"
  | "adr-final"
  | "adr-status"
  | "adr-shell";
export type ProtectedClass = "state" | "tasks" | "memories" | "cache" | "beads" | "decision";

export const SHELL_TOOLS: readonly string[] = ["Bash", "PowerShell", "run_shell_command"];

const isAbs = (p: string): boolean => /^[A-Za-z]:\//.test(p) || p.startsWith("/");

/**
 * Windows treats `STATE.md.`, `STATE.md::$DATA` and `STATE.md:stream` as the same file:
 * drop a stream suffix on the last segment and trailing dots and spaces on every segment.
 */
function winAlias(p: string): string {
  const parts = p.split("/");
  return parts
    .map((seg, i) => {
      if (i === 0 && /^[A-Za-z]:$/.test(seg)) return seg;
      return seg.replace(/:.*$/, "").replace(/[. ]+$/, "");
    })
    .filter((seg, i) => i === 0 || seg !== "")
    .join("/");
}

/** Repo-relative POSIX path of `p` (as a tool gave it), or null when it lies outside `root`. */
export function toRepoTarget(
  p: string,
  root: string,
  cwd: string,
  platform: NodeJS.Platform = process.platform,
): string | null {
  let a = p.trim().replace(/\\/g, "/");
  if (platform === "win32") a = a.replace(/^\/{1,2}[?.]\//, "");
  const r = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const c = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  let abs = posix.normalize(isAbs(a) ? a : posix.join(c, a));
  if (platform === "win32") abs = winAlias(abs);
  const fold = (x: string): string => (platform === "win32" ? x.toLowerCase() : x);
  if (!fold(abs).startsWith(`${fold(r)}/`)) return null;
  return abs.slice(r.length + 1);
}

/** Which protected class a repo-relative POSIX path belongs to. */
export function protectedClass(
  repoPath: string,
  platform: NodeJS.Platform = process.platform,
): ProtectedClass | null {
  const win = platform === "win32";
  const q = win ? winAlias(repoPath).toLowerCase() : repoPath;
  const k = (s: string): string => (win ? s.toLowerCase() : s);
  if (q === k(".context/STATE.md")) return "state";
  if (q === k(".context/tasks.jsonl")) return "tasks";
  if (q === k(".context/memories.jsonl")) return "memories";
  if (q.startsWith(k(".context/.cache/"))) return "cache";
  if (q.startsWith(k(".beads/"))) return "beads";
  const m = /^\.context\/decisions\/(\d{4})-[^/]+\.md$/i.exec(win ? winAlias(repoPath) : repoPath);
  if (m && Number(m[1]) >= 1) return "decision";
  return null;
}

export function shellCommandOf(tool: string, input: Record<string, unknown>): string | null {
  if (!SHELL_TOOLS.includes(tool)) return null;
  const c = input.command;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.filter((x): x is string => typeof x === "string").join(" ");
  return null;
}

/** Split a shell command into simple commands. Backslashes become `/`; `2>&1` is dropped. */
export function shellSegments(command: string): string[] {
  let t = command.replace(/\\/g, "/");
  t = t.replace(/&>>?/g, (m) => (m === "&>>" ? " >> " : " > "));
  t = t.replace(/\d*>&\d*/g, " ");
  return t
    .split(/&&|\|\||[;|&\n\r]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const SEG = String.raw`[^\s"'\`;|&<>()]`;
const SEGNS = String.raw`[^\s"'\`;|&<>()/]`;
/** The path before a mention: no `=`, `:` or `,`, which start a mention of their own (linear scan). */
const SEGP = String.raw`[^\s"'\`;|&<>()=:,]`;
const MENTION_SRC = String.raw`(?:^|[\s"'\`=(:,])((?:${SEGP}*/)?(?:\.c(?:o(?:n(?:t(?:e(?:x(?:t)?)?)?)?)?)?[*?\[{]${SEG}*|\.context/${SEGNS}*[*?\[{]${SEG}*|\.context(?:/(?:STATE\.md|tasks\.jsonl|memories\.jsonl|decisions(?:/${SEG}*)?|\.cache(?:/${SEG}*)?))?/?|\.beads(?:/${SEG}*)?))(?=$|[\s"'\`;|&<>()])`;
const mentionRe = (): RegExp => new RegExp(MENTION_SRC, "gi");
/** Drop leading `./` and the `/` an escaped quote leaves after a file name (`\".context/STATE.md\"`). */
const normMention = (m: string): string =>
  m.replace(/^(?:\.\/)+/, "").replace(/(\.md|\.jsonl)\/$/i, "$1");

function mentionsIn(text: string): string[] {
  return [...text.matchAll(mentionRe())].map((m) => normMention(m[1] ?? ""));
}

const unquote = (s: string): string => {
  const m = /^(["'])([\s\S]*)\1$/.exec(s);
  return m ? (m[2] ?? "") : s;
};

/** The protected mention a single token writes, or null when it is not one. */
function tokenMention(token: string): string | null {
  const m = mentionRe().exec(unquote(token));
  return m ? normMention(m[1] ?? "") : null;
}

const WRAPPERS = new Set(["sudo", "env", "command", "nohup", "time", "{", "!"]);

function wordsOf(seg: string): string[] {
  return seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}

/** Index of the command-name word after env assignments and wrappers, or -1. */
function nameIndex(words: string[]): number {
  let i = 0;
  while (i < words.length) {
    const w = words[i] ?? "";
    if (/^[A-Za-z_]\w*=/.test(w) || WRAPPERS.has(w.toLowerCase())) i++;
    else break;
  }
  return i < words.length ? i : -1;
}

function commandName(word: string): string {
  const w = word.replace(/^["']|["']$/g, "");
  return w
    .slice(w.lastIndexOf("/") + 1)
    .replace(/\.(?:exe|cmd)$/i, "")
    .toLowerCase();
}

const DEST_ONLY = new Set(["cp", "copy", "copy-item", "cpi", "install", "rsync"]);
const ALL_MENTIONS = new Set(
  (
    "rm mv tee tee-object truncate touch dd ln unlink shred set-content add-content out-file " +
    "new-item remove-item move-item clear-content clc rename-item sc ac ni ri mi rni ren rename " +
    "del erase rd rmdir move"
  ).split(" "),
);
const GIT_WRITE = new Set(["checkout", "restore", "rm", "mv"]);
const NESTED_SHELLS = new Set(["bash", "sh", "zsh", "cmd", "pwsh", "powershell"]);
/** Commands whose arguments can be a script that calls a write API. */
const SCRIPT_HOSTS = new Set([
  "node",
  "deno",
  "bun",
  "python",
  "python3",
  "py",
  "perl",
  "ruby",
  "php",
  "pwsh",
  "powershell",
]);
/**
 * Known commands whose arguments are data, not code: a write-API name there is a search
 * pattern, a message or text to print. Their real writes are handled by the rules above.
 */
const DATA_ARG_COMMANDS = new Set([
  ...DEST_ONLY,
  ...ALL_MENTIONS,
  "git",
  "sed",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "findstr",
  "select-string",
  "sls",
  "echo",
  "printf",
  "baton",
]);
const WRITE_API_RE =
  /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|WriteAllText|WriteAllLines|WriteAllBytes|AppendAllText|AppendAllLines|file_put_contents|Set-Content|Add-Content|Out-File|Tee-Object|New-Item|Remove-Item|Move-Item|Clear-Content)\b|\b(?:rmSync|rmdirSync|rmdir|rm|unlinkSync|unlink|renameSync|rename|copyFileSync|copyFile)\s*\(|(?:File|Directory)\]::(?:Delete|Move|Copy)\b|\bos\.(?:remove|unlink|rename)\b|\bshutil\.|\bf?open\s*\([^)]{0,512}['"][wax][bt+]{0,2}['"]/i;

/** A write command or a redirection anywhere in a text, for the depth-cap fail-safe. */
const WRITE_CMD_RE = new RegExp(
  String.raw`(?:^|[\s;|&(){}\x60"'/])(?:${[
    ...ALL_MENTIONS,
    ...DEST_ONLY,
    ...NESTED_SHELLS,
    ...SCRIPT_HOSTS,
    "sed",
    "git",
    "rg",
    "find",
    "xargs",
  ].join("|")})(?:\.exe|\.cmd)?(?=$|[\s;|&(){}\x60"'])|>`,
  "i",
);

/** How deep substitutions, nested shells and git exec forms are followed. */
const MAX_DEPTH = 4;
/** Longer commands are not scanned: every protected mention in them counts as written. */
const MAX_LENGTH = 16_384;
/** Characters the scan may read in all, across every nested call, before it fails safe. */
const WORK_BUDGET = 65_536;

/** Which shell reads the command: Bash escapes with a backslash, PowerShell with a backtick. */
export type ShellDialect = "posix" | "powershell";

/** A piece of code the command runs inline, by position in the text scanned. */
interface Inline {
  open: number;
  bodyStart: number;
  bodyEnd: number;
  /** Nesting level: 0 for a body the shell runs directly from this text. */
  depth: number;
}

type Quote = null | "'" | '"' | "$'";

const HEREDOC_OP = /<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([^\s;|&<>()'"`]+))/y;

/** Index of the start of the line that ends a heredoc begun at `from`, or -1. */
function heredocEnd(text: string, from: number, delim: string, dash: boolean): number {
  for (let i = from; i < text.length; ) {
    const nl = text.indexOf("\n", i);
    const line = text.slice(i, nl < 0 ? text.length : nl).replace(/\r$/, "");
    if ((dash ? line.replace(/^\t+/, "") : line) === delim) return i;
    if (nl < 0) return -1;
    i = nl + 1;
  }
  return -1;
}

/**
 * Find the code a command runs inline, reading quotes and escapes on the raw text: `$(…)`,
 * Bash backticks, process substitution `<(…)` and `>(…)`, PowerShell `@(…)`, and a `( … )`
 * group or subexpression that starts a word outside quotes. Only a real escape character
 * escapes (`\` in Bash, the backtick in PowerShell); `$'…'` is read as unquoted. A heredoc or
 * PowerShell here-string body is scanned on its own, so its quotes cannot hide what follows
 * it; a body the shell expands is also scanned with its quotes taken as literal text.
 * `lit` scans a body whose quotes are literal. An unclosed body runs to the end of the text.
 */
function scanInline(
  text: string,
  dialect: ShellDialect,
  lit: boolean,
  base: number,
  baseDepth: number,
  out: Inline[],
): void {
  const posix = dialect === "posix";
  const esc = posix ? "\\" : "`";
  const stack: { closer: string; quote: Quote; lit: boolean; inline: Inline }[] = [];
  const pending: { delim: string; dash: boolean; quoted: boolean }[] = [];
  let quote: Quote = null;
  let litMode = lit;
  const open = (at: number, bodyStart: number, closer: string): void => {
    const inline = {
      open: base + at,
      bodyStart: base + bodyStart,
      bodyEnd: base + text.length,
      depth: baseDepth + stack.length,
    };
    out.push(inline);
    stack.push({ closer, quote, lit: litMode, inline });
    quote = null;
    litMode = false;
  };
  const close = (at: number): void => {
    const f = stack.pop();
    if (!f) return;
    f.inline.bodyEnd = base + at;
    quote = f.quote;
    litMode = f.lit;
  };
  const body = (from: number, to: number, expands: boolean): void => {
    const t = text.slice(from, to);
    scanInline(t, dialect, false, base + from, baseDepth + stack.length, out);
    if (expands) scanInline(t, dialect, true, base + from, baseDepth + stack.length, out);
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (ch === esc) {
      i++;
      continue;
    }
    if (ch === "\n" && quote === null && pending.length > 0) {
      let pos = i + 1;
      for (const h of pending) {
        const end = heredocEnd(text, pos, h.delim, h.dash);
        body(pos, end < 0 ? text.length : end, !h.quoted);
        if (end < 0) pos = text.length;
        else {
          const nl = text.indexOf("\n", end);
          pos = nl < 0 ? text.length : nl + 1;
        }
      }
      pending.length = 0;
      i = pos - 1;
      continue;
    }
    if (!litMode) {
      if (quote === "$'" || quote === '"') {
        if (ch === (quote === '"' ? '"' : "'")) {
          quote = null;
          continue;
        }
      } else if (ch === "'") {
        quote = posix && text[i - 1] === "$" ? "$'" : "'";
        continue;
      } else if (ch === '"') {
        quote = '"';
        continue;
      }
    }
    const top = stack[stack.length - 1];
    const next = text[i + 1];
    if (posix && ch === "`") {
      if (top?.closer === "`") close(i);
      else open(i, i + 1, "`");
    } else if (ch === ")" && quote === null && top?.closer === ")") {
      close(i);
    } else if (
      next === "(" &&
      (ch === "$" || (!litMode && (ch === "<" || ch === ">" || ch === "@")))
    ) {
      open(i, i + 2, ")");
      i++;
    } else if (litMode || quote !== null) {
      // Nothing else opens inside a quoted string or a literal body.
    } else if (ch === "(" && (i === 0 || /[\s;|&(=,{]/.test(text[i - 1] ?? ""))) {
      open(i, i + 1, ")");
    } else if (posix && ch === "<" && next === "<" && text[i + 2] !== "<") {
      HEREDOC_OP.lastIndex = i;
      const m = HEREDOC_OP.exec(text);
      if (m) {
        const quoted = m[2] !== undefined || m[3] !== undefined || m[0].includes("\\");
        pending.push({ delim: m[2] ?? m[3] ?? m[4] ?? "", dash: m[1] === "-", quoted });
        i = HEREDOC_OP.lastIndex - 1;
      }
    } else if (!posix && ch === "@" && (next === "'" || next === '"')) {
      const nl = /^\r?\n/.exec(text.slice(i + 2, i + 4));
      if (nl) {
        const from = i + 2 + nl[0].length;
        const term = text.indexOf(`\n${next}@`, from - 1);
        const end = term < 0 ? text.length : term + 1;
        body(from, end, next === '"');
        i = term < 0 ? text.length : term + 2;
      }
    }
  }
}

function inlineCode(text: string, dialect: ShellDialect): Inline[] {
  const out: Inline[] = [];
  scanInline(text, dialect, false, 0, 0, out);
  const seen = new Set<string>();
  return out.filter((x) => {
    const k = `${x.open}:${x.bodyEnd}:${x.depth}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** A simple command: normalised text (`\` → `/`) and its span in the scanned text. */
interface Segment {
  text: string;
  start: number;
  end: number;
}

/** {@link shellSegments}, with each segment's span; the normalisation keeps every offset. */
function segmentsOf(command: string): Segment[] {
  const t = command
    .replace(/\\/g, "/")
    .replace(/&>>?/g, (m) => (m === "&>>" ? " >>" : " >"))
    .replace(/\d*>&\d*/g, (m) => " ".repeat(m.length));
  const out: Segment[] = [];
  const push = (a: number, b: number): void => {
    const raw = t.slice(a, b);
    const text = raw.trim();
    if (text === "") return;
    const start = a + raw.length - raw.trimStart().length;
    out.push({ text, start, end: start + text.length });
  };
  let pos = 0;
  for (const m of t.matchAll(/&&|\|\||[;|&\n\r]/g)) {
    push(pos, m.index);
    pos = m.index + m[0].length;
  }
  push(pos, t.length);
  return out;
}

/** Offsets of the words of a segment, as {@link wordsOf} splits them. */
const wordStarts = (seg: string): number[] =>
  [...seg.matchAll(/"[^"]*"|'[^']*'|\S+/g)].map((m) => m.index);

/** Strip one level of shell quoting from a whole-string argument, as the shell would. */
function shellUnquote(s: string, dialect: ShellDialect): string {
  const t = s.trim();
  const dq = /^"([\s\S]*)"$/.exec(t);
  if (dq) {
    const inner = dq[1] ?? "";
    return dialect === "posix"
      ? inner.replace(/\\([\\"$`\n])/g, "$1")
      : inner.replace(/`([\s\S])/g, "$1").replace(/""/g, '"');
  }
  const sq = /^'([\s\S]*)'$/.exec(t);
  if (sq) return dialect === "posix" ? (sq[1] ?? "") : (sq[1] ?? "").replace(/''/g, "'");
  return t;
}

/** An unquoted shell word with its backslash escapes applied (`rm\ x` → `rm x`). */
const unescapeWord = (w: string): string => w.replace(/\\([\s\S])/g, "$1");

/**
 * Shell commands a git invocation runs: `rebase --exec`, `bisect run`, `submodule foreach`,
 * `-c alias.x=!…`. `raw` is the segment's raw text; `seg` the same span normalised.
 */
function gitNestedCommands(raw: string, seg: string, sub: string | null): string[] {
  const out: string[] = [];
  const alias =
    /(?:^|\s)-c\s+(?:'alias\.[^\s=']+=!([^']*)'?|"alias\.[^\s="]+=!([^"]*)"?|alias\.[^\s=]+=(?:'!([^']*)'?|"!([^"]*)"?|!((?:\\[\s\S]|\S)*)))/gi;
  for (const m of raw.matchAll(alias)) {
    const body = m.slice(1).find((g) => g !== undefined) ?? "";
    out.push(m[5] === undefined ? body : unescapeWord(body));
  }
  if (sub === "rebase") {
    const exec =
      /(?:^|\s)(?:--e(?:x(?:e(?:c)?)?)?(?:=|\s+)|-[a-zA-Z]*x\s*)("[^"]*"?|'[^']*'?|(?:\\[\s\S]|[^\s\\])+)/g;
    for (const m of raw.matchAll(exec)) {
      const v = m[1] ?? "";
      out.push(/^["']/.test(v) ? shellUnquote(v, "posix") : unescapeWord(v));
    }
  } else if (sub === "bisect" || sub === "submodule") {
    const words = wordsOf(seg);
    const starts = wordStarts(seg);
    let at = words.findIndex((w) => w.toLowerCase() === (sub === "bisect" ? "run" : "foreach"));
    if (at >= 0) {
      at++;
      while (["-q", "--quiet", "--recursive"].includes(words[at] ?? "")) at++;
      const from = starts[at];
      if (from !== undefined) out.push(shellUnquote(raw.slice(from), "posix"));
    }
  }
  return out;
}

/** `rg --pre <cmd>` runs a program on every file it searches. */
const rgRunsPre = (rest: string[]): boolean =>
  rest.some((w) => w === "--pre" || w.startsWith("--pre="));

function gitSubcommand(rest: string[]): string | null {
  for (let i = 0; i < rest.length; i++) {
    const w = rest[i] ?? "";
    if (w === "-C" || w === "-c") i++;
    else if (w.startsWith("--")) continue;
    else return w.toLowerCase();
  }
  return null;
}

/** `git restore` writes the working tree unless it is limited to the index (`--staged` alone). */
function gitRestoreWrites(rest: string[]): boolean {
  const short = (letter: string) => (w: string) => /^-[A-Za-z]+$/.test(w) && w.includes(letter);
  const staged = rest.some((w) => w === "--staged" || short("S")(w));
  const worktree = rest.some((w) => w === "--worktree" || short("W")(w));
  return !staged || worktree;
}

/**
 * Whether a write-API name in this command can be code: a script host (except baton's
 * own CLI) or anything that is not a known command, such as a PowerShell
 * `[IO.File]::…` expression.
 */
function mayRunWriteApi(name: string, rest: string[]): boolean {
  if (SCRIPT_HOSTS.has(name)) {
    return !(name === "node" && /(?:^|\/)baton\.mjs$/i.test(unquote(rest[0] ?? "")));
  }
  return !DATA_ARG_COMMANDS.has(name);
}

function destinationOf(rest: string[]): string | null {
  const at = rest.findIndex((w) => w.toLowerCase() === "-destination");
  if (at >= 0 && rest[at + 1] !== undefined) return rest[at + 1] ?? null;
  for (let i = rest.length - 1; i >= 0; i--) {
    const w = rest[i] ?? "";
    if (!w.startsWith("-")) return w;
  }
  return null;
}

/** The command name and arguments of a normalised segment, or null when it has none. */
function commandOf(seg: string): { name: string; rest: string[]; ni: number } | null {
  const words = wordsOf(seg);
  const ni = nameIndex(words);
  if (ni < 0) return null;
  return { name: commandName(words[ni] ?? ""), rest: words.slice(ni + 1), ni };
}

/**
 * Drop (as spaces, keeping every offset) the body of a quoted heredoc in the one form
 * that is literal text: `$(cat <<'X' … X)` and nothing else inside the `$( )`, run
 * directly by `git commit`, `git tag`, `gh` or `echo`/`printf`, with nothing piped on.
 * Any candidate outside that form leaves every body in place, to be read as code.
 */
function blankMessageHeredocs(text: string): string {
  const re = /\$\(\s*cat\s+<<(-?)[ \t]*(?:'([^'\n]+)'|"([^"\n]+)"|\\([^\s;|&<>()'"]+))[ \t]*\r?\n/g;
  const found: { open: number; from: number; to: number; close: number }[] = [];
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const delim = m[2] ?? m[3] ?? m[4] ?? "";
    const end = heredocEnd(text, re.lastIndex, delim, m[1] === "-");
    if (end < 0) return text;
    const nl = text.indexOf("\n", end);
    const after = nl < 0 ? text.length : nl + 1;
    const close = /^\s*\)/.exec(text.slice(after, after + 64));
    if (!close) return text;
    found.push({ open: m.index, from: re.lastIndex, to: end, close: after + close[0].length - 1 });
    re.lastIndex = after + close[0].length;
  }
  if (found.length === 0) return text;
  const tops = inlineCode(text, "posix").filter((x) => x.depth === 0);
  const segs = segmentsOf(text);
  for (const f of found) {
    if (!tops.some((x) => x.open === f.open && x.bodyEnd === f.close)) return text;
    const seg = segs.find((s) => s.start <= f.open && f.open < s.end);
    const cmd = seg ? commandOf(seg.text) : null;
    if (!cmd) return text;
    const ok =
      cmd.name === "gh" ||
      cmd.name === "echo" ||
      cmd.name === "printf" ||
      (cmd.name === "git" && ["commit", "tag"].includes(gitSubcommand(cmd.rest) ?? ""));
    if (!ok) return text;
    if (/^[^\n;&]*\|/.test(text.slice(f.close + 1))) return text;
  }
  let out = "";
  let pos = 0;
  for (const f of found) {
    out += text.slice(pos, f.from) + text.slice(f.from, f.to).replace(/[^\n]/g, " ");
    pos = f.to;
  }
  return out + text.slice(pos);
}

class BudgetSpent extends Error {}

interface ScanCtx {
  dialect: ShellDialect;
  depth: number;
  /** Raw text of the command being scanned at this depth (same offsets as its segments). */
  raw: string;
  inline: Inline[];
  work: { used: number };
}

function spend(work: { used: number }, n: number): void {
  work.used += n;
  if (work.used > WORK_BUDGET) throw new BudgetSpent();
}

function segmentWrites(seg: Segment, out: string[], ctx: ScanCtx): void {
  spend(ctx.work, seg.text.length);
  const text = seg.text;
  for (const m of text.matchAll(/(^|[^<>=-])(>>?)\s*("[^"]*"|'[^']*'|[^\s;|&<>()]+)/g)) {
    const hit = tokenMention(m[3] ?? "");
    if (hit) out.push(hit);
  }
  const cmd = commandOf(text);
  if (!cmd) return;
  const { name, rest, ni } = cmd;
  const raw = ctx.raw.slice(seg.start, seg.end);
  const mentions = mentionsIn(text);
  if (mentions.length > 0) {
    // A substitution, a git exec form or `rg --pre` runs code even in a data-argument command.
    let runsCode = ctx.inline.some((x) => x.open >= seg.start && x.open < seg.end);
    if (DEST_ONLY.has(name)) {
      const dest = destinationOf(rest);
      const hit = dest === null ? null : tokenMention(dest);
      if (hit) out.push(hit);
    } else if (name === "sed") {
      if (rest.some((w) => /^-[A-Za-z]*[iI]/.test(w) || /^--in-place(?:=|$)/.test(w))) {
        out.push(...mentions);
      }
    } else if (name === "perl") {
      if (rest.some((w) => /^-\w*i/.test(w))) out.push(...mentions);
    } else if (name === "git") {
      const sub = gitSubcommand(rest);
      if (sub !== null && GIT_WRITE.has(sub) && (sub !== "restore" || gitRestoreWrites(rest))) {
        out.push(...mentions);
      }
      const nested = gitNestedCommands(raw, text, sub);
      if (nested.length > 0) runsCode = true;
      for (const n of nested) out.push(...targetsAt(n, "posix", ctx.depth + 1, ctx.work));
    } else if (name === "rg" && rgRunsPre(rest)) {
      out.push(...mentions);
    } else if (ALL_MENTIONS.has(name)) {
      out.push(...mentions);
    }
    if ((runsCode || mayRunWriteApi(name, rest)) && WRITE_API_RE.test(text)) out.push(...mentions);
  }
  if (NESTED_SHELLS.has(name)) {
    const at = rest.findIndex((w) => ["-c", "/c", "-command"].includes(w.toLowerCase()));
    const from = wordStarts(text)[ni + 1 + at + 1];
    if (at >= 0 && from !== undefined) {
      const inner = name === "pwsh" || name === "powershell" ? "powershell" : "posix";
      const script = shellUnquote(raw.slice(from), ctx.dialect);
      out.push(...targetsAt(script, inner, ctx.depth + 1, ctx.work));
    }
  }
}

/** Every protected mention a text may name, found without the mention regex. */
function capMentions(text: string): string[] {
  const lc = text.toLowerCase().replace(/\\/g, "/");
  const out: string[] = [];
  if (lc.includes(".context")) {
    if (lc.includes("state.md")) out.push(".context/STATE.md");
    if (lc.includes("tasks.jsonl")) out.push(".context/tasks.jsonl");
    if (lc.includes("memories.jsonl")) out.push(".context/memories.jsonl");
    if (lc.includes(".context/.cache")) out.push(".context/.cache");
    if (lc.includes(".context/decisions")) out.push(".context/decisions");
    if (out.length === 0) out.push(".context");
  } else if (/\.c(?:o(?:n(?:t(?:e(?:x(?:t)?)?)?)?)?)?[*?[{]/.test(lc)) {
    out.push(".context");
  }
  if (lc.includes(".beads")) out.push(".beads");
  return out;
}

function targetsAt(
  command: string,
  dialect: ShellDialect,
  depth: number,
  work: { used: number },
): string[] {
  spend(work, command.length);
  // Fail safe past a cap: every protected mention counts as written.
  if (command.length > MAX_LENGTH) return capMentions(command);
  if (depth > MAX_DEPTH) {
    return WRITE_API_RE.test(command) || WRITE_CMD_RE.test(command) ? mentionsIn(command) : [];
  }
  const raw = dialect === "posix" ? blankMessageHeredocs(command) : command;
  const inline = inlineCode(raw, dialect);
  const ctx: ScanCtx = { dialect, depth, raw, inline, work };
  const out: string[] = [];
  for (const seg of segmentsOf(raw)) segmentWrites(seg, out, ctx);
  for (const x of inline) {
    if (x.depth === 0) {
      out.push(...targetsAt(raw.slice(x.bodyStart, x.bodyEnd), dialect, depth + 1, work));
    }
  }
  return [...new Set(out)];
}

/**
 * Protected mentions a shell command writes, normalised, deduped, in order. Past the
 * 64 KiB work budget every protected mention in the command counts as written.
 */
export function shellWriteTargets(command: string, dialect: ShellDialect = "posix"): string[] {
  try {
    return targetsAt(command, dialect, 0, { used: 0 });
  } catch (e) {
    if (e instanceof BudgetSpent) return capMentions(command);
    throw e;
  }
}

/** Shell-side rule for a protected mention. */
export function mentionRule(mention: string): ProtectedRule {
  const lc = mention.toLowerCase();
  if (lc.endsWith("state.md")) return "state";
  if (lc.endsWith("tasks.jsonl")) return "tasks";
  if (lc.endsWith("memories.jsonl")) return "memories";
  if (lc.includes(".context/.cache")) return "cache";
  if (lc.includes(".beads")) return "beads";
  if (lc.includes(".context/decisions")) return "adr-shell";
  return "context-dir";
}

/** Manifests a dependency-adding command would change. */
export function dependencyManifests(command: string): string[] {
  const out: string[] = [];
  for (const seg of shellSegments(command)) {
    const words = wordsOf(seg);
    const ni = nameIndex(words);
    if (ni < 0) continue;
    const name = commandName(words[ni] ?? "");
    const rest = words.slice(ni + 1);
    const sub = (rest[0] ?? "").toLowerCase();
    if (name === "npm") {
      if (
        ["install", "i", "add", "in"].includes(sub) &&
        rest.slice(1).some((w) => !w.startsWith("-"))
      ) {
        out.push("package.json");
      }
    } else if (name === "pnpm" || name === "yarn" || name === "bun") {
      if (sub === "add") out.push("package.json");
    } else if (name === "pip" || name === "pip3" || ["python", "python3", "py"].includes(name)) {
      let args = rest;
      if (name !== "pip" && name !== "pip3") {
        if (rest[0] !== "-m" || (rest[1] ?? "").toLowerCase() !== "pip") continue;
        args = rest.slice(2);
      }
      if ((args[0] ?? "").toLowerCase() !== "install") continue;
      const skipNext = new Set(["-r", "--requirement", "-c", "--constraint", "-e", "--editable"]);
      const left: string[] = [];
      const tail = args.slice(1);
      for (let i = 0; i < tail.length; i++) {
        const w = tail[i] ?? "";
        if (skipNext.has(w)) i++;
        else if (!w.startsWith("-")) left.push(w);
      }
      if (left.length > 0) out.push("requirements.txt", "pyproject.toml");
    } else if ((name === "uv" || name === "poetry") && sub === "add") {
      out.push("pyproject.toml");
    } else if (name === "cargo" && sub === "add") {
      out.push("Cargo.toml");
    } else if (name === "go" && sub === "get") {
      out.push("go.mod");
    }
  }
  return [...new Set(out)];
}

const lf = (s: string): string => s.replace(/\r\n?/g, "\n");

function replaceIn(text: string, edit: Record<string, unknown>): string | null {
  const { old_string: o, new_string: n } = edit;
  if (typeof o !== "string" || typeof n !== "string") return null;
  const oldS = lf(o);
  const newS = lf(n);
  if (oldS === "" || !text.includes(oldS)) return text;
  if (edit.replace_all === true) return text.split(oldS).join(newS);
  const at = text.indexOf(oldS);
  return text.slice(0, at) + newS + text.slice(at + oldS.length);
}

/** The text a file would have after the call, or null when it cannot be replayed. */
export function applyEdits(
  tool: string,
  input: Record<string, unknown>,
  current: string,
): string | null {
  const cur = lf(current.replace(/^\uFEFF/, ""));
  if (tool === "Write" || tool === "write_file") {
    return typeof input.content === "string" ? input.content : null;
  }
  if (tool === "Edit" || tool === "replace") return replaceIn(cur, input);
  if (tool === "MultiEdit") {
    if (!Array.isArray(input.edits)) return null;
    let text = cur;
    for (const e of input.edits) {
      if (typeof e !== "object" || e === null) return null;
      const next = replaceIn(text, e as Record<string, unknown>);
      if (next === null) return null;
      text = next;
    }
    return text;
  }
  return null;
}

/** Line heuristic for `apply_patch`: does a +/- line touch a frontmatter key? */
export function patchTouchesFrontmatter(patch: string): boolean {
  return /^[+-][ \t]*(?:status|supersedes|verified_at|id|kind)[ \t]*:/m.test(patch);
}

export interface AdrState {
  exists: boolean;
  status: string | null;
}

export interface GuardEnv {
  root: string;
  cwd: string;
  platform: NodeJS.Platform;
  adrState(repoPath: string): AdrState;
  /** The file's current text, or null when unreadable. */
  readText(repoPath: string): string | null;
}

export interface Denial {
  rule: ProtectedRule;
  path: string;
  reason: string;
}

export function denyReason(rule: ProtectedRule, path: string, status?: string): string {
  const num = /(\d{4})-/.exec(path)?.[1] ?? "NNNN";
  switch (rule) {
    case "state":
      return "baton: .context/STATE.md is generated by `baton handoff` and is never edited by hand (ADR 0024). `baton handoff` regenerates it; lasting notes go in a task comment (`baton task comment <id> …`), a knowledge file or a decision.";
    case "tasks":
      return "baton: .context/tasks.jsonl is the task store and changes only through `baton task …` (ADR 0009): create, update --claim, comment, dep add, close. `baton verify <id>` runs a task's check and closes it.";
    case "memories":
      return "baton: .context/memories.jsonl changes only through `baton remember` and `baton forget` (ADR 0009).";
    case "cache":
      return "baton: .context/.cache/ is baton's local cache and is rebuilt automatically; nothing in it needs a hand edit.";
    case "beads":
      return "baton: .beads/ belongs to Beads; change it with `bd`.";
    case "context-dir":
      return "baton: the .context/ directory holds baton's committed state; move or delete files in it through baton commands, not the shell.";
    case "adr-new":
      return 'baton: new decision records are created with `baton decide "<title>" --spec <ids>` (ADR 0018), which numbers the file and writes the MADR skeleton; the body of a proposed record can then be edited.';
    case "adr-final":
      return `baton: ${path} has status "${status ?? "unknown"}" and is append-only (ADR 0001). A changed decision is a new record: \`baton decide "<title>" --supersedes ${num}\`.`;
    case "adr-status":
      return `baton: the frontmatter of ${path} (status, supersedes, verified_at …) changes only through \`baton decide --accept ${num}\` or a superseding record (ADR 0018); edit the body below the frontmatter.`;
    case "adr-shell":
      return "baton: decision records are written by `baton decide` (ADR 0018); only a proposed record's body may be edited, with the edit tools.";
  }
}

function decisionDenial(
  tool: string,
  input: Record<string, unknown>,
  rp: string,
  env: GuardEnv,
): Denial | null {
  const deny = (rule: ProtectedRule, status?: string): Denial => ({
    rule,
    path: rp,
    reason: denyReason(rule, rp, status),
  });
  const st = env.adrState(rp);
  if (!st.exists) return deny("adr-new");
  if (statusKind(st.status ?? "") !== "proposed") return deny("adr-final", st.status ?? "unknown");
  const current = env.readText(rp);
  if (current === null) return deny("adr-status");
  if (tool === "apply_patch") {
    const patch = typeof input.input === "string" ? input.input : "";
    return patchTouchesFrontmatter(patch) ? deny("adr-status") : null;
  }
  const next = applyEdits(tool, input, current);
  if (next === null) return deny("adr-status");
  return frontmatterBlock(next) !== frontmatterBlock(current) ? deny("adr-status") : null;
}

/** The first protected target a tool call would change, or null. */
export function checkToolCall(
  tool: string,
  input: Record<string, unknown>,
  env: GuardEnv,
): Denial | null {
  const cmd = shellCommandOf(tool, input);
  if (cmd !== null) {
    // Gemini's run_shell_command may run either shell: read it both ways, either deny wins.
    const dialects: ShellDialect[] =
      tool === "PowerShell"
        ? ["powershell"]
        : tool === "run_shell_command"
          ? ["posix", "powershell"]
          : ["posix"];
    const m = dialects.flatMap((d) => shellWriteTargets(cmd, d))[0];
    if (m === undefined) return null;
    const rule = mentionRule(m);
    return { rule, path: m, reason: denyReason(rule, m) };
  }
  for (const p of editTargets(tool, input)) {
    const rp = toRepoTarget(p, env.root, env.cwd, env.platform);
    if (rp === null) continue;
    const cls = protectedClass(rp, env.platform);
    if (cls === null) continue;
    if (cls === "decision") {
      const d = decisionDenial(tool, input, rp, env);
      if (d) return d;
      continue;
    }
    return { rule: cls, path: rp, reason: denyReason(cls, rp) };
  }
  return null;
}

/** Kept for existing callers: does the command write any protected target? */
export function shellMayWriteProtected(command: string): boolean {
  return shellWriteTargets(command).length > 0;
}
