#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  frontmatterBlock,
  statusKind
} from "./chunk-5VA3OZXQ.mjs";

// src/hooks/guards.ts
import { posix } from "path";
var EDIT_TOOLS = {
  // Claude Code
  Edit: ["file_path"],
  Write: ["file_path"],
  MultiEdit: ["file_path"],
  NotebookEdit: ["notebook_path"],
  // Gemini CLI
  write_file: ["file_path", "absolute_path", "path"],
  replace: ["file_path", "absolute_path", "path"]
};
function editTargets(toolName, toolInput) {
  const fields = EDIT_TOOLS[toolName];
  if (fields) {
    return fields.map((f) => toolInput[f]).filter((v) => typeof v === "string");
  }
  if (toolName === "apply_patch") {
    const patch = typeof toolInput.input === "string" ? toolInput.input : "";
    return [...patch.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm)].map(
      (m) => (m[1] ?? "").trim()
    );
  }
  return [];
}
var SHELL_TOOLS = ["Bash", "PowerShell", "run_shell_command"];
var isAbs = (p) => /^[A-Za-z]:\//.test(p) || p.startsWith("/");
function winAlias(p) {
  const parts = p.split("/");
  return parts.map((seg, i) => {
    if (i === 0 && /^[A-Za-z]:$/.test(seg)) return seg;
    return seg.replace(/:.*$/, "").replace(/[. ]+$/, "");
  }).filter((seg, i) => i === 0 || seg !== "").join("/");
}
function toRepoTarget(p, root, cwd, platform = process.platform) {
  let a = p.trim().replace(/\\/g, "/");
  if (platform === "win32") a = a.replace(/^\/{1,2}[?.]\//, "");
  const r = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const c = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  let abs = posix.normalize(isAbs(a) ? a : posix.join(c, a));
  if (platform === "win32") abs = winAlias(abs);
  const fold = (x) => platform === "win32" ? x.toLowerCase() : x;
  if (!fold(abs).startsWith(`${fold(r)}/`)) return null;
  return abs.slice(r.length + 1);
}
function protectedClass(repoPath, platform = process.platform) {
  const win = platform === "win32";
  const q = win ? winAlias(repoPath).toLowerCase() : repoPath;
  const k = (s) => win ? s.toLowerCase() : s;
  if (q === k(".context/STATE.md")) return "state";
  if (q === k(".context/tasks.jsonl")) return "tasks";
  if (q === k(".context/memories.jsonl")) return "memories";
  if (q.startsWith(k(".context/.cache/"))) return "cache";
  if (q.startsWith(k(".beads/"))) return "beads";
  const m = /^\.context\/decisions\/(\d{4})-[^/]+\.md$/i.exec(win ? winAlias(repoPath) : repoPath);
  if (m && Number(m[1]) >= 1) return "decision";
  return null;
}
function shellCommandOf(tool, input) {
  if (!SHELL_TOOLS.includes(tool)) return null;
  const c = input.command;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.filter((x) => typeof x === "string").join(" ");
  return null;
}
function shellSegments(command) {
  let t = command.replace(/\\/g, "/");
  t = t.replace(/&>>?/g, (m) => m === "&>>" ? " >> " : " > ");
  t = t.replace(/\d*>&\d*/g, " ");
  return t.split(/&&|\|\||[;|&\n\r]/).map((s) => s.trim()).filter((s) => s.length > 0);
}
var SEG = String.raw`[^\s"'\`;|&<>()]`;
var SEGNS = String.raw`[^\s"'\`;|&<>()/]`;
var SEGP = String.raw`[^\s"'\`;|&<>()=:,]`;
var MENTION_SRC = String.raw`(?:^|[\s"'\`=(:,])((?:${SEGP}*/)?(?:\.c(?:o(?:n(?:t(?:e(?:x(?:t)?)?)?)?)?)?[*?\[{]${SEG}*|\.context/${SEGNS}*[*?\[{]${SEG}*|\.context(?:/(?:STATE\.md|tasks\.jsonl|memories\.jsonl|decisions(?:/${SEG}*)?|\.cache(?:/${SEG}*)?))?/?|\.beads(?:/${SEG}*)?))(?=$|[\s"'\`;|&<>()])`;
var mentionRe = () => new RegExp(MENTION_SRC, "gi");
var normMention = (m) => m.replace(/^(?:\.\/)+/, "").replace(/(\.md|\.jsonl)\/$/i, "$1");
function mentionsIn(text) {
  return [...text.matchAll(mentionRe())].map((m) => normMention(m[1] ?? ""));
}
var unquote = (s) => {
  const m = /^(["'])([\s\S]*)\1$/.exec(s);
  return m ? m[2] ?? "" : s;
};
function tokenMention(token) {
  const m = mentionRe().exec(unquote(token));
  return m ? normMention(m[1] ?? "") : null;
}
var WRAPPERS = /* @__PURE__ */ new Set(["sudo", "env", "command", "nohup", "time", "{", "!"]);
function wordsOf(seg) {
  return seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}
function nameIndex(words) {
  let i = 0;
  while (i < words.length) {
    const w = words[i] ?? "";
    if (/^[A-Za-z_]\w*=/.test(w) || WRAPPERS.has(w.toLowerCase())) i++;
    else break;
  }
  return i < words.length ? i : -1;
}
function commandName(word) {
  const w = word.replace(/^["']|["']$/g, "");
  return w.slice(w.lastIndexOf("/") + 1).replace(/\.(?:exe|cmd)$/i, "").toLowerCase();
}
var DEST_ONLY = /* @__PURE__ */ new Set(["cp", "copy", "copy-item", "cpi", "install", "rsync"]);
var ALL_MENTIONS = new Set(
  "rm mv tee tee-object truncate touch dd ln unlink shred set-content add-content out-file new-item remove-item move-item clear-content clc rename-item sc ac ni ri mi rni ren rename del erase rd rmdir move".split(" ")
);
var GIT_WRITE = /* @__PURE__ */ new Set(["checkout", "restore", "rm", "mv"]);
var NESTED_SHELLS = /* @__PURE__ */ new Set(["bash", "sh", "zsh", "cmd", "pwsh", "powershell"]);
var SCRIPT_HOSTS = /* @__PURE__ */ new Set([
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
  "powershell"
]);
var DATA_ARG_COMMANDS = /* @__PURE__ */ new Set([
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
  "baton"
]);
var WRITE_API_RE = /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|WriteAllText|WriteAllLines|WriteAllBytes|AppendAllText|AppendAllLines|file_put_contents|Set-Content|Add-Content|Out-File|Tee-Object|New-Item|Remove-Item|Move-Item|Clear-Content)\b|\b(?:rmSync|rmdirSync|rmdir|rm|unlinkSync|unlink|renameSync|rename|copyFileSync|copyFile)\s*\(|(?:File|Directory)\]::(?:Delete|Move|Copy)\b|\bos\.(?:remove|unlink|rename)\b|\bshutil\.|\bf?open\s*\([^)]{0,512}['"][wax][bt+]{0,2}['"]/i;
var WRITE_CMD_RE = new RegExp(
  String.raw`(?:^|[\s;|&(){}\x60"'/])(?:${[
    ...ALL_MENTIONS,
    ...DEST_ONLY,
    ...NESTED_SHELLS,
    ...SCRIPT_HOSTS,
    "sed",
    "git",
    "rg",
    "find",
    "xargs"
  ].join("|")})(?:\.exe|\.cmd)?(?=$|[\s;|&(){}\x60"'])|>`,
  "i"
);
var MAX_DEPTH = 4;
var MAX_LENGTH = 16384;
var WORK_BUDGET = 65536;
var HEREDOC_OP = /<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([^\s;|&<>()'"`]+))/y;
function heredocEnd(text, from, delim, dash) {
  for (let i = from; i < text.length; ) {
    const nl = text.indexOf("\n", i);
    const line = text.slice(i, nl < 0 ? text.length : nl).replace(/\r$/, "");
    if ((dash ? line.replace(/^\t+/, "") : line) === delim) return i;
    if (nl < 0) return -1;
    i = nl + 1;
  }
  return -1;
}
function scanInline(text, dialect, lit, base, baseDepth, nest, work, out) {
  if (nest > MAX_DEPTH) throw new BudgetSpent();
  const posix2 = dialect === "posix";
  const esc = posix2 ? "\\" : "`";
  const stack = [];
  const pending = [];
  let quote = null;
  let litMode = lit;
  const open = (at, bodyStart, closer) => {
    const inline = {
      open: base + at,
      bodyStart: base + bodyStart,
      bodyEnd: base + text.length,
      depth: baseDepth + stack.length
    };
    out.push(inline);
    stack.push({ closer, quote, lit: litMode, inline });
    quote = null;
    litMode = false;
  };
  const close = (at) => {
    const f = stack.pop();
    if (!f) return;
    f.inline.bodyEnd = base + at;
    quote = f.quote;
    litMode = f.lit;
  };
  const body = (from, to, expands) => {
    const t = text.slice(from, to);
    const depth = baseDepth + stack.length;
    spend(work, t.length);
    scanInline(t, dialect, false, base + from, depth, nest + 1, work, out);
    if (expands && !lit) {
      spend(work, t.length);
      scanInline(t, dialect, true, base + from, depth, nest + 1, work, out);
    }
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
        quote = posix2 && text[i - 1] === "$" ? "$'" : "'";
        continue;
      } else if (ch === '"') {
        quote = '"';
        continue;
      }
    }
    const top = stack[stack.length - 1];
    const next = text[i + 1];
    if (posix2 && ch === "`") {
      if (top?.closer === "`") close(i);
      else open(i, i + 1, "`");
    } else if (ch === ")" && quote === null && top?.closer === ")") {
      close(i);
    } else if (next === "(" && (ch === "$" || !litMode && (ch === "<" || ch === ">" || ch === "@"))) {
      open(i, i + 2, ")");
      i++;
    } else if (litMode || quote !== null) {
    } else if (ch === "(" && (i === 0 || /[\s;|&(=,{]/.test(text[i - 1] ?? ""))) {
      open(i, i + 1, ")");
    } else if (posix2 && ch === "<" && next === "<" && text[i + 2] !== "<") {
      HEREDOC_OP.lastIndex = i;
      const m = HEREDOC_OP.exec(text);
      if (m) {
        const quoted = m[2] !== void 0 || m[3] !== void 0 || m[0].includes("\\");
        pending.push({ delim: m[2] ?? m[3] ?? m[4] ?? "", dash: m[1] === "-", quoted });
        i = HEREDOC_OP.lastIndex - 1;
      }
    } else if (!posix2 && ch === "@" && (next === "'" || next === '"')) {
      const nl = /^\r?\n/.exec(text.slice(i + 2, i + 4));
      if (nl) {
        const from = i + 2 + nl[0].length;
        const term = text.indexOf(`
${next}@`, from - 1);
        const end = term < 0 ? text.length : term + 1;
        body(from, end, next === '"');
        i = term < 0 ? text.length : term + 2;
      }
    }
  }
}
function inlineCode(text, dialect, work) {
  const out = [];
  scanInline(text, dialect, false, 0, 0, 0, work, out);
  const seen = /* @__PURE__ */ new Set();
  return out.filter((x) => {
    const k = `${x.open}:${x.bodyEnd}:${x.depth}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
function segmentsOf(command) {
  const t = command.replace(/\\/g, "/").replace(/&>>?/g, (m) => m === "&>>" ? " >>" : " >").replace(/\d*>&\d*/g, (m) => " ".repeat(m.length));
  const out = [];
  const push = (a, b) => {
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
var wordStarts = (seg) => [...seg.matchAll(/"[^"]*"|'[^']*'|\S+/g)].map((m) => m.index);
function shellUnquote(s, dialect) {
  const t = s.trim();
  const dq = /^"([\s\S]*)"$/.exec(t);
  if (dq) {
    const inner = dq[1] ?? "";
    return dialect === "posix" ? inner.replace(/\\([\\"$`\n])/g, "$1") : inner.replace(/`([\s\S])/g, "$1").replace(/""/g, '"');
  }
  const sq = /^'([\s\S]*)'$/.exec(t);
  if (sq) return dialect === "posix" ? sq[1] ?? "" : (sq[1] ?? "").replace(/''/g, "'");
  return t;
}
var unescapeWord = (w) => w.replace(/\\([\s\S])/g, "$1");
function gitNestedCommands(raw, seg, sub) {
  const out = [];
  const alias = /(?:^|\s)-c\s+(?:'alias\.[^\s=']+=!([^']*)'?|"alias\.[^\s="]+=!([^"]*)"?|alias\.[^\s=]+=(?:'!([^']*)'?|"!([^"]*)"?|!((?:\\[\s\S]|\S)*)))/gi;
  for (const m of raw.matchAll(alias)) {
    const body = m.slice(1).find((g) => g !== void 0) ?? "";
    out.push(m[5] === void 0 ? body : unescapeWord(body));
  }
  if (sub === "rebase") {
    const exec = /(?:^|\s)(?:--e(?:x(?:e(?:c)?)?)?(?:=|\s+)|-[a-zA-Z]*x\s*)("[^"]*"?|'[^']*'?|(?:\\[\s\S]|[^\s\\])+)/g;
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
      if (from !== void 0) out.push(shellUnquote(raw.slice(from), "posix"));
    }
  }
  return out;
}
var rgRunsPre = (rest) => rest.some((w) => w === "--pre" || w.startsWith("--pre="));
function gitSubcommand(rest) {
  for (let i = 0; i < rest.length; i++) {
    const w = rest[i] ?? "";
    if (w === "-C" || w === "-c") i++;
    else if (w.startsWith("--")) continue;
    else return w.toLowerCase();
  }
  return null;
}
function gitRestoreWrites(rest) {
  const short = (letter) => (w) => /^-[A-Za-z]+$/.test(w) && w.includes(letter);
  const staged = rest.some((w) => w === "--staged" || short("S")(w));
  const worktree = rest.some((w) => w === "--worktree" || short("W")(w));
  return !staged || worktree;
}
function mayRunWriteApi(name, rest) {
  if (SCRIPT_HOSTS.has(name)) {
    return !(name === "node" && /(?:^|\/)baton\.mjs$/i.test(unquote(rest[0] ?? "")));
  }
  return !DATA_ARG_COMMANDS.has(name);
}
function destinationOf(rest) {
  const at = rest.findIndex((w) => w.toLowerCase() === "-destination");
  if (at >= 0 && rest[at + 1] !== void 0) return rest[at + 1] ?? null;
  for (let i = rest.length - 1; i >= 0; i--) {
    const w = rest[i] ?? "";
    if (!w.startsWith("-")) return w;
  }
  return null;
}
function commandOf(seg) {
  const words = wordsOf(seg);
  const ni = nameIndex(words);
  if (ni < 0) return null;
  return { name: commandName(words[ni] ?? ""), rest: words.slice(ni + 1), ni };
}
function blankMessageHeredocs(text, work) {
  const re = /\$\(\s*cat\s+<<(-?)[ \t]*(?:'([^'\n]+)'|"([^"\n]+)"|\\([^\s;|&<>()'"]+))[ \t]*\r?\n/g;
  const found = [];
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
  const tops = inlineCode(text, "posix", work).filter((x) => x.depth === 0);
  const segs = segmentsOf(text);
  for (const f of found) {
    if (!tops.some((x) => x.open === f.open && x.bodyEnd === f.close)) return text;
    const seg = segs.find((s) => s.start <= f.open && f.open < s.end);
    const cmd = seg ? commandOf(seg.text) : null;
    if (!cmd) return text;
    const ok = cmd.name === "gh" || cmd.name === "echo" || cmd.name === "printf" || cmd.name === "git" && ["commit", "tag"].includes(gitSubcommand(cmd.rest) ?? "");
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
var BudgetSpent = class extends Error {
};
function spend(work, n) {
  work.used += n;
  if (work.used > WORK_BUDGET) throw new BudgetSpent();
}
function segmentWrites(seg, out, ctx) {
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
    if (at >= 0 && from !== void 0) {
      const inner = name === "pwsh" || name === "powershell" ? "powershell" : "posix";
      const script = shellUnquote(raw.slice(from), ctx.dialect);
      out.push(...targetsAt(script, inner, ctx.depth + 1, ctx.work));
    }
  }
}
function capMentions(text) {
  const lc = text.toLowerCase().replace(/\\/g, "/");
  const out = [];
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
function targetsAt(command, dialect, depth, work) {
  spend(work, command.length);
  if (command.length > MAX_LENGTH) {
    work.capped = true;
    return capMentions(command);
  }
  if (depth > MAX_DEPTH) {
    work.capped = true;
    return WRITE_API_RE.test(command) || WRITE_CMD_RE.test(command) ? mentionsIn(command) : [];
  }
  const raw = dialect === "posix" ? blankMessageHeredocs(command, work) : command;
  const inline = inlineCode(raw, dialect, work);
  const ctx = { dialect, depth, raw, inline, work };
  const out = [];
  for (const seg of segmentsOf(raw)) segmentWrites(seg, out, ctx);
  for (const x of inline) {
    if (x.depth === 0) {
      out.push(...targetsAt(raw.slice(x.bodyStart, x.bodyEnd), dialect, depth + 1, work));
    }
  }
  return [...new Set(out)];
}
function shellWriteTargets(command, dialect = "posix") {
  return shellWriteScan(command, dialect).targets;
}
function shellWriteScan(command, dialect = "posix") {
  const work = { used: 0, capped: false };
  try {
    const targets = targetsAt(command, dialect, 0, work);
    return { targets, capped: work.capped };
  } catch (e) {
    if (e instanceof BudgetSpent) return { targets: capMentions(command), capped: true };
    throw e;
  }
}
function mentionRule(mention) {
  const lc = mention.toLowerCase();
  if (lc.endsWith("state.md")) return "state";
  if (lc.endsWith("tasks.jsonl")) return "tasks";
  if (lc.endsWith("memories.jsonl")) return "memories";
  if (lc.includes(".context/.cache")) return "cache";
  if (lc.includes(".beads")) return "beads";
  if (lc.includes(".context/decisions")) return "adr-shell";
  return "context-dir";
}
function dependencyManifests(command) {
  const out = [];
  for (const seg of shellSegments(command)) {
    const words = wordsOf(seg);
    const ni = nameIndex(words);
    if (ni < 0) continue;
    const name = commandName(words[ni] ?? "");
    const rest = words.slice(ni + 1);
    const sub = (rest[0] ?? "").toLowerCase();
    if (name === "npm") {
      if (["install", "i", "add", "in"].includes(sub) && rest.slice(1).some((w) => !w.startsWith("-"))) {
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
      const skipNext = /* @__PURE__ */ new Set(["-r", "--requirement", "-c", "--constraint", "-e", "--editable"]);
      const left = [];
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
var lf = (s) => s.replace(/\r\n?/g, "\n");
function replaceIn(text, edit) {
  const { old_string: o, new_string: n } = edit;
  if (typeof o !== "string" || typeof n !== "string") return null;
  const oldS = lf(o);
  const newS = lf(n);
  if (oldS === "" || !text.includes(oldS)) return text;
  if (edit.replace_all === true) return text.split(oldS).join(newS);
  const at = text.indexOf(oldS);
  return text.slice(0, at) + newS + text.slice(at + oldS.length);
}
function applyEdits(tool, input, current) {
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
      const next = replaceIn(text, e);
      if (next === null) return null;
      text = next;
    }
    return text;
  }
  return null;
}
function patchTouchesFrontmatter(patch) {
  return /^[+-][ \t]*(?:status|supersedes|verified_at|id|kind)[ \t]*:/m.test(patch);
}
function denyReason(rule, path, status) {
  const num = /(\d{4})-/.exec(path)?.[1] ?? "NNNN";
  switch (rule) {
    case "state":
      return "baton: .context/STATE.md is generated by `baton handoff` and is never edited by hand (ADR 0024). `baton handoff` regenerates it; lasting notes go in a task comment (`baton task comment <id> \u2026`), a knowledge file or a decision.";
    case "tasks":
      return "baton: .context/tasks.jsonl is the task store and changes only through `baton task \u2026` (ADR 0009): create, update --claim, comment, dep add, close. `baton verify <id>` runs a task's check and closes it.";
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
      return `baton: the frontmatter of ${path} (status, supersedes, verified_at \u2026) changes only through \`baton decide --accept ${num}\` or a superseding record (ADR 0018); edit the body below the frontmatter.`;
    case "adr-shell":
      return "baton: decision records are written by `baton decide` (ADR 0018); only a proposed record's body may be edited, with the edit tools.";
  }
}
function decisionDenial(tool, input, rp, env) {
  const deny = (rule, status) => ({
    rule,
    path: rp,
    reason: denyReason(rule, rp, status)
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
function checkToolCall(tool, input, env) {
  const cmd = shellCommandOf(tool, input);
  if (cmd !== null) {
    const dialects = tool === "PowerShell" ? ["powershell"] : tool === "run_shell_command" ? ["posix", "powershell"] : ["posix"];
    const m = dialects.flatMap((d) => shellWriteTargets(cmd, d))[0];
    if (m === void 0) return null;
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

export {
  editTargets,
  SHELL_TOOLS,
  toRepoTarget,
  shellCommandOf,
  dependencyManifests,
  checkToolCall
};
//# sourceMappingURL=chunk-CRMTXFK4.mjs.map