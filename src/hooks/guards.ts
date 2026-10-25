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
const MENTION_SRC = String.raw`(?:^|[\s"'\`=(:,])((?:${SEG}*/)?(?:\.c(?:o(?:n(?:t(?:e(?:x(?:t)?)?)?)?)?)?[*?\[{]${SEG}*|\.context/${SEGNS}*[*?\[{]${SEG}*|\.context(?:/(?:STATE\.md|tasks\.jsonl|memories\.jsonl|decisions(?:/${SEG}*)?|\.cache(?:/${SEG}*)?))?/?|\.beads(?:/${SEG}*)?))(?=$|[\s"'\`;|&<>()])`;
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

const WRAPPERS = new Set(["sudo", "env", "command", "nohup", "time"]);

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
  /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|WriteAllText|WriteAllLines|WriteAllBytes|AppendAllText|AppendAllLines|file_put_contents|Set-Content|Add-Content|Out-File|Tee-Object|New-Item|Remove-Item|Move-Item|Clear-Content)\b|\b(?:rmSync|rmdirSync|rmdir|rm|unlinkSync|unlink|renameSync|rename|copyFileSync|copyFile)\s*\(|(?:File|Directory)\]::(?:Delete|Move|Copy)\b|\bos\.(?:remove|unlink|rename)\b|\bshutil\.|\bf?open\s*\([^)]*['"][wax][bt+]{0,2}['"]/i;

/**
 * Bodies of the `$(…)` and backtick substitutions in a command, outside single quotes
 * (where the shell runs them). An unclosed substitution runs to the end of the text.
 */
function substitutions(text: string): string[] {
  const out: string[] = [];
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
    } else if (ch === "'" && quote === null) {
      quote = "'";
    } else if (ch === '"') {
      quote = quote === '"' ? null : '"';
    } else if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      out.push(text.slice(i + 1, end < 0 ? text.length : end));
      i = end < 0 ? text.length : end;
    } else if (ch === "$" && text[i + 1] === "(") {
      let depth = 1;
      let j = i + 2;
      for (; j < text.length && depth > 0; j++) {
        if (text[j] === "(") depth++;
        else if (text[j] === ")") depth--;
      }
      out.push(text.slice(i + 2, depth === 0 ? j - 1 : j));
      i = j - 1;
    }
  }
  return out;
}

/** Shell commands a git invocation runs: `rebase --exec`, `bisect run`, `submodule foreach`, `-c alias.x=!…`. */
function gitNestedCommands(seg: string, rest: string[], sub: string | null): string[] {
  const out: string[] = [];
  const alias =
    /(?:^|\s)-c\s+(?:'alias\.[^\s=']+=!([^']*)'?|"alias\.[^\s="]+=!([^"]*)"?|alias\.[^\s=]+=(?:'!([^']*)'?|"!([^"]*)"?|!(\S*)))/gi;
  for (const m of seg.matchAll(alias)) out.push(m.slice(1).find((g) => g !== undefined) ?? "");
  if (sub === "rebase") {
    for (const m of seg.matchAll(/(?:^|\s)(?:--exec[=\s]|-x)\s*("[^"]*"?|'[^']*'?|\S+)/g)) {
      out.push(unquote(m[1] ?? ""));
    }
  } else if (sub === "bisect" || sub === "submodule") {
    const at = rest.findIndex((w) => w.toLowerCase() === (sub === "bisect" ? "run" : "foreach"));
    if (at >= 0) {
      const tail = rest.slice(at + 1).filter((w, i) => !(i === 0 && w === "--recursive"));
      out.push(unquote(tail.join(" ")));
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

function segmentWrites(seg: string, out: string[]): void {
  for (const m of seg.matchAll(/(^|[^<>=-])(>>?)\s*("[^"]*"|'[^']*'|[^\s;|&<>()]+)/g)) {
    const hit = tokenMention(m[3] ?? "");
    if (hit) out.push(hit);
  }
  const words = wordsOf(seg);
  const ni = nameIndex(words);
  if (ni < 0) return;
  const name = commandName(words[ni] ?? "");
  const rest = words.slice(ni + 1);
  const mentions = mentionsIn(seg);
  if (mentions.length > 0) {
    // A substitution, a git exec form or `rg --pre` runs code even in a data-argument command.
    let runsCode = substitutions(seg).length > 0;
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
      const nested = gitNestedCommands(seg, rest, sub);
      if (nested.length > 0) runsCode = true;
      for (const n of nested) out.push(...shellWriteTargets(n));
    } else if (name === "rg" && rgRunsPre(rest)) {
      out.push(...mentions);
    } else if (ALL_MENTIONS.has(name)) {
      out.push(...mentions);
    }
    if ((runsCode || mayRunWriteApi(name, rest)) && WRITE_API_RE.test(seg)) out.push(...mentions);
  }
  if (NESTED_SHELLS.has(name)) {
    const at = rest.findIndex((w) => ["-c", "/c", "-command"].includes(w.toLowerCase()));
    if (at >= 0) out.push(...shellWriteTargets(unquote(rest.slice(at + 1).join(" "))));
  }
}

/** Protected mentions a shell command writes, normalised, deduped, in order. */
export function shellWriteTargets(command: string): string[] {
  const out: string[] = [];
  for (const seg of shellSegments(command)) segmentWrites(seg, out);
  for (const body of substitutions(command)) out.push(...shellWriteTargets(body));
  return [...new Set(out)];
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
    const m = shellWriteTargets(cmd)[0];
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
