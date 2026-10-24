import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const CONTEXT_DIR = ".context";

/** Files and folders inside .context/. One place so hooks and commands agree. */
export const ContextPaths = {
  config: "config.yaml",
  rules: "rules.md",
  spec: "spec.md",
  state: "STATE.md",
  decisions: "decisions",
  knowledge: "knowledge",
  /** Local, git-ignored: drift log, stats cache, last packet. */
  cache: ".cache",
} as const;

/** Real path where it exists, lowercased on Windows, so `C:\Users` equals `c:/users`. */
export function canonicalPath(path: string): string {
  let p = resolve(path);
  try {
    p = realpathSync.native(p);
  } catch {
    // not on disk (yet): compare the lexical path
  }
  return process.platform === "win32" ? p.toLowerCase() : p;
}

export function samePath(a: string, b: string): boolean {
  return canonicalPath(a) === canonicalPath(b);
}

/** True when `inner` is `outer` or lies inside it. Both must be canonical. */
function containsOrIs(outer: string, inner: string): boolean {
  const rel = relative(outer, inner);
  return rel === "" || (rel.split(sep)[0] !== ".." && !isAbsolute(rel));
}

/**
 * The nearest ancestor-or-self of `cwd` that holds `.context/`, except `home`;
 * null when there is none. File system only, with no process spawn, so hooks can
 * call it on their fast path. A stray `~/.context` never counts: many machines
 * keep one.
 */
export function findContextRoot(cwd: string, home: string): string | null {
  const homeDir = canonicalPath(home);
  for (let dir = resolve(cwd); ; ) {
    if (existsSync(join(dir, CONTEXT_DIR)) && canonicalPath(dir) !== homeDir) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The project root every command works from. It never settles on the home
 * folder or above it, because many machines keep a git repo (or a stray
 * `.context/`) in `~`, and acting on that reads and writes the whole home
 * folder. Picks the first of:
 *
 * 1. the nearest ancestor-or-self of `cwd` that has `.context/`, except `home`;
 * 2. the git toplevel containing `cwd`, unless it is `home` or an ancestor of it;
 * 3. `cwd` itself (so `baton init` works in an empty folder).
 *
 * Only probes the file system and `git rev-parse`; both are read-only.
 */
export async function resolveProjectRoot(cwd: string, home: string): Promise<string> {
  const found = findContextRoot(cwd, home);
  if (found !== null) return found;
  const start = resolve(cwd);
  const top = await toplevelOf(start);
  if (top !== null && !containsOrIs(canonicalPath(top), canonicalPath(home))) return top;
  return start;
}

async function toplevelOf(cwd: string): Promise<string | null> {
  try {
    // Loaded on demand: hooks import this module and must not pay for child_process.
    const { git } = await import("./git.js");
    const out = await git(["rev-parse", "--show-toplevel"], cwd);
    return out === "" ? null : resolve(out);
  } catch {
    return null; // not a repo, or no git
  }
}

export function contextPath(root: string, ...parts: string[]): string {
  return join(root, CONTEXT_DIR, ...parts);
}

/** Repo-relative path with POSIX separators, as stored in source_paths and globs. */
export function toRepoPath(root: string, absPath: string): string {
  return relative(root, absPath).split(sep).join("/");
}
