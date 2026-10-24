import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigSchema, loadConfig } from "../src/core/config.js";
import { BatonError } from "../src/core/errors.js";
import { changedFilesSince } from "../src/core/git.js";
import { TaskError } from "../src/core/tasks/native/model.js";
import {
  activeTask,
  changesSince,
  checkCommands,
  runCheck,
  verifyTask,
} from "../src/core/verify.js";
import {
  CONTEXT_FIXTURE,
  commitAll,
  makeRepo,
  makeTempDir,
  runGit,
  withService,
  writeFiles,
} from "./helpers/repo.js";

process.env.BATON_ACTOR = "tester";

const PASS = 'node -e "process.exit(0)"';
const FAIL3 = 'node -e "process.exit(3)"';

/** A repo whose commits have rising explicit committer dates (2025-12-01, 2026-01-01, 2026-06-01). */
function datedRepo(): string {
  const root = makeRepo(CONTEXT_FIXTURE, { git: false });
  runGit(root, "-c", "init.defaultBranch=main", "init", "-q");
  try {
    process.env.GIT_COMMITTER_DATE = "2025-12-01T00:00:00+00:00";
    commitAll(root, "base");
    process.env.GIT_COMMITTER_DATE = "2026-01-01T00:00:00+00:00";
    writeFiles(root, { "old.txt": "old\n" });
    commitAll(root, "old");
    process.env.GIT_COMMITTER_DATE = "2026-06-01T00:00:00+00:00";
    writeFiles(root, { "new.txt": "new\n" });
    commitAll(root, "new");
  } finally {
    delete process.env.GIT_COMMITTER_DATE;
  }
  return root;
}

async function claimed(
  root: string,
  labels: string[],
  extra: { issueType?: "task" | "epic"; actor?: string; title?: string } = {},
) {
  return withService(root, extra.actor ?? "tester", (s) => {
    const t = s.create({
      title: extra.title ?? "Work",
      labels,
      ...(extra.issueType ? { issueType: extra.issueType } : {}),
    });
    s.claim(t.id);
    return t;
  });
}

function readTask(root: string, id: string) {
  return withService(root, "tester", (s) => s.get(id));
}

describe("changedFilesSince", () => {
  it("filters by committer time", async () => {
    const root = datedRepo();
    expect(await changedFilesSince(root, "2026-03-01T00:00:00.000Z")).toEqual([["new.txt"]]);
    expect(await changedFilesSince(root, "2027-01-01T00:00:00.000Z")).toEqual([]);
    expect(await changedFilesSince(root, "2025-12-15T00:00:00.000Z")).toEqual([
      ["new.txt"],
      ["old.txt"],
    ]);
  });

  it("excludes a commit made in the same second as the start", async () => {
    const root = datedRepo();
    expect(await changedFilesSince(root, "2026-06-01T00:00:00.500Z")).toEqual([]);
    expect(await changedFilesSince(root, "2026-05-31T23:59:59.000Z")).toEqual([["new.txt"]]);
  });

  it("returns [] for an empty repo", async () => {
    const dir = makeTempDir();
    runGit(dir, "init", "-q");
    expect(await changedFilesSince(dir, "2026-01-01T00:00:00.000Z")).toEqual([]);
  });

  it("returns [] outside a repo", async () => {
    expect(await changedFilesSince(makeTempDir(), "2026-01-01T00:00:00.000Z")).toEqual([]);
  });

  it("rejects an unparseable date", async () => {
    const root = datedRepo();
    await expect(changedFilesSince(root, "not a date")).rejects.toThrow("bad since: not a date");
  });
});

describe("changesSince", () => {
  it("ignores task-store churn", async () => {
    const root = datedRepo();
    writeFiles(root, {
      "old.txt": "changed\n",
      ".context/tasks.jsonl": "{}\n",
      ".context/STATE.md": "changed\n",
      ".context/.cache/x": "x\n",
    });
    expect(await changesSince(root, "2026-03-01T00:00:00.000Z")).toEqual(["new.txt", "old.txt"]);
  });

  it("lists an untracked .context/ file by file, so a claim alone is never a diff", async () => {
    const root = makeTempDir();
    runGit(root, "-c", "init.defaultBranch=main", "init", "-q");
    writeFiles(root, { "a.txt": "a\n" });
    commitAll(root, "one");
    writeFiles(root, {
      ".context/tasks.jsonl": "{}\n",
      ".context/.cache/x": "x\n",
      ".context/STATE.md": "s\n",
    });
    const future = "2999-01-01T00:00:00.000Z";
    expect(await changesSince(root, future)).toEqual([]);
    writeFiles(root, { "work.txt": "w\n" });
    expect(await changesSince(root, future)).toEqual(["work.txt"]);
  });
});

describe("checkCommands", () => {
  it("keeps check: labels, trimmed, in order", () => {
    expect(checkCommands(["spec:x", "check:npm test", "check:  node -e 0 ", "check:"])).toEqual([
      "npm test",
      "node -e 0",
    ]);
  });
});

describe("runCheck", () => {
  it("reports exit 0 for a passing command", async () => {
    const run = await runCheck(PASS, makeTempDir());
    expect(run.exitCode).toBe(0);
    expect(run.timedOut).toBe(false);
  });

  it("reports the exit code of a failing command", async () => {
    const run = await runCheck(FAIL3, makeTempDir());
    expect(run.exitCode).toBe(3);
    expect(run.timedOut).toBe(false);
  });

  it("keeps the last 4000 characters as tail and streams all of it to onOutput", async () => {
    const seen: string[] = [];
    const run = await runCheck(`node -e "process.stdout.write('x'.repeat(5000))"`, makeTempDir(), {
      onOutput: (chunk) => seen.push(chunk),
    });
    expect(run.tail).toHaveLength(4000);
    expect(seen.join("")).toHaveLength(5000);
  });

  it("runs in the given cwd", async () => {
    const dir = makeTempDir();
    writeFiles(dir, { "marker.txt": "x" });
    const run = await runCheck(
      `node -e "process.exit(require('fs').existsSync('marker.txt')?0:4)"`,
      dir,
    );
    expect(run.exitCode).toBe(0);
  });

  // taskkill.exe start-up varies when the whole suite runs in parallel: measured 320 to 550 ms, and
  // a 1.7 to 2.0 s spike inferred from the one flake. A second flake source is node start-up under
  // load exceeding the 300 ms timeout, so pid.txt is missing. Retry absorbs both. The wrong kill
  // order is not transient: it always takes about 2.3 s.
  it("kills the whole process tree on timeout", { retry: 2 }, async () => {
    const dir = makeTempDir();
    const started = Date.now();
    const run = await runCheck(
      `node -e "require('fs').writeFileSync('pid.txt',String(process.pid));setInterval(()=>0,1000)"`,
      dir,
      { timeoutMs: 300 },
    );
    const elapsed = Date.now() - started;
    expect(run.timedOut).toBe(true);
    // The 2 s backstop would only release the pipes at about 2.3 s.
    expect(elapsed).toBeLessThan(1500);
    expect(existsSync(join(dir, "pid.txt"))).toBe(true);
    const pid = Number(readFileSync(join(dir, "pid.txt"), "utf8"));
    expect(Number.isInteger(pid)).toBe(true);
    let gone = false;
    for (let i = 0; i < 20 && !gone; i++) {
      try {
        process.kill(pid, 0);
        await new Promise((r) => setTimeout(r, 50));
      } catch (error) {
        gone = (error as NodeJS.ErrnoException).code === "ESRCH";
        if (!gone) throw error;
      }
    }
    expect(gone).toBe(true);
  });
});

describe("verifyTask", () => {
  it("reports no-diff when nothing changed", async () => {
    const root = makeRepo();
    const t = await claimed(root, [`check:${PASS}`]);
    const config = await loadConfig(root);
    const out = await verifyTask(root, config, t.id, { requireDiff: true, close: true });
    expect(out.status).toBe("no-diff");
  });

  it("passes and closes when a file changed", async () => {
    const root = makeRepo();
    const t = await claimed(root, [`check:${PASS}`]);
    writeFiles(root, { "src/auth/login.ts": "export const login = 2;\n" });
    const config = await loadConfig(root);
    const out = await verifyTask(root, config, t.id, { requireDiff: true, close: true });
    expect(out.status).toBe("passed");
    if (out.status !== "passed") return;
    expect(out.closed).toBe(true);
    expect(out.changes).toEqual(["src/auth/login.ts"]);
    const stored = await readTask(root, t.id);
    expect(stored?.status).toBe("closed");
    expect(stored?.closeReason).toBe(`verified: ${PASS}`);
  });

  it("passes with requireDiff false and no change", async () => {
    const root = makeRepo();
    const t = await claimed(root, [`check:${PASS}`]);
    const config = await loadConfig(root);
    const out = await verifyTask(root, config, t.id, { requireDiff: false, close: true });
    expect(out.status).toBe("passed");
    if (out.status === "passed") expect(out.changes).toEqual([]);
  });

  it("passes without closing when close is false", async () => {
    const root = makeRepo();
    const t = await claimed(root, [`check:${PASS}`]);
    writeFiles(root, { "src/auth/login.ts": "export const login = 2;\n" });
    const config = await loadConfig(root);
    const out = await verifyTask(root, config, t.id, { requireDiff: true, close: false });
    expect(out.status).toBe("passed");
    if (out.status === "passed") expect(out.closed).toBe(false);
    expect((await readTask(root, t.id))?.status).toBe("in_progress");
  });

  it("fails on the first failing check and leaves the task open", async () => {
    const root = makeRepo();
    const t = await claimed(root, [`check:${PASS}`, `check:${FAIL3}`]);
    writeFiles(root, { "src/auth/login.ts": "export const login = 2;\n" });
    const config = await loadConfig(root);
    const out = await verifyTask(root, config, t.id, { requireDiff: true, close: true });
    expect(out.status).toBe("failed");
    if (out.status === "failed") {
      expect(out.run.exitCode).toBe(3);
      expect(out.passed).toHaveLength(1);
    }
    expect((await readTask(root, t.id))?.status).toBe("in_progress");
  });

  it("reports already-closed without running anything", async () => {
    const root = makeRepo();
    const t = await claimed(root, [`check:${FAIL3}`]);
    await withService(root, "tester", (s) => s.close(t.id, "done", true));
    const config = await loadConfig(root);
    const out = await verifyTask(root, config, t.id, { requireDiff: true, close: true });
    expect(out).toEqual({ status: "already-closed", id: t.id });
  });

  it("rejects a task with no check label with exit 1", async () => {
    const root = makeRepo();
    const t = await claimed(root, ["spec:auth"]);
    const config = await loadConfig(root);
    const err = await verifyTask(root, config, t.id, { requireDiff: false, close: true }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BatonError);
    expect((err as BatonError).exitCode).toBe(1);
    expect((err as BatonError).message).toContain("has no check: label");
  });

  it("rejects an unknown task with exit 1", async () => {
    const root = makeRepo();
    const config = await loadConfig(root);
    const err = await verifyTask(root, config, "bt-zzz", { requireDiff: false, close: true }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BatonError);
    expect((err as BatonError).exitCode).toBe(1);
  });

  it("needs a git repository for the diff rule", async () => {
    const root = makeRepo(CONTEXT_FIXTURE, { git: false });
    const t = await claimed(root, [`check:${PASS}`]);
    const config = await loadConfig(root);
    const err = await verifyTask(root, config, t.id, { requireDiff: true, close: true }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BatonError);
    expect((err as BatonError).exitCode).toBe(1);
    expect((err as BatonError).message).toContain("--no-diff");
  });

  it("passes outside a repository when the diff rule is off", async () => {
    const root = makeRepo(CONTEXT_FIXTURE, { git: false });
    const t = await claimed(root, [`check:${PASS}`]);
    const config = await loadConfig(root);
    const out = await verifyTask(root, config, t.id, { requireDiff: false, close: true });
    expect(out.status).toBe("passed");
  });

  it("is not implemented for other task backends", async () => {
    const root = makeRepo();
    const err = await verifyTask(root, ConfigSchema.parse({ tasks: { backend: "none" } }), "bt-x", {
      requireDiff: false,
      close: true,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BatonError);
    expect((err as BatonError).exitCode).toBe(3);
  });

  it("propagates has_open_blockers from close and leaves the task open", async () => {
    const root = makeRepo();
    const D = await withService(root, "tester", (s) => {
      const B = s.create({ title: "Blocker" });
      const task = s.create({
        title: "Dependent",
        labels: [`check:${PASS}`],
        deps: [["blocks", B.id]],
      });
      s.claim(task.id);
      return task;
    });
    writeFiles(root, { "src/auth/login.ts": "export const login = 2;\n" });
    const config = await loadConfig(root);
    const err = await verifyTask(root, config, D.id, { requireDiff: true, close: true }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(TaskError);
    expect((err as TaskError).code).toBe("has_open_blockers");
    expect((await readTask(root, D.id))?.status).toBe("in_progress");
  });
});

describe("activeTask", () => {
  it("returns the most recently claimed checked task", async () => {
    const root = makeRepo();
    await claimed(root, [`check:${PASS}`], { title: "A" });
    await new Promise((r) => setTimeout(r, 5));
    const b = await claimed(root, [`check:${PASS}`], { title: "B" });
    const config = await loadConfig(root);
    expect((await activeTask(root, config, "tester"))?.id).toBe(b.id);
  });

  it("ignores an in-progress epic", async () => {
    const root = makeRepo();
    await claimed(root, [`check:${PASS}`], { issueType: "epic" });
    const config = await loadConfig(root);
    expect(await activeTask(root, config, "tester")).toBeNull();
  });

  it("ignores a task claimed by someone else", async () => {
    const root = makeRepo();
    await claimed(root, [`check:${PASS}`], { actor: "alice" });
    const config = await loadConfig(root);
    expect(await activeTask(root, config, "tester")).toBeNull();
  });

  it("ignores a task without a check label", async () => {
    const root = makeRepo();
    await claimed(root, ["spec:auth"]);
    const config = await loadConfig(root);
    expect(await activeTask(root, config, "tester")).toBeNull();
  });

  it("returns null when nothing qualifies", async () => {
    const root = makeRepo();
    const config = await loadConfig(root);
    expect(await activeTask(root, config, "tester")).toBeNull();
  });
});
