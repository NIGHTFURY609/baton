#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  globToRegExp,
  matchesAny
} from "./chunk-POYJG6UX.mjs";
import {
  fencedLines
} from "./chunk-7ITVWEWP.mjs";
import {
  changedFilesPerCommit,
  headSha,
  ignoredPaths,
  isGitRepo,
  listRepoFiles,
  porcelainPath,
  statusLines
} from "./chunk-MEHZNG47.mjs";
import {
  sha256
} from "./chunk-QYQVMIUC.mjs";
import {
  ContextPaths,
  contextPath
} from "./chunk-HVIRJWHJ.mjs";

// src/core/budget.ts
var CHARS_PER_TOKEN = 4;
var PACKET_HEADER = "# baton mission brief";
function fitToBudget(blocks, maxChars, separator = "\n\n") {
  const ordered = blocks.map((b, i) => ({ b, i })).sort((x, y) => x.b.priority - y.b.priority || x.i - y.i).map(({ b }) => b);
  const kept = [];
  const dropped = [];
  let chars = 0;
  for (const block of ordered) {
    const cost = block.text.length + (kept.length > 0 ? separator.length : 0);
    if (chars + cost <= maxChars) {
      kept.push(block);
      chars += cost;
    } else {
      dropped.push(block);
    }
  }
  return { kept, dropped, chars };
}

// src/core/freshness.ts
function classifyFreshness(input, staleAfter) {
  const { meta, commitsSince, deadRefs = [] } = input;
  if (meta.supersededBy) {
    return { level: "superseded", commitsSince, reason: `superseded by ${meta.supersededBy}` };
  }
  if (meta.verifiedAt === null) {
    return { level: "unverified", commitsSince: 0, reason: "never verified" };
  }
  if (deadRefs.length > 0) {
    return {
      level: "stale",
      commitsSince,
      reason: `dead reference${deadRefs.length > 1 ? "s" : ""}: ${deadRefs.join(", ")}`
    };
  }
  if (meta.sourcePaths.length === 0 || commitsSince === 0) {
    return { level: "fresh", commitsSince, reason: "sources unchanged since verification" };
  }
  const threshold = staleAfter[meta.kind];
  if (threshold !== null && commitsSince >= threshold) {
    return {
      level: "stale",
      commitsSince,
      reason: `${commitsSince} commits touched sources since ${meta.verifiedAt.slice(0, 7)}`
    };
  }
  return {
    level: "aging",
    commitsSince,
    reason: `${commitsSince} commit${commitsSince > 1 ? "s" : ""} touched sources since ${meta.verifiedAt.slice(0, 7)}`
  };
}
function isInjectable(level) {
  return level === "fresh" || level === "aging";
}

// src/core/drift.ts
import { existsSync } from "fs";
import { appendFile, mkdir, readFile } from "fs/promises";
import { join, posix } from "path";
var FRESHNESS_IGNORED_GLOBS = [".context/**"];
var INLINE_CODE_RE = /`([^`\n]+)`/g;
var REPO_PATH_RE = /^(?:\.\/)?[A-Za-z0-9._@-]+(?:\/[A-Za-z0-9._@-]+)*\/?$/;
var FILE_EXT_RE = /\.(?:md|ts|tsx|js|mjs|cjs|json|ya?ml|toml|txt)$/;
var LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;
var PATTERN_SYNTAX_RE = /[*?<>{}]|NNNN/;
function stripFences(body) {
  const lines = body.split("\n");
  const fenced = fencedLines(lines);
  return lines.filter((_, i) => !fenced[i]).join("\n");
}
function extractPathRefs(body, file) {
  const text = stripFences(body);
  const refs = [];
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
function emptyCounts() {
  return { fresh: 0, aging: 0, stale: 0, superseded: 0, unverified: 0 };
}
function tally(sections) {
  const counts = emptyCounts();
  for (const s of sections) counts[s.result.level]++;
  return counts;
}
async function evaluateFreshness(scope, config) {
  const { root, sections } = scope;
  const staleAfter = config.freshness.staleAfter;
  if (!await isGitRepo(root)) {
    const out2 = sections.map((section) => ({
      section,
      result: classifyFreshness({ meta: section.meta, commitsSince: 0, deadRefs: [] }, staleAfter),
      deadRefs: [],
      commitsOutsideContext: null
    }));
    return { head: null, sections: out2, counts: tally(out2) };
  }
  const shas = [
    ...new Set(sections.map((s) => s.meta.verifiedAt).filter((v) => v !== null))
  ];
  const [head, files, settled, status] = await Promise.all([
    headSha(root),
    listRepoFiles(root),
    Promise.allSettled(shas.map((sha) => changedFilesPerCommit(root, sha))),
    // Untracked files one by one, so a new directory still matches a source glob.
    statusLines(root, { untrackedAll: true })
  ]);
  const dirty = [
    ...new Set(status.map(porcelainPath).filter((p) => !matchesAny(p, FRESHNESS_IGNORED_GLOBS)))
  ];
  const commitsBySha = /* @__PURE__ */ new Map();
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") commitsBySha.set(shas[i], r.value);
  });
  const ignoredRegexes = FRESHNESS_IGNORED_GLOBS.map(globToRegExp);
  const outsideContext = (f) => !ignoredRegexes.some((re) => re.test(f));
  const globDead = sections.map(
    (section) => section.meta.sourcePaths.filter((glob) => {
      const re = globToRegExp(glob);
      return !files.some((f) => re.test(f));
    })
  );
  const missingRefs = sections.map((section) => {
    if (section.doc === "state") return [];
    return extractPathRefs(section.body, section.file).filter((ref) => {
      const first = ref.split("/")[0];
      return existsSync(join(root, first)) && !existsSync(join(root, ref));
    });
  });
  const ignored = await ignoredPaths(root, [...new Set(missingRefs.flat())]);
  const out = sections.map((section, i) => {
    const { meta } = section;
    const deadRefs = [
      ...globDead[i],
      ...missingRefs[i].filter((ref) => !ignored.has(ref))
    ];
    let commitsSince = 0;
    let commitsOutsideContext = null;
    if (meta.verifiedAt !== null) {
      const commits = commitsBySha.get(meta.verifiedAt);
      if (commits === void 0) {
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
    const sf = {
      section,
      result: classifyFreshness({ meta, commitsSince, deadRefs }, staleAfter),
      deadRefs,
      commitsOutsideContext
    };
    if (sf.result.level === "fresh" && meta.sourcePaths.length > 0 && meta.verifiedAt !== null && commitsBySha.has(meta.verifiedAt)) {
      const touched = dirty.filter((p) => matchesAny(p, meta.sourcePaths));
      if (touched.length > 0) {
        const more = touched.length > 3 ? ` (+${touched.length - 3} more)` : "";
        sf.result = {
          level: "aging",
          commitsSince: sf.result.commitsSince,
          reason: `uncommitted changes in ${touched.slice(0, 3).join(", ")}${more}`
        };
        sf.uncommitted = touched;
      }
    }
    return sf;
  });
  return { head, sections: out, counts: tally(out) };
}
var DRIFT_LOG = "drift.jsonl";
function bodyHash(body) {
  return sha256(body).slice(0, 12);
}
function flagEvents(report, ts) {
  const head = report.head?.slice(0, 12) ?? null;
  const events = [];
  for (const s of report.sections) {
    const level = s.result.level;
    if (level !== "aging" && level !== "stale") continue;
    if (s.uncommitted !== void 0) continue;
    events.push({
      v: 1,
      ts,
      event: "flag",
      head,
      id: s.section.meta.id,
      level,
      commitsSince: s.result.commitsSince,
      reason: s.result.reason,
      bodyHash: bodyHash(s.section.body)
    });
  }
  return events;
}
async function appendDriftLog(root, events) {
  if (events.length === 0) return;
  const dir = contextPath(root, ContextPaths.cache);
  await mkdir(dir, { recursive: true });
  await appendFile(
    join(dir, DRIFT_LOG),
    events.map((e) => `${JSON.stringify(e)}
`).join(""),
    "utf8"
  );
}
async function readDriftLog(root) {
  let text;
  try {
    text = await readFile(contextPath(root, ContextPaths.cache, DRIFT_LOG), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const events = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        events.push(parsed);
      }
    } catch {
    }
  }
  return events;
}
var FAIL_LEVELS = {
  aging: ["aging", "stale", "unverified"],
  stale: ["stale", "unverified"]
};
function failingSections(report, failOn) {
  const levels = FAIL_LEVELS[failOn];
  return report.sections.filter((s) => levels.includes(s.result.level));
}
var TEXT_ORDER = ["stale", "unverified", "aging", "superseded"];
function renderDriftText(report) {
  const c = report.counts;
  const lines = [
    `${report.sections.length} sections: ${c.fresh} fresh, ${c.aging} aging, ${c.stale} stale, ${c.unverified} unverified, ${c.superseded} superseded`
  ];
  for (const level of TEXT_ORDER) {
    for (const s of report.sections) {
      if (s.result.level !== level) continue;
      const { id } = s.section.meta;
      lines.push(
        `${level.toUpperCase()}  ${id}  ${s.section.file}:${s.section.line}  ${s.result.reason}`
      );
    }
  }
  return `${lines.join("\n")}
`;
}
function driftJson(report) {
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
      sourcePaths: s.section.meta.sourcePaths
    }))
  };
}

export {
  CHARS_PER_TOKEN,
  PACKET_HEADER,
  fitToBudget,
  classifyFreshness,
  isInjectable,
  evaluateFreshness,
  bodyHash,
  flagEvents,
  appendDriftLog,
  readDriftLog,
  failingSections,
  renderDriftText,
  driftJson
};
//# sourceMappingURL=chunk-TUW6WTQN.mjs.map