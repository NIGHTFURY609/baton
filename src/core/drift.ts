import { existsSync } from "node:fs";
import { join, posix } from "node:path";
import type { Config } from "./config.js";
import { classifyFreshness } from "./freshness.js";
import { changedFilesPerCommit, headSha, ignoredPaths, isGitRepo, listRepoFiles } from "./git.js";
import { globToRegExp } from "./glob.js";
import type { IndexedSection } from "./sections.js";
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
  const kept: string[] = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    const t = line.trimStart();
    if (t.startsWith("```") || t.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) kept.push(line);
  }
  return kept.join("\n");
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
  const [head, files, settled] = await Promise.all([
    headSha(root),
    listRepoFiles(root),
    Promise.allSettled(shas.map((sha) => changedFilesPerCommit(root, sha))),
  ]);
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

    return {
      section,
      result: classifyFreshness({ meta, commitsSince, deadRefs }, staleAfter),
      deadRefs,
      commitsOutsideContext,
    };
  });

  return { head, sections: out, counts: tally(out) };
}
