#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);

// src/core/paths.ts
import { existsSync, realpathSync } from "fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "path";
var CONTEXT_DIR = ".context";
var ContextPaths = {
  config: "config.yaml",
  rules: "rules.md",
  spec: "spec.md",
  state: "STATE.md",
  decisions: "decisions",
  knowledge: "knowledge",
  /** Local, git-ignored: drift log, stats cache, last packet. */
  cache: ".cache"
};
function canonicalPath(path) {
  let p = resolve(path);
  try {
    p = realpathSync.native(p);
  } catch {
  }
  return process.platform === "win32" ? p.toLowerCase() : p;
}
function samePath(a, b) {
  return canonicalPath(a) === canonicalPath(b);
}
function containsOrIs(outer, inner) {
  const rel = relative(outer, inner);
  return rel === "" || rel.split(sep)[0] !== ".." && !isAbsolute(rel);
}
function findContextRoot(cwd, home) {
  const homeDir = canonicalPath(home);
  for (let dir = resolve(cwd); ; ) {
    if (existsSync(join(dir, CONTEXT_DIR)) && canonicalPath(dir) !== homeDir) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
async function resolveProjectRoot(cwd, home) {
  const found = findContextRoot(cwd, home);
  if (found !== null) return found;
  const start = resolve(cwd);
  const top = await toplevelOf(start);
  if (top !== null && !containsOrIs(canonicalPath(top), canonicalPath(home))) return top;
  return start;
}
async function toplevelOf(cwd) {
  try {
    const { git } = await import("./git-F5KU4KAX.mjs");
    const out = await git(["rev-parse", "--show-toplevel"], cwd);
    return out === "" ? null : resolve(out);
  } catch {
    return null;
  }
}
function contextPath(root, ...parts) {
  return join(root, CONTEXT_DIR, ...parts);
}
function toRepoPath(root, absPath) {
  return relative(root, absPath).split(sep).join("/");
}

export {
  CONTEXT_DIR,
  ContextPaths,
  samePath,
  findContextRoot,
  resolveProjectRoot,
  contextPath,
  toRepoPath
};
//# sourceMappingURL=chunk-HVIRJWHJ.mjs.map