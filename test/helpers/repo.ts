import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll } from "vitest";
import { loadConfig } from "../../src/core/config.js";
import type { TaskService } from "../../src/core/tasks/native/service.js";
import { openTaskService } from "../../src/core/tasks/native/store.js";

// This machine's home folder (C:/Users/jeswi) is a git repo. Without a ceiling,
// git run inside any temp dir would find it, and "no git" tests would see its
// HEAD. Git never searches upward past GIT_CEILING_DIRECTORIES, and child
// processes inherit the variable.
process.env.GIT_CEILING_DIRECTORIES = tmpdir();

export const REPO_ROOT = join(import.meta.dirname, "..", "..");

export const CONTEXT_FIXTURE = {
  ".gitignore": ".context/.cache/\n",
  "package.json": '{ "name": "demo" }\n',
  "src/auth/login.ts": "export const login = 1;\n",
  ".context/config.yaml": "version: 1\ntasks:\n  prefix: bt\n",
  ".context/rules.md":
    "# Rules\n\n## Project rules\n<!-- baton: {id: rules-project, kind: rule, verified_at: null, source_paths: [package.json]} -->\n\n- Tests run with `npm test`.\n",
  ".context/spec.md":
    '# Spec\n\n## Authentication\n<!-- baton: {id: auth, kind: intent, verified_at: null, source_paths: ["src/auth/**"]} -->\n\nUsers sign in with passkeys (`src/auth/login.ts`).\n\n## Billing\n<!-- baton: {id: billing, kind: intent, verified_at: null, source_paths: []} -->\n\nStripe, monthly only.\n',
  ".context/STATE.md":
    "---\nid: state\nkind: state\nverified_at: null\nsource_paths: []\n---\n# State\n\nNothing handed off yet.\n",
  ".context/knowledge/README.md": "# Knowledge\n\nNo frontmatter, so not a section.\n",
  ".context/knowledge/windows.md":
    '---\nid: knowledge-windows\nkind: knowledge\nverified_at: null\nsource_paths: ["src/**"]\n---\n# Windows gotchas\n\n- Exec-form hooks need no bash.\n',
  ".context/decisions/0000-template.md":
    "---\nid: adr-NNNN\nkind: decision\nstatus: proposed\n---\n# {title}\n",
  ".context/decisions/0001-use-passkeys.md":
    "---\nid: adr-0001\nkind: decision\nstatus: accepted\ndate: 2026-10-20\nverified_at: null\nsource_paths: []\nspec_sections: [auth]\n---\n# Use passkeys for sign-in\n\n## Decision Outcome\n\nPasskeys only.\n",
  ".context/decisions/0002-use-passwords.md":
    '---\nid: adr-0002\nkind: decision\nstatus: "superseded by ADR-0001"\ndate: 2026-10-19\nverified_at: null\nsource_paths: []\nspec_sections: [auth]\n---\n# Use passwords\n\nPasswords.\n',
} as const satisfies Record<string, string>;

const createdDirs = new Set<string>();

// Every dir made through makeTempDir is removed when its test file finishes. A dir that is
// still held open on Windows (EBUSY, a SQLite handle) is left for the OS temp cleanup.
afterAll(() => {
  for (const dir of createdDirs) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch {
      // best effort
    }
  }
  createdDirs.clear();
});

/** The only way tests make plain temp dirs; they are removed after the test file runs. */
export function makeTempDir(prefix?: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix ?? "baton-test-"));
  createdDirs.add(dir);
  return dir;
}

/** Write `files` (repo path -> content) under `root`. Bytes are written as given ("\r\n" stays). */
export function writeFiles(root: string, files: Readonly<Record<string, string>>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

export function runGit(root: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "core.autocrlf=false", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();
}

/** Stage everything, commit, and return the full HEAD sha. */
export function commitAll(root: string, message: string): string {
  runGit(root, "add", "-A");
  runGit(
    root,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    message,
  );
  return runGit(root, "rev-parse", "HEAD");
}

/**
 * A temp dir holding `files` (default CONTEXT_FIXTURE), a git repo with one
 * commit unless `opts.git === false`.
 *
 * `findContextRoot` (an existsSync walk) ignores GIT_CEILING_DIRECTORIES. A
 * fixture with `.context/` is its own project root; a dir that must count as
 * "no project" needs `runGit(dir, "init", "-q")`.
 */
export function makeRepo(
  files?: Readonly<Record<string, string>>,
  opts?: { git?: boolean },
): string {
  const root = makeTempDir("baton-repo-");
  writeFiles(root, files ?? CONTEXT_FIXTURE);
  if (opts?.git !== false) {
    runGit(root, "-c", "init.defaultBranch=main", "init", "-q");
    commitAll(root, "init");
  }
  return root;
}

function* walkMarkdown(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkMarkdown(abs);
    else if (entry.name.endsWith(".md")) yield abs;
  }
}

/**
 * In every .context/**\/*.md except decisions/0000-template.md, replace each
 * `verified_at: null` with `verified_at: "<sha12>"`.
 */
export function stampFixture(root: string, sha12: string): void {
  const ctx = join(root, ".context");
  const template = join(ctx, "decisions", "0000-template.md");
  for (const file of walkMarkdown(ctx)) {
    if (file === template) continue;
    const text = readFileSync(file, "utf8");
    writeFileSync(file, text.replaceAll("verified_at: null", `verified_at: "${sha12}"`));
  }
}

/** Open the native task service for `root` as `actor`, run `fn`, and always close the db. */
export async function withService<T>(
  root: string,
  actor: string,
  fn: (s: TaskService) => T,
): Promise<T> {
  const config = await loadConfig(root);
  const { service, db } = openTaskService(root, config, { actor });
  try {
    return await fn(service);
  } finally {
    db.close();
  }
}
