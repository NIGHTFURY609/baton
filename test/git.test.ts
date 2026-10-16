import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { commitsTouching, headSha, isGitRepo } from "../src/core/git.js";

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
