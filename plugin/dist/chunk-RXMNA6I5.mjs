#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  matchesAny
} from "./chunk-POYJG6UX.mjs";
import {
  changedFilesSince,
  isGitRepo,
  porcelainPath,
  statusLines
} from "./chunk-MEHZNG47.mjs";
import {
  BatonError,
  notImplemented
} from "./chunk-YXJRO53B.mjs";
import {
  openTaskService
} from "./chunk-M47P2UXW.mjs";

// src/core/verify.ts
import { spawn, spawnSync } from "child_process";
var VERIFY_IGNORED_GLOBS = [
  ".context/tasks.jsonl",
  ".context/memories.jsonl",
  ".context/STATE.md",
  ".context/.cache/**"
];
var DEFAULT_TAIL_CHARS = 4e3;
function checkCommands(labels) {
  return labels.filter((l) => l.startsWith("check:")).map((l) => l.slice("check:".length).trim()).filter((c) => c !== "");
}
async function changesSince(root, sinceIso) {
  const committed = (await changedFilesSince(root, sinceIso)).flat();
  const uncommitted = (await statusLines(root, { untrackedAll: true })).map(porcelainPath);
  const paths = new Set(
    [...committed, ...uncommitted].filter((p) => !matchesAny(p, VERIFY_IGNORED_GLOBS))
  );
  return [...paths].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}
var KILL_BACKSTOP_MS = 2e3;
function killTree(pid, kill) {
  if (process.platform === "win32") {
    if (pid !== void 0) {
      try {
        spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
      } catch {
      }
    }
    kill();
    return;
  }
  try {
    if (pid === void 0) throw new Error("no pid");
    process.kill(-pid, "SIGKILL");
  } catch {
    kill();
  }
}
function runCheck(command, cwd, opts = {}) {
  const tailChars = opts.tailChars ?? DEFAULT_TAIL_CHARS;
  const started = Date.now();
  return new Promise((resolve) => {
    let tail = "";
    let timedOut = false;
    let exitCode = null;
    let settled = false;
    let backstopFired = false;
    let timer;
    let backstop;
    const finish = (code, message) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (backstop) clearTimeout(backstop);
      resolve({
        command,
        exitCode: code,
        timedOut,
        ...timedOut ? { killedBy: backstopFired ? "backstop" : "tree" } : {},
        tail: message ?? tail,
        ms: Date.now() - started
      });
    };
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      env: process.env,
      // A process group of its own lets the timeout kill the whole tree on POSIX.
      // Without a timeout the check stays in the terminal's group, so Ctrl+C reaches it.
      detached: process.platform !== "win32" && opts.timeoutMs !== void 0
    });
    const onData = (stream) => (chunk) => {
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
    if (opts.timeoutMs !== void 0) {
      timer = setTimeout(() => {
        timedOut = true;
        killTree(child.pid, () => child.kill("SIGKILL"));
        backstop = setTimeout(() => {
          backstopFired = true;
          child.stdout.destroy();
          child.stderr.destroy();
          finish(exitCode);
        }, KILL_BACKSTOP_MS);
      }, opts.timeoutMs);
    }
  });
}
async function verifyTask(root, config, id, opts) {
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
      `task ${id} has no check: label; add one with baton task update ${id} --add-labels "check:<command>"`
    );
  }
  let changes = [];
  if (opts.requireDiff) {
    if (!await isGitRepo(root)) {
      throw new BatonError(
        "verify needs a git repository for its diff rule; pass --no-diff to skip it"
      );
    }
    const since = issue.startedAt ?? issue.createdAt;
    changes = await changesSince(root, since);
    if (changes.length === 0) return { status: "no-diff", id, since };
  }
  const runs = [];
  const deadline = opts.totalTimeoutMs !== void 0 ? Date.now() + opts.totalTimeoutMs : void 0;
  for (const command of checks) {
    const remaining = deadline !== void 0 ? deadline - Date.now() : void 0;
    if (remaining !== void 0 && remaining <= 0) {
      const run2 = { command, exitCode: null, timedOut: true, tail: "", ms: 0 };
      return { status: "failed", id, run: run2, passed: runs };
    }
    opts.onCheckStart?.(command);
    const limit = remaining !== void 0 && opts.timeoutMs !== void 0 ? Math.min(opts.timeoutMs, remaining) : remaining ?? opts.timeoutMs;
    const run = await runCheck(command, root, {
      ...limit !== void 0 ? { timeoutMs: limit } : {},
      ...opts.onOutput ? { onOutput: opts.onOutput } : {}
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
async function activeTask(root, config, actor) {
  if (config.tasks.backend !== "native") return null;
  const { service, db } = openTaskService(root, config, { actor });
  try {
    const candidates = service.list({ status: ["in_progress"], assignee: actor }).filter((i) => i.issueType !== "epic" && checkCommands(i.labels).length > 0);
    const stamp = (i) => i.startedAt ?? i.updatedAt;
    candidates.sort(
      (a, b) => stamp(a) !== stamp(b) ? stamp(a) < stamp(b) ? 1 : -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    );
    return candidates[0] ?? null;
  } finally {
    db.close();
  }
}

export {
  VERIFY_IGNORED_GLOBS,
  DEFAULT_TAIL_CHARS,
  checkCommands,
  changesSince,
  runCheck,
  verifyTask,
  activeTask
};
//# sourceMappingURL=chunk-RXMNA6I5.mjs.map