#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  isTaskIdShape
} from "./chunk-QYQVMIUC.mjs";

// src/core/transcript.ts
import { open, readdir, stat } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
function parseTranscript(jsonl) {
  const records = [];
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
var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : 0;
function sumUsage(records) {
  const total = {
    inputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0
  };
  const seen = /* @__PURE__ */ new Set();
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
function firstTurnContextTokens(records) {
  const first = records.find((r) => r.type === "assistant" && r.message?.usage);
  if (!first?.message?.usage) return null;
  const u = first.message.usage;
  return num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens);
}
function encodeProjectDir(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}
function claudeProjectsDir(env = process.env, home = homedir()) {
  return join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "projects");
}
async function findProjectTranscriptDirs(root, opts = {}) {
  const projectsDir = opts.projectsDir ?? claudeProjectsDir();
  const platform = opts.platform ?? process.platform;
  const encoded = encodeProjectDir(root);
  let entries;
  try {
    entries = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const matches = entries.filter((e) => e.isDirectory()).map((e) => e.name).filter(
    (name) => name === encoded || platform === "win32" && name.toLowerCase() === encoded.toLowerCase()
  );
  const others = matches.filter((n) => n !== encoded).sort();
  const ordered = matches.includes(encoded) ? [encoded, ...others] : others;
  return ordered.map((name) => join(projectsDir, name));
}
async function listSessionTranscripts(dirs) {
  const files = [];
  for (const dir of dirs) {
    let entries;
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
      }
    }
  }
  return files.sort(
    (a, b) => b.mtimeMs - a.mtimeMs || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  );
}
async function readTranscriptTail(path, maxBytes = 262144) {
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
function contentBlocks(r) {
  const content = r.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter(
    (b) => !!b && typeof b === "object" && !Array.isArray(b)
  );
}
function toolUses(records) {
  const uses = /* @__PURE__ */ new Map();
  for (const r of records) {
    if (r.type !== "assistant") continue;
    for (const b of contentBlocks(r)) {
      if (b.type !== "tool_use" || typeof b.id !== "string" || typeof b.name !== "string") continue;
      if (uses.has(b.id)) continue;
      const input = b.input && typeof b.input === "object" && !Array.isArray(b.input) ? b.input : {};
      uses.set(b.id, {
        id: b.id,
        name: b.name,
        input,
        ...typeof r.timestamp === "string" ? { timestamp: r.timestamp } : {},
        isError: false
      });
    }
  }
  for (const r of records) {
    if (r.type !== "user") continue;
    for (const b of contentBlocks(r)) {
      if (b.type !== "tool_result" || b.is_error !== true) continue;
      const use = typeof b.tool_use_id === "string" ? uses.get(b.tool_use_id) : void 0;
      if (use) use.isError = true;
    }
  }
  return [...uses.values()];
}
var MAX_SCAN = 1024;
function redactSecrets(text) {
  return redactHead(capScan(text));
}
function capScan(text) {
  return text.length <= MAX_SCAN ? text : `${headAtBoundary(text, /\s/)}\u2026`;
}
function headAtBoundary(text, boundary) {
  const head = text.slice(0, MAX_SCAN);
  if (boundary.test(text.charAt(MAX_SCAN))) return head;
  for (let i = head.length - 1; i >= 0; i--) {
    if (boundary.test(head.charAt(i))) return head.slice(0, i);
  }
  return "";
}
function redactHead(head) {
  return head.replace(/\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/g, "[redacted]").replace(/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[redacted]").replace(/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "[redacted]").replace(/\bglpat-[A-Za-z0-9_-]{16,}/g, "[redacted]").replace(/\bAIza[0-9A-Za-z_-]{30,}/g, "[redacted]").replace(/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, "[redacted]").replace(/\bnpm_[A-Za-z0-9]{36}/g, "[redacted]").replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]").replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]").replace(/\b(Authorization\s*[:=]\s*)(token|bearer|basic)\s+\S+/gi, "$1$2 [redacted]").replace(
    /\b([a-z][a-z0-9+.-]{0,31}:\/\/)(?:[^\s/@:]*:(?!\d+(?:[/?#]|$))\S*@|[^\s/@:]+@)/gi,
    "$1[redacted]@"
  ).replace(/\b(curl\b[^\n]*?\s(?:-u|--user)[\s=]*)([^\s:]*):\S+/gi, "$1$2:[redacted]").replace(/\bpass:("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/g, "pass:[redacted]").replace(/(?<![\w-])(-p)(?:"[^"]*(?:"|$)|'[^']*(?:'|$))/g, "$1[redacted]").replace(
    /(?<![\w-])(-p)(?!\d+(?::\d+){0,2}(?:\s|$))[^\s-]\S{3,}/g,
    (m, flag) => /^-p(?:ass(?:word|wd|phrase|in|out)?|wd?)(?:=|\s|$)/i.test(m) ? m : `${flag}[redacted]`
  ).replace(
    /(\b(?:login|sshpass)\b[^\n]*?\s-p\s+)("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/g,
    "$1[redacted]"
  ).replace(
    /(\b(?:zip|unzip|7z|7za|7zr)\b[^\n&|;]*?\s-P\s+)("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/g,
    "$1[redacted]"
  ).replace(/(\bopenssl\b[^\n]*?\s-k\s+)("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/g, "$1[redacted]").replace(
    /\bConvertTo-SecureString(?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^)|;"'])*/gi,
    (seg) => seg.replace(/"[^"]*(?:"|$)|'[^']*(?:'|$)/g, "[redacted]").replace(/(\s-String\s+)[^\s)|;[]+/gi, "$1[redacted]").replace(/^(ConvertTo-SecureString\s+)[^\s)|;[-][^\s)|;[]*/i, "$1[redacted]")
  ).replace(
    /(?<![\w-])(--?[\w-]{0,64}?(?:password|passwd|passphrase|passin|passout|storepass|keypass|secret|token|api[_-]?key)[\w-]{0,64}|-(?:-(?:auth|credentials?)|-?(?:pass|pw|pwd))(?![\w-]))(\s+|=)("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/gi,
    "$1$2[redacted]"
  ).replace(
    /(\b(?:set|config|configure)\s+(?:--?[\w-]+\s+){0,4}[\w.:/-]{0,64}(?:secret_access_key|password|passwd|secret|token)[\w.:/-]{0,64}\s+)("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/gi,
    "$1[redacted]"
  ).replace(
    /(\blogin\s+\S{1,64}\s+(?:password|passwd)\s+)("[^"]*(?:"|$)|'[^']*(?:'|$)|[^\s'"]+)/gi,
    "$1[redacted]"
  ).replace(
    /(?<!\$)\b([A-Za-z0-9_]*(?:password|passwd|pwd|secret|token|api[_-]?key)[A-Za-z0-9_]*)(["']?)\s*[=:]\s*("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/gi,
    "$1$2=[redacted]"
  );
}
var MAX_ARG = 80;
var PATH_REST = "[^\\s\"'`<>|;&()]+";
var ABSOLUTE_PATH_TOKEN = new RegExp(
  [
    `(?<![A-Za-z0-9_])[A-Za-z]:[\\\\/]${PATH_REST}`,
    `(?<![\\w.~/\\\\-])file:\\/\\/${PATH_REST}`,
    `(?<![\\w.:~/\\\\-])(?:\\\\\\\\|\\/\\/)[^\\s\\\\/"'\`<>|;&()]+[\\\\/]${PATH_REST}`,
    `(?<![\\w.:~/\\\\-])\\/mnt\\/[A-Za-z]\\/${PATH_REST}`,
    `(?<![\\w.:~/\\\\-])\\/[A-Za-z]\\/${PATH_REST}`,
    `(?<![\\w.:~/\\\\-])\\/(?:home|Users|root)\\/${PATH_REST}`
  ].join("|"),
  "g"
);
function shortenPathToken(tok, root, platform) {
  let p = tok.replace(/\\/g, "/");
  if (p.startsWith("file://")) {
    p = p.slice("file://".length).replace(/^\/+(?=[A-Za-z]:)/, "");
    if (!/^[A-Za-z]:\//.test(p)) p = `/${p.replace(/^\/+/, "")}`;
  } else if (platform === "win32") {
    p = p.replace(/^(?:\/mnt)?\/([A-Za-z])\//, "$1:/");
  }
  return shownPath(p, root, platform);
}
function bounded(text, root, platform, paths = false) {
  let s = redactSecrets(text);
  if (paths) s = s.replace(ABSOLUTE_PATH_TOKEN, (tok) => shortenPathToken(tok, root, platform));
  return s.length > MAX_ARG ? `${s.slice(0, MAX_ARG)}\u2026` : s;
}
function shownPath(p, root, platform) {
  const a = p.replace(/\\/g, "/");
  const r = root.replace(/\\/g, "/").replace(/\/$/, "");
  const under = platform === "win32" ? a.toLowerCase().startsWith(`${r.toLowerCase()}/`) : a.startsWith(`${r}/`);
  if (under) return a.slice(r.length + 1);
  if (/^[A-Za-z]:\//.test(a) || a.startsWith("/")) return `\u2026/${a.slice(a.lastIndexOf("/") + 1)}`;
  return a;
}
var PATH_TOOLS = /* @__PURE__ */ new Set(["Read", "Edit", "Write", "MultiEdit", "NotebookEdit"]);
var SHELL_SUMMARY_TOOLS = /* @__PURE__ */ new Map([
  ["Bash", "bash"],
  ["PowerShell", "powershell"],
  ["run_shell_command", void 0]
]);
var isDoubleQuote = (c, ps) => c === '"' || ps && (c === "\u201C" || c === "\u201D" || c === "\u201E");
var isSingleQuote = (c, ps) => c === "'" || ps && (c === "\u2018" || c === "\u2019" || c === "\u201A" || c === "\u201B");
function startsCase(line, i) {
  return line.startsWith("case", i) && (i === 0 || /[\s;&|(]/.test(line.charAt(i - 1))) && /\s/.test(line.charAt(i + 4));
}
function shellParts(line, dialect) {
  const ps = dialect === "powershell";
  const escapeChar = ps ? "`" : "\\";
  const parts = [];
  let words = [];
  let word = "";
  const open2 = [];
  const endWord = () => {
    if (word !== "") words.push(word);
    word = "";
  };
  const endPart = (op) => {
    endWord();
    parts.push({ words, op });
    words = [];
  };
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i);
    const next = line.charAt(i + 1);
    const top = open2[open2.length - 1];
    if (top === "'") {
      word += c;
      if (isSingleQuote(c, ps)) open2.pop();
      continue;
    }
    if (c === escapeChar) {
      word += c + next;
      i++;
      continue;
    }
    if (top === "$'") {
      word += c;
      if (c === "'") open2.pop();
      continue;
    }
    if (top === '"') {
      word += c;
      if (isDoubleQuote(c, ps)) open2.pop();
      else if (c === "$" && (next === "(" || next === "{")) {
        word += next;
        open2.push(next);
        i++;
      } else if (!ps && c === "`") open2.push("`");
      continue;
    }
    const prev = line.charAt(i - 1);
    const lengthOf = prev === "{" && line.charAt(i - 2) === "$";
    if (c === "#" && !lengthOf && (word === "" || /[\s;&|(){}]/.test(prev))) break;
    if (ps && c === "<" && next === "#") break;
    if (isDoubleQuote(c, ps)) open2.push('"');
    else if (isSingleQuote(c, ps)) open2.push("'");
    else if (!ps && c === "$" && next === "'") {
      open2.push("$'");
      word += c;
      i++;
      word += next;
      continue;
    } else if (!ps && c === "`") {
      if (top === "`") open2.pop();
      else open2.push("`");
    } else if (c === "(" || c === "{") open2.push(c);
    else if (c === ")" && top === "(" || c === "}" && top === "{") open2.pop();
    else if (!ps && open2.length === 0 && word === "" && c === "[" && next === "[") {
      open2.push("[[");
      word += "[[";
      i++;
      continue;
    } else if (top === "[[" && c === "]" && next === "]" && /\s/.test(line.charAt(i - 1)) && /^(?:$|[\s;&|)])/.test(line.charAt(i + 2))) {
      open2.pop();
      word += "]]";
      i++;
      continue;
    } else if (open2.length > 0) {
      if (!ps && startsCase(line, i)) {
        word += line.slice(i);
        break;
      }
    } else if (ps && word === "" && line.startsWith("--%", i)) {
      word = line.slice(i);
      break;
    } else if (!ps && word === "case" && /[\s;&|]/.test(c)) {
      endWord();
      const rest = line.slice(i).trim();
      if (rest !== "") words.push(rest);
      break;
    } else if (/\s/.test(c)) {
      endWord();
      continue;
    } else if (c === "&" && (prev === ">" || prev === "<" || next === ">")) {
    } else if (c === "|" && prev === ">") {
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
var SHELL_WRAPPERS = /* @__PURE__ */ new Set(["sudo", "env", "command", "nohup", "time"]);
var ASSIGNMENT = /^[A-Za-z_]\w*=/;
var SAFE_NAME = /^[A-Za-z0-9_][\w.+-]*$/;
var SCRIPT_NAME = /^[\w:.-]+$/;
var GIT_SUBCOMMANDS = new Set(
  "add am annotate apply archive bisect blame branch bugreport bundle cat-file check-attr check-ignore check-mailmap check-ref-format checkout checkout-index cherry cherry-pick citool clean clone column commit commit-graph commit-tree config count-objects credential describe diff diff-files diff-index diff-tree difftool fast-export fast-import fetch fetch-pack filter-branch fmt-merge-msg for-each-ref for-each-repo format-patch fsck gc get-tar-commit-id grep gui hash-object help index-pack init instaweb interpret-trailers log ls-files ls-remote ls-tree mailinfo mailsplit maintenance merge merge-base merge-file merge-index merge-tree mergetool mktag mktree multi-pack-index mv name-rev notes pack-objects pack-redundant pack-refs patch-id prune prune-packed pull push range-diff read-tree rebase reflog remote repack replace request-pull rerere reset restore rev-list rev-parse revert rm send-email send-pack shortlog show show-branch show-index show-ref sparse-checkout stash status stripspace submodule switch symbolic-ref tag unpack-file unpack-objects update-index update-ref update-server-info var verify-commit verify-pack verify-tag version whatchanged worktree write-tree".split(" ")
);
var GIT_VALUE_OPTIONS = /* @__PURE__ */ new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--config-env",
  "--attr-source",
  "--shallow-file"
]);
var GIT_EQUALS_OPTIONS = /* @__PURE__ */ new Set([
  ...[...GIT_VALUE_OPTIONS].filter((o) => o.startsWith("--")),
  "--exec-path",
  "--list-cmds"
]);
var GIT_FLAGS = /* @__PURE__ */ new Set([
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
  "--help"
]);
var BATON_COMMANDS = /* @__PURE__ */ new Map([
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
  ["help", false]
]);
var BATON_GROUPS = /* @__PURE__ */ new Map([
  [
    "task",
    /* @__PURE__ */ new Map([
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
      ["help", false]
    ])
  ],
  [
    "hook",
    new Map(
      ["session-start", "pre-compact", "session-end", "pre-tool-use", "post-tool-use", "stop"].map(
        (e) => [e, false]
      )
    )
  ]
]);
var withCount = (shown, rest) => rest > 0 ? `${shown.join(" ")} (+${rest} args)` : shown.join(" ");
function gitShown(rest) {
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
function batonShown(rest, known) {
  const sub = rest[0] ?? "";
  const shown = [sub];
  const group = BATON_GROUPS.get(sub);
  let takesId = BATON_COMMANDS.get(sub);
  if (group !== void 0) {
    const action = rest[1] ?? "";
    takesId = group.get(action);
    if (takesId === void 0) return shown;
    shown.push(action);
  } else if (takesId === void 0) {
    return [];
  }
  const id = rest[shown.length] ?? "";
  const { taskPrefix, taskIds } = known;
  if (takesId && taskPrefix !== void 0 && taskIds?.has(id) && isTaskIdShape(id, taskPrefix)) {
    shown.push(id);
  }
  return shown;
}
function summarizeShellPart(words, dialect, known) {
  let i = 0;
  let wrapper = -1;
  while (i < words.length) {
    const w = words[i] ?? "";
    if (SHELL_WRAPPERS.has(w.toLowerCase())) {
      if (wrapper === -1) wrapper = i;
    } else if (dialect !== "bash" || !ASSIGNMENT.test(w)) break;
    i++;
  }
  if (i >= words.length) {
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
function scannedLine(command) {
  const head = command.slice(0, MAX_SCAN + 1);
  const nl = head.search(/\r?\n/);
  if (nl !== -1) return { line: head.slice(0, nl), cut: false };
  if (head.length <= MAX_SCAN) return { line: head, cut: false };
  return { line: headAtBoundary(head, /[\s;&|]/), cut: true };
}
function summarizeShellCommand(command, dialect, known = {}) {
  if (dialect === void 0) {
    const bash = summarizeShellCommand(command, "bash", known);
    return bash === summarizeShellCommand(command, "powershell", known) ? bash : "(expression)";
  }
  const { line, cut } = scannedLine(command);
  const summary = shellParts(line, dialect).map((p) => {
    const s = summarizeShellPart(p.words, dialect, known);
    if (p.op === "") return s;
    return p.op === ";" ? `${s};` : `${s} ${p.op}`;
  }).join(" ").replace(/ (?:&&|\|\||\||&)$|;$/, "");
  if (!cut) return summary;
  return summary === "" ? "\u2026" : `${summary} \u2026`;
}
function summarizeToolUse(t, root, platform = process.platform, known = {}) {
  const str = (v) => typeof v === "string" ? v : void 0;
  let line;
  if (PATH_TOOLS.has(t.name)) {
    const p = str(t.input.file_path) ?? str(t.input.notebook_path);
    line = p ? `${t.name} ${bounded(shownPath(p, root, platform), root, platform)}` : t.name;
  } else if (SHELL_SUMMARY_TOOLS.has(t.name)) {
    const cmd = str(t.input.command);
    line = cmd === void 0 ? t.name : `${t.name}: ${bounded(summarizeShellCommand(cmd, SHELL_SUMMARY_TOOLS.get(t.name), known), root, platform)}`;
  } else if (t.name === "Grep" || t.name === "Glob") {
    const pattern = str(t.input.pattern);
    line = pattern === void 0 ? t.name : `${t.name} ${bounded(pattern, root, platform, true)}`;
  } else if (t.name === "Task" || t.name === "Agent") {
    const d = str(t.input.description);
    line = d === void 0 ? t.name : `${t.name}: ${bounded(d, root, platform, true)}`;
  } else {
    line = t.name;
  }
  return t.isError ? `${line} (failed)` : line;
}
function recentToolCalls(records, root, limit, platform = process.platform, known = {}) {
  const uses = toolUses(records);
  return uses.slice(Math.max(0, uses.length - limit)).map((t) => summarizeToolUse(t, root, platform, known));
}

export {
  parseTranscript,
  sumUsage,
  firstTurnContextTokens,
  findProjectTranscriptDirs,
  listSessionTranscripts,
  readTranscriptTail,
  toolUses,
  recentToolCalls
};
//# sourceMappingURL=chunk-JONWDC7U.mjs.map