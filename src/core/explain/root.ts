import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { git } from "../git.js";
import { CONTEXT_DIR } from "../paths.js";

/**
 * Where `baton explain` treats the project as starting. Unlike
 * `findProjectRoot`, it never settles on the home folder or above it: many
 * machines keep a git repo (or a stray `.context/`) in `~`, and indexing that
 * means listing the whole home folder. Picks the first of:
 *
 * 1. the nearest ancestor-or-self of `cwd` that has `.context/`, except `home`;
 * 2. the git toplevel containing `cwd`, unless it is `home` or an ancestor of it;
 * 3. `cwd` itself.
 *
 * Only probes the file system and `git rev-parse`; both are read-only.
 */
export async function resolveExplainRoot(cwd: string, home: string): Promise<string> {
  const start = resolve(cwd);
  const homeDir = canonical(home);

  for (let dir = start; ; ) {
    if (canonical(dir) !== homeDir && existsSync(join(dir, CONTEXT_DIR))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const top = await gitToplevel(start);
  if (top !== null && !containsOrIs(canonical(top), homeDir)) return top;
  return start;
}

/** Real path where it exists, lowercased on Windows, so `C:\Users` equals `c:/users`. */
function canonical(path: string): string {
  let p = resolve(path);
  try {
    p = realpathSync.native(p);
  } catch {
    // not on disk (yet): compare the lexical path
  }
  return process.platform === "win32" ? p.toLowerCase() : p;
}

/** True when `inner` is `outer` or lies inside it. Both are already canonical. */
function containsOrIs(outer: string, inner: string): boolean {
  const rel = relative(outer, inner);
  return rel === "" || (rel.split(sep)[0] !== ".." && !isAbsolute(rel));
}

async function gitToplevel(cwd: string): Promise<string | null> {
  try {
    const out = await git(["rev-parse", "--show-toplevel"], cwd);
    return out === "" ? null : resolve(out);
  } catch {
    return null; // not a repo, or no git
  }
}
