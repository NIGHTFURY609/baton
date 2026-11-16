#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  notImplemented
} from "./chunk-YXJRO53B.mjs";
import {
  issueToTask,
  openTaskService
} from "./chunk-M47P2UXW.mjs";

// src/core/tasks/beads.ts
import { execFile } from "child_process";
import { promisify } from "util";
var run = promisify(execFile);
var STATUSES = /* @__PURE__ */ new Set(["open", "in_progress", "blocked", "deferred", "closed"]);
function issueToTask2(raw) {
  const id = raw.id;
  const title = raw.title;
  if (typeof id !== "string" || typeof title !== "string") return null;
  const status = STATUSES.has(raw.status) ? raw.status : "open";
  const labels = Array.isArray(raw.labels) ? raw.labels.filter((l) => typeof l === "string") : [];
  const task = {
    id,
    title,
    status,
    specSections: labels.filter((l) => l.startsWith("spec:")).map((l) => l.slice(5))
  };
  if (typeof raw.priority === "number") task.priority = raw.priority;
  if (typeof raw.description === "string" && raw.description) task.description = raw.description;
  const check = labels.find((l) => l.startsWith("check:"));
  if (check) task.checkCommand = check.slice(6);
  return task;
}
function parseReadyJson(stdout) {
  const data = JSON.parse(stdout);
  const list = Array.isArray(data) ? data : Array.isArray(data?.issues) ? data.issues : [];
  return list.filter((x) => typeof x === "object" && x !== null).map(issueToTask2).filter((t) => t !== null);
}
var BeadsStore = class {
  constructor(cwd) {
    this.cwd = cwd;
  }
  cwd;
  name = "beads";
  async available() {
    try {
      await run("bd", ["--version"], { cwd: this.cwd });
      return true;
    } catch {
      return false;
    }
  }
  async ready(limit) {
    const { stdout } = await run("bd", ["ready", "--json"], { cwd: this.cwd });
    return parseReadyJson(stdout).slice(0, limit);
  }
  async get(_id) {
    return notImplemented("BeadsStore.get", "Phase 1 (MVP)");
  }
  async close(_id, _reason) {
    notImplemented("BeadsStore.close", "Phase 2 (Gates)");
  }
};

// src/core/tasks/snapshot.ts
function emptySnapshot(backend) {
  return {
    backend,
    inProgress: [],
    ready: [],
    blocked: [],
    recentlyClosed: [],
    openEpics: [],
    memories: []
  };
}
var READY_FETCH_LIMIT = 200;
function byClosedDesc(a, b) {
  const ac = a.closedAt ?? "";
  const bc = b.closedAt ?? "";
  if (ac !== bc) return ac < bc ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
async function readTaskSnapshot(root, config, opts) {
  const backend = config.tasks.backend;
  const snap = emptySnapshot(backend);
  if (backend === "beads") {
    const store = new BeadsStore(root);
    if (await store.available()) snap.ready = await store.ready(opts.readyLimit);
    return snap;
  }
  if (backend !== "native") return snap;
  const { service, db } = openTaskService(root, config, { actor: "baton-read" });
  try {
    snap.inProgress = service.list({ status: ["in_progress"] }).filter((i) => i.issueType !== "epic").map(issueToTask);
    snap.ready = service.ready({ limit: READY_FETCH_LIMIT }).filter((i) => i.issueType !== "epic").slice(0, opts.readyLimit).map(issueToTask);
    snap.blocked = service.blocked().map((b) => ({ task: issueToTask(b.issue), blockedBy: b.blockedBy }));
    if (opts.closedLimit > 0) {
      snap.recentlyClosed = service.list({ status: ["closed"] }).map(issueToTask).sort(byClosedDesc).slice(0, opts.closedLimit);
    }
    snap.openEpics = service.list({ status: ["open", "in_progress"], issueType: "epic" }).map(issueToTask);
    snap.memories = service.memories().map((m) => ({ key: m.key, value: m.value }));
  } finally {
    db.close();
  }
  return snap;
}
async function getTask(root, config, id) {
  const backend = config.tasks.backend;
  if (backend === "native") {
    const { service, db } = openTaskService(root, config, { actor: "baton-read" });
    try {
      const issue = service.get(id);
      return issue ? issueToTask(issue) : null;
    } finally {
      db.close();
    }
  }
  if (backend === "beads") return new BeadsStore(root).get(id);
  return null;
}

export {
  readTaskSnapshot,
  getTask
};
//# sourceMappingURL=chunk-6V7F4CRM.mjs.map