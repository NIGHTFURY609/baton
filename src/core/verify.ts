/*
 * The core behind `baton verify` and the opt-in Stop gate: run a task's check:
 * commands, apply the diff-since-claim rule, enforce the timeout (ADR 0019).
 */
import { spawn, spawnSync } from "node:child_process";
import type { Config } from "./config.js";
import { BatonError, notImplemented } from "./errors.js";
import { changedFilesSince, isGitRepo, porcelainPath, statusLines } from "./git.js";
import { matchesAny } from "./glob.js";
import type { Issue } from "./tasks/native/model.js";
import { openTaskService } from "./tasks/native/store.js";

/** Task-store and generated files that change as a side effect of working, never as the work itself. */
export const VERIFY_IGNORED_GLOBS: readonly string[] = [
  ".context/tasks.jsonl",
  ".context/memories.jsonl",
  ".context/STATE.md",
  ".context/.cache/**",
];

export const DEFAULT_TAIL_CHARS = 4000;

/** The commands of the `check:` labels, trimmed, in label order. Empty ones are dropped. */
export function checkCommands(labels: readonly string[]): string[] {
  return labels
    .filter((l) => l.startsWith("check:"))
    .map((l) => l.slice("check:".length).trim())
    .filter((c) => c !== "");
}

/** Files committed since `sinceIso` plus uncommitted ones, minus task-store churn. Sorted, unique. */
export async function changesSince(root: string, sinceIso: string): Promise<string[]> {
  const committed = (await changedFilesSince(root, sinceIso)).flat();
  const uncommitted = (await statusLines(root, { untrackedAll: true })).map(porcelainPath);
  const paths = new Set(
    [...committed, ...uncommitted].filter((p) => !matchesAny(p, VERIFY_IGNORED_GLOBS)),
  );
  return [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export interface CheckRun {
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  tail: string;
  ms: number;
}

export interface RunCheckOptions {
  timeoutMs?: number;
  tailChars?: number;
  onOutput?: (chunk: string, stream: "stdout" | "stderr") => void;
}

/** How long to wait for `close` after a kill before giving up on pipes an orphan still holds open. */
const KILL_BACKSTOP_MS = 2000;

function killTree(pid: number | undefined, kill: () => void): void {
  if (process.platform === "win32") {
    // Before child.kill(): once cmd.exe is dead its children are orphaned and
    // taskkill /T can no longer find the tree from the dead PID.
    if (pid !== undefined) {
      try {
        spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
      } catch {
        // best effort
      }
    }
    kill();
    return;
  }
  try {
    if (pid === undefined) throw new Error("no pid");
    process.kill(-pid, "SIGKILL"); // the process group; the child was spawned detached
  } catch {
    kill();
  }
}

/** Run one check command through the shell. Never rejects. */
export function runCheck(
  command: string,
  cwd: string,
  opts: RunCheckOptions = {},
): Promise<CheckRun> {
  const tailChars = opts.tailChars ?? DEFAULT_TAIL_CHARS;
  const started = Date.now();
  return new Promise((resolve) => {
    let tail = "";
    let timedOut = false;
    let exitCode: number | null = null;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let backstop: NodeJS.Timeout | undefined;

    const finish = (code: number | null, message?: string): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (backstop) clearTimeout(backstop);
      resolve({
        command,
        exitCode: code,
        timedOut,
        tail: message ?? tail,
        ms: Date.now() - started,
      });
    };

    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      env: process.env,
      // A process group of its own lets the timeout kill the whole tree on POSIX.
      // Without a timeout the check stays in the terminal's group, so Ctrl+C reaches it.
      detached: process.platform !== "win32" && opts.timeoutMs !== undefined,
    });

    const onData =
      (stream: "stdout" | "stderr") =>
      (chunk: string): void => {
        opts.onOutput?.(chunk, stream);
        tail = (tail + chunk).slice(-tailChars);
      };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", onData("stdout"));
    child.stderr.on("data", onData("stderr"));

    child.on("error", (error) => finish(null, error.message));
    child.on("exit", (code) => {
      exitCode = code;
    });
    child.on("close", (code) => finish(code ?? exitCode));

    if (opts.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true;
        killTree(child.pid, () => child.kill("SIGKILL"));
        backstop = setTimeout(() => {
          child.stdout.destroy();
          child.stderr.destroy();
          finish(exitCode);
        }, KILL_BACKSTOP_MS);
      }, opts.timeoutMs);
    }
  });
}

export interface VerifyOptions {
  requireDiff: boolean;
  close: boolean;
  timeoutMs?: number;
  onOutput?: RunCheckOptions["onOutput"];
  onCheckStart?: (command: string) => void;
}

export type VerifyOutcome =
  | { status: "already-closed"; id: string }
  | { status: "no-diff"; id: string; since: string }
  | { status: "failed"; id: string; run: CheckRun; passed: CheckRun[] }
  | { status: "passed"; id: string; runs: CheckRun[]; closed: boolean; changes: string[] };

/**
 * Run every check: label of task `id`. The task closes only when all pass and,
 * unless the diff rule is off, something changed since it was claimed.
 */
export async function verifyTask(
  root: string,
  config: Config,
  id: string,
  opts: VerifyOptions,
): Promise<VerifyOutcome> {
  if (config.tasks.backend !== "native") {
    notImplemented(`verify for the ${config.tasks.backend} task backend`, "a later phase");
  }
  const issue = (() => {
    const { service, db } = openTaskService(root, config);
    try {
      return service.get(id);
    } finally {
      db.close();
    }
  })();
  if (issue === null) throw new BatonError(`no task ${id}`);
  if (issue.status === "closed") return { status: "already-closed", id };

  const checks = checkCommands(issue.labels);
  if (checks.length === 0) {
    throw new BatonError(
      `task ${id} has no check: label; add one with baton task update ${id} --add-labels "check:<command>"`,
    );
  }

  let changes: string[] = [];
  if (opts.requireDiff) {
    if (!(await isGitRepo(root))) {
      throw new BatonError(
        "verify needs a git repository for its diff rule; pass --no-diff to skip it",
      );
    }
    const since = issue.startedAt ?? issue.createdAt;
    changes = await changesSince(root, since);
    if (changes.length === 0) return { status: "no-diff", id, since };
  }

  const runs: CheckRun[] = [];
  for (const command of checks) {
    opts.onCheckStart?.(command);
    const run = await runCheck(command, root, {
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
      ...(opts.onOutput ? { onOutput: opts.onOutput } : {}),
    });
    if (run.exitCode !== 0 || run.timedOut) return { status: "failed", id, run, passed: runs };
    runs.push(run);
  }

  if (opts.close) {
    const { service, db } = openTaskService(root, config);
    try {
      service.close(id, `verified: ${checks.join("; ")}`);
    } finally {
      db.close();
    }
  }
  return { status: "passed", id, runs, closed: opts.close, changes };
}

/**
 * The checked task the actor is working on: in progress, assigned to them, not an
 * epic, with a check: label. The most recently started wins. Null for other backends.
 */
export async function activeTask(
  root: string,
  config: Config,
  actor: string,
): Promise<Issue | null> {
  if (config.tasks.backend !== "native") return null;
  const { service, db } = openTaskService(root, config, { actor });
  try {
    const candidates = service
      .list({ status: ["in_progress"], assignee: actor })
      .filter((i) => i.issueType !== "epic" && checkCommands(i.labels).length > 0);
    const stamp = (i: Issue): string => i.startedAt ?? i.updatedAt;
    candidates.sort((a, b) =>
      stamp(a) !== stamp(b)
        ? stamp(a) < stamp(b)
          ? 1
          : -1
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
    );
    return candidates[0] ?? null;
  } finally {
    db.close();
  }
}
