import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it } from "vitest";
import { runHook } from "../src/hooks/dispatch.js";
import { blockReason } from "../src/hooks/stop.js";
import { CONTEXT_FIXTURE, makeRepo, makeTempDir, runGit, withService } from "./helpers/repo.js";
import { isolateClaudeConfig } from "./helpers/transcript.js";

const stdin = (obj: unknown) => Readable.from([JSON.stringify(obj)]);

const PASS = 'node -e "process.exit(0)"';
const FAIL = 'node -e "process.exit(1)"';

const ON_CONFIG = "version: 1\ntasks:\n  prefix: bt\nverify:\n  onStop: true\n";

function onStopRepo(): string {
  return makeRepo({ ...CONTEXT_FIXTURE, ".context/config.yaml": ON_CONFIG });
}

async function claim(root: string, check: string, actor = "tester", title = "Work") {
  return withService(root, actor, (s) => {
    const t = s.create({ title, labels: [`check:${check}`] });
    s.claim(t.id);
    return t;
  });
}

function change(root: string): void {
  writeFileSync(join(root, "src/auth/login.ts"), "export const login = 2;\n");
}

async function run(root: string, extra: Record<string, unknown> = {}) {
  return runHook(
    "stop",
    "claude",
    stdin({
      hook_event_name: "Stop",
      cwd: root,
      session_id: "s1",
      stop_hook_active: false,
      last_assistant_message: "done",
      ...extra,
    }),
  );
}

const NOTHING = { stdout: "", stderr: "", exitCode: 0 };

describe("stop hook", () => {
  beforeEach(() => {
    isolateClaudeConfig();
    process.env.BATON_ACTOR = "tester";
  });

  it("blocks when the active task's check fails", async () => {
    const root = onStopRepo();
    const t = await claim(root, FAIL);
    change(root);
    const out = await run(root);
    expect(out.exitCode).toBe(0);
    const body = JSON.parse(out.stdout) as { decision: string; reason: string };
    expect(body.decision).toBe("block");
    expect(
      body.reason.startsWith(`Task ${t.id} is in progress and its check failed (exit 1): ${FAIL}`),
    ).toBe(true);
    expect(body.reason.endsWith(`baton verify ${t.id} closes it once the check passes.`)).toBe(
      true,
    );
    expect((await withService(root, "tester", (s) => s.get(t.id)))?.status).toBe("in_progress");
  });

  it("does nothing when stop_hook_active is set", async () => {
    const root = onStopRepo();
    await claim(root, FAIL);
    change(root);
    expect(await run(root, { stop_hook_active: true })).toEqual(NOTHING);
  });

  it("does nothing when verify.onStop is absent", async () => {
    const root = makeRepo();
    await claim(root, FAIL);
    change(root);
    expect(await run(root)).toEqual(NOTHING);
  });

  it("does nothing when the check passes, and never closes the task", async () => {
    const root = onStopRepo();
    const t = await claim(root, PASS);
    change(root);
    expect(await run(root)).toEqual(NOTHING);
    expect((await withService(root, "tester", (s) => s.get(t.id)))?.status).toBe("in_progress");
  });

  it("does nothing when nothing changed since the claim", async () => {
    const root = onStopRepo();
    await claim(root, FAIL);
    expect(await run(root)).toEqual(NOTHING);
  });

  it("does nothing when no task is in progress for the actor", async () => {
    const root = onStopRepo();
    await claim(root, FAIL, "alice");
    change(root);
    expect(await run(root)).toEqual(NOTHING);
  });

  it("does nothing without .context/", async () => {
    const dir = makeTempDir();
    runGit(dir, "init", "-q");
    expect(await run(dir)).toEqual(NOTHING);
  });

  it("checks the most recently started task", async () => {
    const root = onStopRepo();
    await claim(root, PASS, "tester", "A");
    await new Promise((r) => setTimeout(r, 5));
    const b = await claim(root, FAIL, "tester", "B");
    change(root);
    const body = JSON.parse((await run(root)).stdout) as { reason: string };
    expect(body.reason).toContain(`Task ${b.id} `);
  });
});

describe("blockReason", () => {
  it("names a timeout and an empty tail", () => {
    const text = blockReason("bt-1", { command: "slow", exitCode: null, timedOut: true, tail: "" });
    expect(text).toContain("(timed out after 540 s)");
    expect(text).toContain("(no output)");
  });
});

describe("hooks.json", () => {
  it("wires Stop", () => {
    const json = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "plugin", "hooks", "hooks.json"), "utf8"),
    ) as { hooks: { Stop: { matcher?: string; hooks: { args: string[]; timeout: number }[] }[] } };
    const entry = json.hooks.Stop[0];
    expect(entry?.matcher).toBeUndefined();
    expect(entry?.hooks[0]?.args.slice(-2)).toEqual(["hook", "stop"]);
    expect(entry?.hooks[0]?.timeout).toBe(600);
  });
});
