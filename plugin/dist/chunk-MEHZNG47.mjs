#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);

// src/core/git.ts
import { execFile } from "child_process";
import { promisify } from "util";
var run = promisify(execFile);
async function git(args, cwd) {
  const { stdout } = await run("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trimEnd();
}
async function isGitRepo(cwd) {
  try {
    return await git(["rev-parse", "--is-inside-work-tree"], cwd) === "true";
  } catch {
    return false;
  }
}
async function headSha(cwd) {
  try {
    return await git(["rev-parse", "HEAD"], cwd);
  } catch {
    return null;
  }
}
function assertSha(sha) {
  if (!/^[0-9a-f]{4,40}$/i.test(sha)) throw new Error(`not a commit sha: ${sha}`);
}
async function commitsTouching(cwd, sinceSha, paths) {
  if (paths.length === 0) return 0;
  assertSha(sinceSha);
  const specs = paths.map((p) => `:(glob)${p}`);
  const out = await git(
    ["rev-list", "--count", "--end-of-options", `${sinceSha}..HEAD`, "--", ...specs],
    cwd
  );
  return Number.parseInt(out, 10) || 0;
}
async function diffStat(cwd, exclude = []) {
  const args = ["--no-optional-locks", "diff", "HEAD", "--stat=100"];
  if (exclude.length > 0) args.push("--", ".", ...exclude.map((p) => `:(exclude)${p}`));
  return git(args, cwd);
}
async function listRepoFiles(cwd) {
  if (!await isGitRepo(cwd)) return [];
  const [listed, deleted] = await Promise.all([
    git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd),
    git(["ls-files", "--deleted", "-z"], cwd)
  ]);
  const gone = new Set(deleted.split("\0"));
  const files = new Set(listed.split("\0").filter((p) => p !== "" && !gone.has(p)));
  return [...files].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}
async function changedFilesPerCommit(cwd, sinceSha) {
  assertSha(sinceSha);
  const out = await git(
    [
      "-c",
      "core.quotePath=false",
      "log",
      "--no-merges",
      "--no-renames",
      "--name-only",
      "--format=%x00%H",
      "--end-of-options",
      `${sinceSha}..HEAD`
    ],
    cwd
  );
  return out.split("\0").slice(1).map(
    (chunk) => chunk.split("\n").slice(1).filter((line) => line !== "")
  );
}
async function ignoredPaths(cwd, paths) {
  if (paths.length === 0) return /* @__PURE__ */ new Set();
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      ["-c", "core.quotePath=false", "check-ignore", "--no-index", "--stdin"],
      { cwd, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          if (error.code === 1) resolve(/* @__PURE__ */ new Set());
          else reject(error);
          return;
        }
        resolve(new Set(stdout.split("\n").filter((line) => line.trim() !== "")));
      }
    );
    child.stdin?.on("error", () => {
    });
    child.stdin?.end(`${paths.join("\n")}
`);
  });
}
async function currentBranch(cwd) {
  try {
    return await git(["symbolic-ref", "--short", "-q", "HEAD"], cwd) || null;
  } catch {
    return null;
  }
}
async function statusLines(cwd, options = {}) {
  const out = await git(
    [
      "-c",
      "core.quotePath=false",
      "--no-optional-locks",
      "status",
      "--porcelain=v1",
      ...options.untrackedAll ? ["--untracked-files=all"] : []
    ],
    cwd
  );
  return out ? out.split("\n") : [];
}
function porcelainPath(line) {
  let path = line.slice(3);
  if (line[0] === "R" || line[0] === "C") {
    const arrow = path.indexOf(" -> ");
    if (arrow !== -1) path = path.slice(arrow + 4);
  }
  if (path.length >= 2 && path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
  return path;
}
async function changedFilesSince(cwd, sinceIso) {
  if (await headSha(cwd) === null) return [];
  const since = Math.floor(Date.parse(sinceIso) / 1e3);
  if (Number.isNaN(since)) throw new Error(`bad since: ${sinceIso}`);
  const out = await git(
    [
      "-c",
      "core.quotePath=false",
      "log",
      "--no-merges",
      "--no-renames",
      "--name-only",
      "--format=%x00%H %ct",
      `--since=${since}`,
      "--end-of-options",
      "HEAD"
    ],
    cwd
  );
  const result = [];
  for (const chunk of out.split("\0").slice(1)) {
    const [head = "", ...files] = chunk.split("\n");
    if (!(Number(head.split(" ")[1]) > since)) continue;
    result.push(files.filter((line) => line !== ""));
  }
  return result;
}

export {
  git,
  isGitRepo,
  headSha,
  commitsTouching,
  diffStat,
  listRepoFiles,
  changedFilesPerCommit,
  ignoredPaths,
  currentBranch,
  statusLines,
  porcelainPath,
  changedFilesSince
};
//# sourceMappingURL=chunk-MEHZNG47.mjs.map