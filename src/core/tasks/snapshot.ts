import type { Config } from "../config.js";
import type { Task } from "../types.js";
import { BeadsStore } from "./beads.js";
import { issueToTask, openTaskService } from "./native/store.js";

/** Read-only view of the task store, shared by the mission packet and the handoff. */
export interface TaskSnapshot {
  backend: Config["tasks"]["backend"];
  /** Status in_progress, epics excluded, list() order. */
  inProgress: Task[];
  /** Epics excluded, at most readyLimit. */
  ready: Task[];
  blocked: { task: Task; blockedBy: string[] }[];
  /** At most closedLimit, newest closedAt first, ties by id ascending. */
  recentlyClosed: Task[];
  /** Issue type epic, status open or in_progress. */
  openEpics: Task[];
  /** Key order. */
  memories: { key: string; value: string }[];
}

export interface SnapshotOptions {
  readyLimit: number;
  closedLimit: number;
}

export function emptySnapshot(backend: Config["tasks"]["backend"]): TaskSnapshot {
  return {
    backend,
    inProgress: [],
    ready: [],
    blocked: [],
    recentlyClosed: [],
    openEpics: [],
    memories: [],
  };
}

/** Ready work is fetched wide, then epics are dropped and the list cut to the caller's limit. */
const READY_FETCH_LIMIT = 200;

function byClosedDesc(a: Task, b: Task): number {
  const ac = a.closedAt ?? "";
  const bc = b.closedAt ?? "";
  if (ac !== bc) return ac < bc ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export async function readTaskSnapshot(
  root: string,
  config: Config,
  opts: SnapshotOptions,
): Promise<TaskSnapshot> {
  const backend = config.tasks.backend;
  const snap = emptySnapshot(backend);

  if (backend === "beads") {
    const store = new BeadsStore(root);
    if (await store.available()) snap.ready = await store.ready(opts.readyLimit);
    return snap;
  }
  if (backend !== "native") return snap;

  // An explicit actor skips the `git config user.name` process (~50 ms on Windows).
  const { service, db } = openTaskService(root, config, { actor: "baton-read" });
  try {
    snap.inProgress = service
      .list({ status: ["in_progress"] })
      .filter((i) => i.issueType !== "epic")
      .map(issueToTask);
    snap.ready = service
      .ready({ limit: READY_FETCH_LIMIT })
      .filter((i) => i.issueType !== "epic")
      .slice(0, opts.readyLimit)
      .map(issueToTask);
    snap.blocked = service
      .blocked()
      .map((b) => ({ task: issueToTask(b.issue), blockedBy: b.blockedBy }));
    if (opts.closedLimit > 0) {
      snap.recentlyClosed = service
        .list({ status: ["closed"] })
        .map(issueToTask)
        .sort(byClosedDesc)
        .slice(0, opts.closedLimit);
    }
    snap.openEpics = service
      .list({ status: ["open", "in_progress"], issueType: "epic" })
      .map(issueToTask);
    snap.memories = service.memories().map((m) => ({ key: m.key, value: m.value }));
  } finally {
    db.close();
  }
  return snap;
}

export async function getTask(root: string, config: Config, id: string): Promise<Task | null> {
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
