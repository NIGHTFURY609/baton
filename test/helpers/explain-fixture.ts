import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Write `files` (repo path -> content) under `root`, creating folders as needed. */
export async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    // Bytes are written as given: a "\r\n" in `content` stays "\r\n" on disk.
    await writeFile(abs, content);
  }
}

/**
 * A fresh empty temp dir that is guaranteed not to be inside some ancestor git
 * repo (some machines have a repo at the home folder, which would make a "no
 * git" test see that repo). Git never searches upward past GIT_CEILING_DIRECTORIES,
 * so it is pinned to the OS temp folder for every git call made in this process.
 * Tests do not clean up; the OS temp folder does.
 */
export function makeTempDir(prefix = "baton-explain-"): Promise<string> {
  process.env.GIT_CEILING_DIRECTORIES = tmpdir();
  return mkdtemp(join(tmpdir(), prefix));
}

const ARCH_DOC = [
  "Notes on the hook pipeline.",
  "",
  "## Hooks",
  "",
  "Hooks fail open.",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[Session start] --> B(Mission packet)",
  "  B -->|writes| C{STATE.md}",
  "```",
  "",
].join("\r\n");

/**
 * The shared `baton explain` fixture repo, used by the target index, fact
 * collection and orchestrator tests. Layout:
 *
 *   package.json                    deps supabase, @modelcontextprotocol/server; devDeps vitest
 *   .context/spec.md                one section, id `auth` ("Authentication")
 *   .context/decisions/0001-use-supabase.md   id adr-0001, spec_sections [auth]
 *   docs/arch.md                    CRLF; `## Hooks` heading + mermaid A -> B -> C
 *   src/a/index.ts, src/b/index.ts
 *
 * It is a real git repo with everything staged (`git add -A`, no commit), so
 * `git ls-files --cached` is exercised. The repo is pinned to
 * `core.autocrlf=false` so the CRLF doc keeps its bytes whatever the machine's
 * global git config says. Returns the repo root (an absolute path).
 */
export async function makeFixture(): Promise<string> {
  const root = await makeTempDir();
  await writeFiles(root, {
    "package.json": `${JSON.stringify(
      {
        name: "fixture",
        dependencies: { supabase: "^2.0.0", "@modelcontextprotocol/server": "^2.3.1" },
        devDependencies: { vitest: "^5.0.0" },
      },
      null,
      2,
    )}\n`,
    ".context/spec.md": [
      "# Spec",
      "",
      "## Authentication",
      '<!-- baton: {id: auth, kind: intent, verified_at: null, source_paths: ["src/a/**"]} -->',
      "",
      "Users sign in with passkeys.",
      "",
    ].join("\n"),
    ".context/decisions/0001-use-supabase.md": [
      "---",
      "id: adr-0001",
      "kind: decision",
      "status: accepted",
      "verified_at: null",
      "source_paths: [src/a/**]",
      "spec_sections: [auth]",
      "---",
      "# Use Supabase for auth",
      "",
      "We use Supabase.",
      "",
    ].join("\n"),
    "docs/arch.md": ARCH_DOC,
    "src/a/index.ts": "export const a = 1;\n",
    "src/b/index.ts": "export const b = 2;\n",
  });
  await run("git", ["init", "-q"], { cwd: root });
  await run("git", ["config", "core.autocrlf", "false"], { cwd: root });
  await run("git", ["add", "-A"], { cwd: root });
  return root;
}
