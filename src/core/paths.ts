import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

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

/**
 * Walk up from `start` to the nearest directory containing .context/ or .git.
 * Falls back to `start` so `baton init` works in an empty folder.
 */
export function findProjectRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, CONTEXT_DIR)) || existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

export function contextPath(root: string, ...parts: string[]): string {
  return join(root, CONTEXT_DIR, ...parts);
}

/** Repo-relative path with POSIX separators, as stored in source_paths and globs. */
export function toRepoPath(root: string, absPath: string): string {
  return relative(root, absPath).split(sep).join("/");
}
