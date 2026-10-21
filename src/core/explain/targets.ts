import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFileSection, parseFrontmatter, parseSections } from "../frontmatter.js";
import { git, isGitRepo } from "../git.js";
import { CONTEXT_DIR, ContextPaths, toRepoPath } from "../paths.js";
import type { Section } from "../types.js";
import { toKey } from "./match.js";

/**
 * Everything `baton explain` can be asked about, indexed from the repo on disk:
 * files and folders, dependencies, `.context/` sections, doc headings and
 * mermaid diagram nodes. Pure reads; it never writes and never throws on a
 * malformed `.context/` (the bad file is skipped).
 */

export type TargetKind = "dependency" | "section" | "heading" | "file" | "mermaid";

interface Base {
  kind: TargetKind;
  name: string;
  /** Match keys, all passed through toKey. */
  keys: string[];
  /** Repo path (POSIX) of the file the target lives in. */
  source: string;
  /** 1-based line within `source`. */
  line: number;
}

export type Target =
  | (Base & { kind: "dependency"; version: string; dev: boolean })
  | (Base & { kind: "section"; section: Section }) // .context/ section or whole-file doc
  | (Base & { kind: "heading"; level: number; body: string }) // docs/**/*.md
  | (Base & { kind: "file"; isDir: boolean })
  | (Base & { kind: "mermaid"; nodeId: string; edgesOut: string[]; edgesIn: string[] }); // edge entries are neighbour labels

export interface Decision {
  section: Section;
  /** `spec_sections` from the ADR's frontmatter. */
  specSections: string[];
}

export interface RepoIndex {
  root: string;
  /** Repo paths, POSIX, no directories. */
  files: string[];
  /** spec.md + rules.md sections and knowledge/*.md (not STATE.md, not decisions). */
  contextSections: Section[];
  /** .context/decisions/*.md that carry an id. */
  decisions: Decision[];
  targets: Target[];
  /** Malformed files that were left out of the index; `file` is a POSIX repo path. */
  skipped: SkippedFile[];
}

export interface SkippedFile {
  file: string;
  /** One-line error message. */
  error: string;
}

const WALK_SKIP = new Set([".git", "node_modules", "dist"]);
const CACHE_DIR = `${CONTEXT_DIR}/${ContextPaths.cache}`;

export async function buildIndex(
  root: string,
  opts: { maxFiles?: number } = {},
): Promise<RepoIndex> {
  const skipped: SkippedFile[] = [];
  const files = await listFiles(root, skipped, opts.maxFiles ?? MAX_INDEXED_FILES);
  const contextSections = await loadContextSections(root, skipped);
  const decisions = await loadDecisions(root, skipped);

  const targets: Target[] = [
    ...fileTargets(files),
    ...(await dependencyTargets(root, skipped)),
    ...[...contextSections, ...decisions.map((d) => d.section)].map(sectionTarget),
  ];

  for (const file of files) {
    const isDoc = file.startsWith("docs/") && file.endsWith(".md");
    const hasDiagrams = isDoc || file === "README.md" || isContextMarkdown(file);
    if (!hasDiagrams) continue;
    const lines = await readLines(root, file);
    if (!lines) continue;
    if (isDoc) targets.push(...headingTargets(file, lines));
    targets.push(...mermaidTargets(file, lines));
  }

  return { root, files, contextSections, decisions, targets, skipped };
}

// ---------------------------------------------------------------- helpers

function firstLine(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split("\n")[0]?.trim() || "unreadable";
}

export function skip(skipped: SkippedFile[], file: string, err: unknown): void {
  skipped.push({ file, error: firstLine(err) });
}

function keysOf(...names: string[]): string[] {
  return [...new Set(names.map(toKey).filter((k) => k !== ""))];
}

/** UTF-8 text with CRLF/CR folded to LF, so `\r` never reaches a name, body or label. */
function normalize(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

async function readText(root: string, repoPath: string): Promise<string | null> {
  try {
    return normalize(await readFile(join(root, repoPath), "utf8"));
  } catch {
    return null;
  }
}

export async function readLines(root: string, repoPath: string): Promise<string[] | null> {
  const text = await readText(root, repoPath);
  return text === null ? null : text.split("\n");
}

function isContextMarkdown(file: string): boolean {
  return (
    file.startsWith(`${CONTEXT_DIR}/`) && !file.startsWith(`${CACHE_DIR}/`) && file.endsWith(".md")
  );
}

// ------------------------------------------------------------------ files

/** Most files indexed in one run; a bigger tree is truncated and reported. */
export const MAX_INDEXED_FILES = 50_000;

async function listFiles(
  root: string,
  skipped: SkippedFile[],
  maxFiles: number,
): Promise<string[]> {
  let files: string[] | null = null;
  if (await isGitRepo(root)) {
    try {
      // -z: paths come back raw, not quoted/escaped (non-ASCII names, spaces).
      const listed = await git(
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        root,
      );
      // --cached still lists files deleted from the work tree; drop them.
      const deleted = new Set((await git(["ls-files", "--deleted", "-z"], root)).split("\0"));
      files = [...new Set(listed.split("\0").filter((f) => f !== "" && !deleted.has(f)))];
      // A folder ignored by an ancestor repo lists nothing; walk it instead.
      if (files.length === 0) files = null;
    } catch (err) {
      // Inside a repo a failed listing (say, output over the buffer) must not fall
      // back to the .gitignore-blind walk: report it and index no files.
      skip(skipped, "<root>", new Error(`git ls-files failed: ${firstLine(err)}`));
      return [];
    }
  }
  files ??= await walk(root, maxFiles + 1);
  files.sort();
  if (files.length > maxFiles) {
    files.length = maxFiles;
    skipped.push({ file: "<root>", error: `file list truncated at ${maxFiles} files` });
  }
  return files;
}

/** Iterative (no recursion, no spreading) and stops once `limit` files are found. */
async function walk(root: string, limit: number): Promise<string[]> {
  const found: string[] = [];
  const pending = [root];
  while (pending.length > 0 && found.length < limit) {
    const dir = pending.pop() as string;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (WALK_SKIP.has(entry.name) || toRepoPath(root, abs) === CACHE_DIR) continue;
        pending.push(abs);
      } else if (entry.isFile()) {
        found.push(toRepoPath(root, abs));
      }
    }
  }
  return found;
}

function fileTargets(files: string[]): Target[] {
  const dirs = new Set<string>();
  for (const file of files) {
    const parts = file.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  const entry = (path: string, isDir: boolean): Target => ({
    kind: "file",
    name: path,
    keys: keysOf(path, path.slice(path.lastIndexOf("/") + 1)),
    source: path,
    line: 1,
    isDir,
  });
  return [...[...dirs].sort().map((d) => entry(d, true)), ...files.map((f) => entry(f, false))];
}

// ----------------------------------------------------------- dependencies

async function dependencyTargets(root: string, skipped: SkippedFile[]): Promise<Target[]> {
  const text = await readText(root, "package.json");
  if (text === null) return [];
  let pkg: unknown;
  try {
    pkg = JSON.parse(text);
  } catch (err) {
    skip(skipped, "package.json", err);
    return [];
  }
  if (typeof pkg !== "object" || pkg === null) {
    skip(skipped, "package.json", new Error("package.json must be a JSON object"));
    return [];
  }
  const lines = text.split("\n");
  const out: Target[] = [];
  for (const [field, dev] of [
    ["dependencies", false],
    ["devDependencies", true],
  ] as const) {
    const block = (pkg as Record<string, unknown>)[field];
    if (typeof block !== "object" || block === null || Array.isArray(block)) continue;
    const blockStart = lines.findIndex((l) => l.trimStart().startsWith(`"${field}"`));
    for (const [name, version] of Object.entries(block)) {
      if (typeof version !== "string") continue;
      const at = lines.findIndex(
        (l, i) => i > blockStart && l.trimStart().startsWith(`${JSON.stringify(name)}:`),
      );
      out.push({
        kind: "dependency",
        name,
        keys: keysOf(name),
        source: "package.json",
        line: blockStart < 0 || at < 0 ? 1 : at + 1,
        version,
        dev,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- .context

async function markdownIn(root: string, repoDir: string): Promise<string[]> {
  try {
    const names = await readdir(join(root, repoDir));
    return names
      .filter((n) => n.endsWith(".md"))
      .sort()
      .map((n) => `${repoDir}/${n}`);
  } catch {
    return [];
  }
}

async function loadContextSections(root: string, skipped: SkippedFile[]): Promise<Section[]> {
  const sections: Section[] = [];
  const knowledge = await markdownIn(root, `${CONTEXT_DIR}/${ContextPaths.knowledge}`);
  const candidates = [
    { file: `${CONTEXT_DIR}/${ContextPaths.spec}`, multi: true },
    { file: `${CONTEXT_DIR}/${ContextPaths.rules}`, multi: true },
    ...knowledge.map((file) => ({ file, multi: false })),
  ];
  for (const { file, multi } of candidates) {
    const text = await readText(root, file);
    if (text === null) continue;
    try {
      if (multi) sections.push(...parseSections(text, file));
      else {
        const section = parseFileSection(text, file);
        if (section) sections.push(section);
      }
    } catch (err) {
      // Malformed file (duplicate id, bad marker): skip it, keep indexing.
      skip(skipped, file, err);
    }
  }
  return sections;
}

async function loadDecisions(root: string, skipped: SkippedFile[]): Promise<Decision[]> {
  const decisions: Decision[] = [];
  for (const file of await markdownIn(root, `${CONTEXT_DIR}/${ContextPaths.decisions}`)) {
    const text = await readText(root, file);
    if (text === null) continue;
    try {
      const section = parseFileSection(text, file);
      if (!section) continue;
      const raw = parseFrontmatter(text).data.spec_sections;
      const list = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
      decisions.push({ section, specSections: list.filter((s) => typeof s === "string") });
    } catch (err) {
      // Malformed ADR: skip it.
      skip(skipped, file, err);
    }
  }
  return decisions;
}

function sectionTarget(section: Section): Target {
  return {
    kind: "section",
    name: section.title,
    keys: keysOf(section.meta.id, section.title),
    source: section.file,
    line: section.line,
    section,
  };
}

// ---------------------------------------------------------------- markdown

export interface Fence {
  /** Line index of the opening fence. */
  open: number;
  /** Line index of the closing fence (last line when unclosed). */
  close: number;
  info: string;
}

export function findFences(lines: string[]): Fence[] {
  const fences: Fence[] = [];
  let open: { index: number; char: string; size: number; info: string } | null = null;
  lines.forEach((line, i) => {
    if (open) {
      const m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (m && m[1]?.[0] === open.char && (m[1]?.length ?? 0) >= open.size) {
        fences.push({ open: open.index, close: i, info: open.info });
        open = null;
      }
      return;
    }
    const m = /^ {0,3}(`{3,}|~{3,})\s*(.*)$/.exec(line);
    if (m)
      open = {
        index: i,
        char: m[1]?.[0] ?? "`",
        size: m[1]?.length ?? 3,
        info: (m[2] ?? "").trim(),
      };
  });
  const unclosed = open as { index: number; info: string } | null;
  if (unclosed) fences.push({ open: unclosed.index, close: lines.length - 1, info: unclosed.info });
  return fences;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export function headingTargets(file: string, lines: string[]): Target[] {
  const fences = findFences(lines);
  const inFence = (i: number) => fences.some((f) => i >= f.open && i <= f.close);

  // YAML frontmatter can hold `# comments`; it is not document structure.
  let first = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (end > 0) first = end + 1;
  }

  const found: { index: number; level: number; title: string }[] = [];
  for (let i = first; i < lines.length; i++) {
    if (inFence(i)) continue;
    const m = HEADING_RE.exec(lines[i] ?? "");
    if (m) found.push({ index: i, level: (m[1] ?? "#").length, title: m[2] ?? "" });
  }

  return found.map((h, n): Target => {
    const next = found.slice(n + 1).find((o) => o.level <= h.level);
    const end = next ? next.index : lines.length;
    return {
      kind: "heading",
      name: h.title,
      keys: keysOf(h.title),
      source: file,
      line: h.index + 1,
      level: h.level,
      body: lines
        .slice(h.index + 1, end)
        .join("\n")
        .trim(),
    };
  });
}

// ----------------------------------------------------------------- mermaid

const ID = "[A-Za-z_][A-Za-z0-9_]*";
const quoted = (close: string) => `("[^"]*"|[^${close}]*)`;
// ID, then at most one shape: ((x)) [x] (x) {x} >x]. Groups 2-6 hold the label.
const NODE_RE = new RegExp(
  `(${ID})(?:\\(\\(("[^"]*"|.*?)\\)\\)|\\[${quoted("\\]")}\\]|\\(${quoted("\\)")}\\)|\\{${quoted("\\}")}\\}|>${quoted("\\]")}\\])?`,
  "y",
);
// Arrows: --> --- -.-> -.- ==> (plain), or `-- text -->` / `== text ==>` / `-. text .->`
// (text between the dashes), each with an optional |text| we do not need. A bare
// `--` or `==` is not an arrow, so `A -- uses --> B` never invents a node "uses".
const ARROW_RE =
  /(?:-\.+-+>?|-{2,}>|-{3,}|={2,}>|(?:--|==|-\.)\s+.+?\s+(?:-{2,}>|-{3,}|={2,}>|\.+-+>?))(?:\s*\|[^|]*\|)?/y;
const IGNORED_LINE_RE =
  /^(?:graph|flowchart|subgraph|end|classDef|class|style|linkStyle|click|direction)\b/;

interface DiagramNode {
  id: string;
  label: string | null;
  line: number;
}

function cleanLabel(raw: string): string {
  const t = raw.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).trim() : t;
}

function mermaidTargets(file: string, lines: string[]): Target[] {
  const targets: Target[] = [];
  for (const fence of findFences(lines)) {
    if (!/^mermaid\b/i.test(fence.info)) continue;
    const body = lines.slice(fence.open + 1, fence.close);
    const header = body.find((l) => l.trim() !== "" && !l.trim().startsWith("%%"));
    // Only flowcharts have the node/edge shape we read.
    if (!header || !/^\s*(?:graph|flowchart)\b/.test(header)) continue;
    targets.push(...diagramTargets(file, body, fence.open + 2));
  }
  return targets;
}

/** `firstLine` is the 1-based file line of body[0]. */
function diagramTargets(file: string, body: string[], firstLine: number): Target[] {
  const nodes = new Map<string, DiagramNode>();
  const edges: [string, string][] = [];

  const touch = (id: string, label: string | null, line: number) => {
    const node = nodes.get(id);
    if (!node) nodes.set(id, { id, label, line });
    else if (label !== null && node.label === null) {
      node.label = label;
      node.line = line; // point at the declaration that names it
    }
  };

  body.forEach((raw, i) => {
    const line = firstLine + i;
    const code = raw.replace(/%%.*$/, "").trim();
    if (code === "" || IGNORED_LINE_RE.test(code)) return;
    for (const stmt of code.split(";")) parseStatement(stmt.trim(), line, touch, edges);
  });

  const labelOf = (id: string) => nodes.get(id)?.label ?? id;
  return [...nodes.values()].map((n): Target => {
    const label = labelOf(n.id);
    const neighbours = (pick: (e: [string, string]) => string | null) => [
      ...new Set(
        edges
          .map(pick)
          .filter((x): x is string => x !== null)
          .map(labelOf),
      ),
    ];
    return {
      kind: "mermaid",
      name: label,
      keys: keysOf(label, n.id),
      source: file,
      line: n.line,
      nodeId: n.id,
      edgesOut: neighbours(([from, to]) => (from === n.id ? to : null)),
      edgesIn: neighbours(([from, to]) => (to === n.id ? from : null)),
    };
  });
}

function parseStatement(
  stmt: string,
  line: number,
  touch: (id: string, label: string | null, line: number) => void,
  edges: [string, string][],
): void {
  let pos = 0;
  const skipWs = () => {
    while (stmt[pos] === " " || stmt[pos] === "\t") pos++;
  };
  const node = (): string | null => {
    NODE_RE.lastIndex = pos;
    const m = NODE_RE.exec(stmt);
    if (!m) return null;
    pos = NODE_RE.lastIndex;
    const raw = m.slice(2, 7).find((g) => g !== undefined);
    const id = m[1] ?? "";
    touch(id, raw === undefined ? null : cleanLabel(raw), line);
    return id;
  };
  // `A & B` is a group: every member shares the arrow that follows.
  const group = (): string[] | null => {
    skipWs();
    const first = node();
    if (first === null) return null;
    const ids = [first];
    for (;;) {
      skipWs();
      if (stmt[pos] !== "&") return ids;
      pos++;
      skipWs();
      const next = node();
      if (next === null) return ids;
      ids.push(next);
    }
  };

  let left = group();
  while (left) {
    skipWs();
    ARROW_RE.lastIndex = pos;
    if (!ARROW_RE.exec(stmt)) return;
    pos = ARROW_RE.lastIndex;
    const right = group();
    if (!right) return;
    for (const from of left) for (const to of right) edges.push([from, to]);
    left = right;
  }
}
