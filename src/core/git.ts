import { execFile } from "node:child_process";
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

/** `git diff --stat` against HEAD (staged + unstaged), for handoffs. */
export async function diffStat(cwd: string): Promise<string> {
  return git(["diff", "HEAD", "--stat"], cwd);
}

/** Porcelain status lines, for handoffs. */
export async function statusPorcelain(cwd: string): Promise<string[]> {
  const out = await git(["status", "--porcelain=v1"], cwd);
  return out ? out.split("\n") : [];
}
