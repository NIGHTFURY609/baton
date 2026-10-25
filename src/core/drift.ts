import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import type { Config } from "./config.js";
import { fencedLines } from "./fences.js";
import { classifyFreshness } from "./freshness.js";
import {
  changedFilesPerCommit,
  headSha,
  ignoredPaths,
  isGitRepo,
  listRepoFiles,
  porcelainPath,
  statusLines,
} from "./git.js";
import { globToRegExp, matchesAny } from "./glob.js";
import { ContextPaths, contextPath } from "./paths.js";
import type { IndexedSection } from "./sections.js";
import { sha256 } from "./tasks/native/jsonl.js";
import type { FreshnessLevel, FreshnessResult } from "./types.js";

/**
 * Freshness evaluation (ADR 0013): commit counts from git history and dead
 * references, fed to the pure `classifyFreshness`.
 */

/** Changes under these globs never count toward freshness (no self-ageing). */
export const FRESHNESS_IGNORED_GLOBS: readonly string[] = [".context/**"];

export interface SectionFreshness {
  section: IndexedSection;
  result: FreshnessResult;
  deadRefs: string[];
  /** Commits since verified_at that change any file outside .context/; null when unverified, unknown sha or not a git repo. */
  commitsOutsideContext: number | null;
  /** Dirty working-tree paths (outside .context/) that match the section's sources; set only when non-empty. */
  uncommitted?: string[];
}

export interface FreshnessReport {
  /** Full HEAD sha. */
  head: string | null;
  /** Input order. */
  sections: SectionFreshness[];
  /** All five keys present. */
  counts: Record<FreshnessLevel, number>;
}

/** What evaluateFreshness needs. A SectionIndex satisfies it; explain (Task 20) passes its own section list. */
export interface FreshnessScope {
  root: string;
  sections: readonly IndexedSection[];
}

const INLINE_CODE_RE = /`([^`\n]+)`/g;
const REPO_PATH_RE = /^(?:\.\/)?[A-Za-z0-9._@-]+(?:\/[A-Za-z0-9._@-]+)*\/?$/;
const FILE_EXT_RE = /\.(?:md|ts|tsx|js|mjs|cjs|json|ya?ml|toml|txt)$/;
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;
/** Glob or placeholder syntax: `*`, `?`, `<…>`, `{…}` or the literal NNNN. Such a span names no single file. */
const PATTERN_SYNTAX_RE = /[*?<>{}]|NNNN/;

function stripFences(body: string): string {
  const lines = body.split("\n");
  const fenced = fencedLines(lines);
  return lines.filter((_, i) => !fenced[i]).join("\n");
}

/**
 * Repo paths a section body refers to: inline-code spans that look like paths
 * (relative to the repo root) and relative markdown links (resolved against the
 * file that holds them). Fenced code is ignored, and so is any span with glob or
 * placeholder syntax. First-appearance order, no duplicates.
 */
export function extractPathRefs(body: string, file: string): string[] {
  const text = stripFences(body);
  const refs: string[] = [];

  for (const m of text.matchAll(INLINE_CODE_RE)) {
    const value = (m[1] ?? "").trim();
    if (PATTERN_SYNTAX_RE.test(value) || !REPO_PATH_RE.test(value)) continue;
    if (!value.includes("/") && !FILE_EXT_RE.test(value)) continue;
    if (value.split("/").includes("..")) continue;
    refs.push(value.replace(/^\.\//, ""));
  }

  for (const m of text.matchAll(LINK_RE)) {
    let target = m[1] ?? "";
    const hash = target.indexOf("#");
    if (hash !== -1) target = target.slice(0, hash);
    if (target === "" || target.startsWith("#") || target.startsWith("/")) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    try {
      target = decodeURIComponent(target);
    } catch {
      continue;
    }
    if (PATTERN_SYNTAX_RE.test(target)) continue;
    const resolved = posix.normalize(posix.join(posix.dirname(file), target));
    if (resolved === ".." || resolved.startsWith("../")) continue;
    refs.push(resolved);
  }

  return [...new Set(refs)];
}

function emptyCounts(): Record<FreshnessLevel, number> {
  return { fresh: 0, aging: 0, stale: 0, superseded: 0, unverified: 0 };
}

function tally(sections: SectionFreshness[]): Record<FreshnessLevel, number> {
  const counts = emptyCounts();
  for (const s of sections) counts[s.result.level]++;
  return counts;
}

export async function evaluateFreshness(
  scope: FreshnessScope,
  config: Config,
): Promise<FreshnessReport> {
  const { root, sections } = scope;
  const staleAfter = config.freshness.staleAfter;

  if (!(await isGitRepo(root))) {
    const out = sections.map((section) => ({
      section,
      result: classifyFreshness({ meta: section.meta, commitsSince: 0, deadRefs: [] }, staleAfter),
      deadRefs: [] as string[],
      commitsOutsideContext: null,
    }));
    return { head: null, sections: out, counts: tally(out) };
  }

  const shas = [
    ...new Set(sections.map((s) => s.meta.verifiedAt).filter((v): v is string => v !== null)),
  ];
  const [head, files, settled, status] = await Promise.all([
    headSha(root),
    listRepoFiles(root),
    Promise.allSettled(shas.map((sha) => changedFilesPerCommit(root, sha))),
    // Untracked files one by one, so a new directory still matches a source glob.
    statusLines(root, { untrackedAll: true }),
  ]);
  const dirty = [
    ...new Set(status.map(porcelainPath).filter((p) => !matchesAny(p, FRESHNESS_IGNORED_GLOBS))),
  ];
  // A rejected call (unknown sha, or a stamp that is not hex) leaves the sha out.
  const commitsBySha = new Map<string, string[][]>();
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") commitsBySha.set(shas[i] as string, r.value);
  });

  const ignoredRegexes = FRESHNESS_IGNORED_GLOBS.map(globToRegExp);
  const outsideContext = (f: string) => !ignoredRegexes.some((re) => re.test(f));

  // Dead references: source_paths globs that match nothing, and body paths.
  const globDead = sections.map((section) =>
    section.meta.sourcePaths.filter((glob) => {
      const re = globToRegExp(glob);
      return !files.some((f) => re.test(f));
    }),
  );
  const missingRefs = sections.map((section) => {
    if (section.doc === "state") return []; // generated; see ADR 0013
    return extractPathRefs(section.body, section.file).filter((ref) => {
      const first = ref.split("/")[0] as string;
      return existsSync(join(root, first)) && !existsSync(join(root, ref));
    });
  });
  const ignored = await ignoredPaths(root, [...new Set(missingRefs.flat())]);

  const out = sections.map((section, i): SectionFreshness => {
    const { meta } = section;
    const deadRefs = [
      ...(globDead[i] as string[]),
      ...(missingRefs[i] as string[]).filter((ref) => !ignored.has(ref)),
    ];

    let commitsSince = 0;
    let commitsOutsideContext: number | null = null;
    if (meta.verifiedAt !== null) {
      const commits = commitsBySha.get(meta.verifiedAt);
      if (commits === undefined) {
        deadRefs.push(`verified_at ${meta.verifiedAt.slice(0, 7)} is not a known commit`);
      } else {
        const sourceRes = meta.sourcePaths.map(globToRegExp);
        commitsOutsideContext = 0;
        for (const changed of commits) {
          const outside = changed.filter(outsideContext);
          if (outside.length === 0) continue;
          commitsOutsideContext++;
          if (outside.some((f) => sourceRes.some((re) => re.test(f)))) commitsSince++;
        }
      }
    }

    const sf: SectionFreshness = {
      section,
      result: classifyFreshness({ meta, commitsSince, deadRefs }, staleAfter),
      deadRefs,
      commitsOutsideContext,
    };
    // Uncommitted source changes age an otherwise fresh, verified section.
    if (
      sf.result.level === "fresh" &&
      meta.sourcePaths.length > 0 &&
      meta.verifiedAt !== null &&
      commitsBySha.has(meta.verifiedAt)
    ) {
      const touched = dirty.filter((p) => matchesAny(p, meta.sourcePaths));
      if (touched.length > 0) {
        const more = touched.length > 3 ? ` (+${touched.length - 3} more)` : "";
        sf.result = {
          level: "aging",
          commitsSince: sf.result.commitsSince,
          reason: `uncommitted changes in ${touched.slice(0, 3).join(", ")}${more}`,
        };
        sf.uncommitted = touched;
      }
    }
    return sf;
  });

  return { head, sections: out, counts: tally(out) };
}

/** Drift log under .context/.cache/ (git-ignored): one JSON line per flag or verification. */
export const DRIFT_LOG = "drift.jsonl";

export type DriftEvent =
  | {
      v: 1;
      ts: string;
      event: "flag";
      head: string | null;
      id: string;
      level: "aging" | "stale";
      commitsSince: number;
      reason: string;
      bodyHash: string;
    }
  | { v: 1; ts: string; event: "verified"; head: string; id: string; bodyHash: string };

export function bodyHash(body: string): string {
  return sha256(body).slice(0, 12);
}

/** One "flag" event per aging or stale section, except uncommitted-only aging (work in progress). */
export function flagEvents(report: FreshnessReport, ts: string): DriftEvent[] {
  const head = report.head?.slice(0, 12) ?? null;
  const events: DriftEvent[] = [];
  for (const s of report.sections) {
    const level = s.result.level;
    if (level !== "aging" && level !== "stale") continue;
    if (s.uncommitted !== undefined) continue;
    events.push({
      v: 1,
      ts,
      event: "flag",
      head,
      id: s.section.meta.id,
      level,
      commitsSince: s.result.commitsSince,
      reason: s.result.reason,
      bodyHash: bodyHash(s.section.body),
    });
  }
  return events;
}

/** Append-only on purpose: the one write under .context/ that does not go through writeFileAtomic. */
export async function appendDriftLog(root: string, events: DriftEvent[]): Promise<void> {
  if (events.length === 0) return;
  const dir = contextPath(root, ContextPaths.cache);
  await mkdir(dir, { recursive: true });
  await appendFile(
    join(dir, DRIFT_LOG),
    events.map((e) => `${JSON.stringify(e)}\n`).join(""),
    "utf8",
  );
}

/** Missing file gives []; malformed lines are skipped. */
export async function readDriftLog(root: string): Promise<DriftEvent[]> {
  let text: string;
  try {
    text = await readFile(contextPath(root, ContextPaths.cache, DRIFT_LOG), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const events: DriftEvent[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        events.push(parsed as DriftEvent);
      }
    } catch {
      // skip malformed line
    }
  }
  return events;
}

export type FailOn = "aging" | "stale";

const FAIL_LEVELS: Record<FailOn, readonly FreshnessLevel[]> = {
  aging: ["aging", "stale", "unverified"],
  stale: ["stale", "unverified"],
};

/** Sections at or beyond `failOn`. Never superseded or fresh. */
export function failingSections(report: FreshnessReport, failOn: FailOn): SectionFreshness[] {
  const levels = FAIL_LEVELS[failOn];
  return report.sections.filter((s) => levels.includes(s.result.level));
}

const TEXT_ORDER: readonly FreshnessLevel[] = ["stale", "unverified", "aging", "superseded"];

export function renderDriftText(report: FreshnessReport): string {
  const c = report.counts;
  const lines = [
    `${report.sections.length} sections: ${c.fresh} fresh, ${c.aging} aging, ${c.stale} stale, ${c.unverified} unverified, ${c.superseded} superseded`,
  ];
  for (const level of TEXT_ORDER) {
    for (const s of report.sections) {
      if (s.result.level !== level) continue;
      const { id } = s.section.meta;
      lines.push(
        `${level.toUpperCase()}  ${id}  ${s.section.file}:${s.section.line}  ${s.result.reason}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export interface DriftJson {
  head: string | null;
  counts: Record<FreshnessLevel, number>;
  sections: {
    id: string;
    kind: string;
    doc: string;
    file: string;
    line: number;
    level: FreshnessLevel;
    commitsSince: number;
    reason: string;
    deadRefs: string[];
    verifiedAt: string | null;
    sourcePaths: string[];
  }[];
}

/** All sections, index order. */
export function driftJson(report: FreshnessReport): DriftJson {
  return {
    head: report.head,
    counts: report.counts,
    sections: report.sections.map((s) => ({
      id: s.section.meta.id,
      kind: s.section.meta.kind,
      doc: s.section.doc,
      file: s.section.file,
      line: s.section.line,
      level: s.result.level,
      commitsSince: s.result.commitsSince,
      reason: s.result.reason,
      deadRefs: s.deadRefs,
      verifiedAt: s.section.meta.verifiedAt,
      sourcePaths: s.section.meta.sourcePaths,
    })),
  };
}
