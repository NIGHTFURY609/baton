import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  changedFilesPerCommit,
  commitsTouching,
  currentBranch,
  diffStat,
  headSha,
  ignoredPaths,
  isGitRepo,
  listRepoFiles,
  porcelainPath,
  statusLines,
} from "../src/core/git.js";
import { commitAll, makeRepo, makeTempDir, runGit, writeFiles } from "./helpers/repo.js";

let repo: string;
const sh = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
const commit = (file: string, msg: string) => {
  mkdirSync(join(repo, file, ".."), { recursive: true });
  writeFileSync(join(repo, file), `${msg}\n`);
  sh("add", "-A");
  sh("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", msg);
};

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "baton-git-"));
  sh("init", "-q");
  commit("README.md", "init");
});

describe("git helpers", () => {
  it("detects repos and HEAD", async () => {
    expect(await isGitRepo(repo)).toBe(true);
    expect(await headSha(repo)).toMatch(/^[0-9a-f]{40}$/);
  });

  it("counts only commits touching the globbed paths", async () => {
    const base = (await headSha(repo)) as string;
    commit("src/auth/login.ts", "auth 1");
    commit("src/billing/pay.ts", "billing");
    commit("src/auth/deep/session.ts", "auth 2");
    expect(await commitsTouching(repo, base, ["src/auth/**"])).toBe(2);
    expect(await commitsTouching(repo, base, ["src/billing/**"])).toBe(1);
    expect(await commitsTouching(repo, base, [])).toBe(0);
  });
});

describe("git helpers for freshness", () => {
  it("lists tracked and untracked files, not ignored ones", async () => {
    const root = makeRepo({
      ".gitignore": "build/\n",
      "a.txt": "a\n",
      "src/b.ts": "b\n",
      "gone.txt": "g\n",
    });
    writeFiles(root, { "c.txt": "c\n", "build/x.js": "x\n" });
    rmSync(join(root, "gone.txt"));
    expect(await listRepoFiles(root)).toEqual([".gitignore", "a.txt", "c.txt", "src/b.ts"]);
    expect(await listRepoFiles(makeTempDir())).toEqual([]);
  });

  it("lists changed files per commit, newest first", async () => {
    const root = makeRepo({ "a.txt": "a\n" });
    const base = commitAll(root, "base");
    writeFiles(root, { "src/x.ts": "x\n" });
    commitAll(root, "x");
    writeFiles(root, { "docs/y.md": "y\n", "src/z.ts": "z\n" });
    commitAll(root, "yz");
    expect(await changedFilesPerCommit(root, base)).toEqual([
      ["docs/y.md", "src/z.ts"],
      ["src/x.ts"],
    ]);
  });

  it("shows both names of a rename", async () => {
    const root = makeRepo({ "a.txt": "a\n", "src/x.ts": "some content here\n" });
    const base = commitAll(root, "base");
    runGit(root, "mv", "src/x.ts", "src/w.ts");
    commitAll(root, "rename");
    const chunks = await changedFilesPerCommit(root, base);
    expect(chunks[0]).toContain("src/w.ts");
    expect(chunks[0]).toContain("src/x.ts");
  });

  it("rejects an unknown sha", async () => {
    const root = makeRepo({ "a.txt": "a\n" });
    await expect(changedFilesPerCommit(root, "0123456789ab")).rejects.toThrow();
  });

  it("reports ignored paths, including missing ones", async () => {
    const root = makeRepo({ ".gitignore": "build/\nplugin/dist/\n", "src/b.ts": "b\n" });
    expect(await ignoredPaths(root, ["build/out.js", "src/b.ts", "plugin/dist/"])).toEqual(
      new Set(["build/out.js", "plugin/dist/"]),
    );
    expect(await ignoredPaths(root, ["src/b.ts"])).toEqual(new Set());
    expect(await ignoredPaths(root, [])).toEqual(new Set());
    const many = Array.from({ length: 2000 }, (_, i) => `build/f${i}.js`);
    expect((await ignoredPaths(root, many)).size).toBe(2000);
  });

  it("reads the branch", async () => {
    const root = makeRepo({ "a.txt": "a\n" });
    expect(await currentBranch(root)).toBe("main");
    runGit(root, "checkout", "-q", "--detach");
    expect(await currentBranch(root)).toBeNull();
    expect(await currentBranch(makeTempDir())).toBeNull();
  });

  it("reads status without the optional lock", async () => {
    const root = makeRepo({ "a.txt": "a\n" });
    writeFiles(root, { "a.txt": "changed\n" });
    expect(await statusLines(root)).toEqual([" M a.txt"]);
  });

  it("extracts the path from a porcelain line", () => {
    expect(porcelainPath(" M src/a.ts")).toBe("src/a.ts");
    expect(porcelainPath("R  old.ts -> src/b.ts")).toBe("src/b.ts");
    expect(porcelainPath('?? "a b.md"')).toBe("a b.md");
  });

  it("excludes paths from diff --stat", async () => {
    const root = makeRepo({ "a.txt": "a\n", ".context/STATE.md": "s\n" });
    writeFiles(root, { "a.txt": "a2\n", ".context/STATE.md": "s2\n" });
    const filtered = await diffStat(root, [".context/STATE.md"]);
    expect(filtered).toContain("a.txt");
    expect(filtered).not.toContain("STATE.md");
    const all = await diffStat(root);
    expect(all).toContain("a.txt");
    expect(all).toContain("STATE.md");
  });
});
