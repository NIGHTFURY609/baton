import { describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli.js";
import { makeRepo, makeTempDir, runGit, withService, writeFiles } from "./helpers/repo.js";

process.env.BATON_ACTOR = "tester";

const PASS = 'node -e "process.exit(0)"';
const FAIL3 = 'node -e "process.exit(3)"';

async function claimed(root: string, labels: string[], title = "Work") {
  return withService(root, "tester", (s) => {
    const t = s.create({ title, labels });
    s.claim(t.id);
    return t;
  });
}

const change = (root: string) =>
  writeFiles(root, { "src/auth/login.ts": "export const login = 2;\n" });

const read = (root: string, id: string) => withService(root, "tester", (s) => s.get(id));

describe("baton verify", () => {
  it("closes on a passing check with a change, then reports already closed", async () => {
    const root = makeRepo();
    const t = await claimed(root, [`check:${PASS}`]);
    change(root);
    const r = await runCli(["verify", t.id], root);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(`running check: ${PASS}`);
    expect(r.stdout).toContain(`closed ${t.id} (checks passed: ${PASS})`);
    const again = await runCli(["verify", t.id], root);
    expect(again.exitCode).toBe(0);
    expect(again.stdout).toContain(`${t.id} is already closed`);
  });

  it("exits 2 with no changes; --no-diff then closes", async () => {
    const root = makeRepo();
    const t = await claimed(root, [`check:${PASS}`]);
    const r = await runCli(["verify", t.id], root);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("no changes since");
    expect((await read(root, t.id))?.status).toBe("in_progress");
    const forced = await runCli(["verify", t.id, "--no-diff"], root);
    expect(forced.exitCode).toBe(0);
  });

  it("exits 2 when a check fails and leaves the task open", async () => {
    const root = makeRepo();
    const t = await claimed(root, [`check:${FAIL3}`]);
    change(root);
    const r = await runCli(["verify", t.id], root);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("check failed (exit 3)");
    expect(r.stderr).toContain("stays open");
    expect((await read(root, t.id))?.status).toBe("in_progress");
  });

  it("exits 2 with open blockers", async () => {
    const root = makeRepo();
    const blocker = await withService(root, "tester", (s) => s.create({ title: "Blocker" }));
    const t = await withService(root, "tester", (s) => {
      const c = s.create({ title: "Work", labels: [`check:${PASS}`] });
      s.addDependency(c.id, blocker.id, "blocks");
      s.claim(c.id);
      return c;
    });
    change(root);
    const r = await runCli(["verify", t.id], root);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("blocked by open");
  });

  it("exits 1 for an unknown task", async () => {
    const root = makeRepo();
    expect((await runCli(["verify", "bt-zzz"], root)).exitCode).toBe(1);
  });

  it("exits 1 outside a baton project", async () => {
    const dir = makeTempDir();
    runGit(dir, "init", "-q");
    expect((await runCli(["verify", "bt-1"], dir)).exitCode).toBe(1);
  });
});

describe("task close on a checked task", () => {
  it("refuses without --force", async () => {
    const root = makeRepo();
    const t = await claimed(root, [`check:${PASS}`]);
    const r = await runCli(["task", "close", t.id], root);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("has a check");
    expect(r.stderr).toContain("baton verify");
    expect((await read(root, t.id))?.status).toBe("in_progress");
  });

  it("records a forced close", async () => {
    const root = makeRepo();
    const t = await claimed(root, [`check:${PASS}`]);
    const r = await runCli(["task", "close", t.id, "--force", "--reason", "manual"], root);
    expect(r.exitCode).toBe(0);
    expect((await read(root, t.id))?.closeReason).toBe("forced (check not run): manual");
  });

  it("leaves an unchecked task's reason alone", async () => {
    const root = makeRepo();
    const t = await claimed(root, []);
    const r = await runCli(["task", "close", t.id, "--reason", "done"], root);
    expect(r.exitCode).toBe(0);
    expect((await read(root, t.id))?.closeReason).toBe("done");
  });

  it("closes nothing when one of several ids is checked", async () => {
    const root = makeRepo();
    const plain = await claimed(root, [], "Plain");
    const checked = await claimed(root, [`check:${PASS}`], "Checked");
    const r = await runCli(["task", "close", plain.id, checked.id], root);
    expect(r.exitCode).toBe(2);
    expect((await read(root, plain.id))?.status).toBe("in_progress");
  });
});
