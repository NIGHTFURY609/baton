import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Thin wrapper over the git CLI. No library: git is always present where baton runs. */
export async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await run("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trimEnd();
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    return (await git(["rev-parse", "--is-inside-work-tree"], cwd)) === "true";
  } catch {
    return false;
  }
}

export async function headSha(cwd: string): Promise<string | null> {
  try {
    return await git(["rev-parse", "HEAD"], cwd);
  } catch {
    return null; // no commits yet
  }
}

/**
 * Number of commits in sinceSha..HEAD that touch any of the given pathspecs.
 * Globs are passed as `:(glob)` pathspecs so `src/auth/**` behaves the same on
 * every platform. Returns 0 when paths is empty.
 */
export async function commitsTouching(
  cwd: string,
  sinceSha: string,
  paths: string[],
): Promise<number> {
  if (paths.length === 0) return 0;
  const specs = paths.map((p) => `:(glob)${p}`);
  const out = await git(["rev-list", "--count", `${sinceSha}..HEAD`, "--", ...specs], cwd);
  return Number.parseInt(out, 10) || 0;
}

/**
 * `git diff --stat` against HEAD (staged + unstaged), for handoffs. `exclude`
 * paths are left out via `:(exclude)` pathspecs. Rejects when there is no HEAD.
 * Never takes the optional index lock, so a hook can run it during a live session.
 */
export async function diffStat(cwd: string, exclude: string[] = []): Promise<string> {
  const args = ["--no-optional-locks", "diff", "HEAD", "--stat=100"];
  if (exclude.length > 0) args.push("--", ".", ...exclude.map((p) => `:(exclude)${p}`));
  return git(args, cwd);
}

/**
 * Tracked and untracked (not ignored) files that exist on disk, as sorted POSIX
 * repo paths. Not a repo gives []. Inside a repo a git failure rejects: reading
 * it as "no files" would turn every glob into a dead reference.
 */
export async function listRepoFiles(cwd: string): Promise<string[]> {
  if (!(await isGitRepo(cwd))) return [];
  const out = await git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd);
  const files = new Set(out.split("\0").filter((p) => p !== ""));
  // --cached still lists files that were deleted from the work tree.
  return [...files]
    .filter((p) => existsSync(join(cwd, p)))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Files changed by each commit in sinceSha..HEAD, newest commit first. Merges
 * are skipped and renames are not detected, so both names of a rename appear.
 * Rejects when sinceSha is unknown.
 */
export async function changedFilesPerCommit(cwd: string, sinceSha: string): Promise<string[][]> {
  const out = await git(
    [
      "-c",
      "core.quotePath=false",
      "log",
      "--no-merges",
      "--no-renames",
      "--name-only",
      "--format=%x00%H",
      `${sinceSha}..HEAD`,
    ],
    cwd,
  );
  return out
    .split("\0")
    .slice(1)
    .map((chunk) =>
      chunk
        .split("\n")
        .slice(1)
        .filter((line) => line !== ""),
    );
}

/**
 * Which of `paths` are git-ignored (existing or not). Paths go through stdin,
 * not argv: Windows caps a command line at about 32K characters.
 */
export async function ignoredPaths(cwd: string, paths: string[]): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      ["check-ignore", "--no-index", "--stdin"],
      { cwd, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          // Exit code 1 means nothing matched.
          if ((error as { code?: unknown }).code === 1) resolve(new Set());
          else reject(error);
          return;
        }
        resolve(new Set(stdout.split("\n").filter((line) => line.trim() !== "")));
      },
    );
    child.stdin?.on("error", () => {
      // git may exit before reading all of stdin; the callback reports the real error.
    });
    child.stdin?.end(`${paths.join("\n")}\n`);
  });
}

/** Current branch name, or null when HEAD is detached or cwd is not a repo. Works before the first commit. */
export async function currentBranch(cwd: string): Promise<string | null> {
  try {
    return (await git(["symbolic-ref", "--short", "-q", "HEAD"], cwd)) || null;
  } catch {
    return null;
  }
}

/** Porcelain status lines without taking the optional index lock (safe in hooks). */
export async function statusLines(cwd: string): Promise<string[]> {
  const out = await git(["--no-optional-locks", "status", "--porcelain=v1"], cwd);
  return out ? out.split("\n") : [];
}

/** The path of a `status --porcelain=v1` line: after " -> " for renames, quotes stripped. */
export function porcelainPath(line: string): string {
  let path = line.slice(3);
  const arrow = path.indexOf(" -> ");
  if (arrow !== -1) path = path.slice(arrow + 4);
  if (path.length >= 2 && path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
  return path;
}

/** Porcelain status lines, for handoffs. */
export async function statusPorcelain(cwd: string): Promise<string[]> {
  const out = await git(["status", "--porcelain=v1"], cwd);
  return out ? out.split("\n") : [];
}
