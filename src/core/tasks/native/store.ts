import { execFileSync } from "node:child_process";
import { userInfo } from "node:os";
import { basename } from "node:path";
import type { Config } from "../../config.js";
import { ContextPaths, contextPath } from "../../paths.js";
import type { Task } from "../../types.js";
import type { TaskStore } from "../types.js";
import { TaskDb } from "./db.js";
import { defaultPrefix } from "./ids.js";
import type { Issue } from "./model.js";
import { TaskService } from "./service.js";

export const TASKS_FILE = "tasks.jsonl";
export const MEMORIES_FILE = "memories.jsonl";
export const TASKS_DB = "tasks.db";

/**
 * Who is acting: --actor flag, then BATON_ACTOR, then git user.name, then the
 * OS user. Used for created_by, claims and comment authors.
 */
export function resolveActor(root: string, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.BATON_ACTOR?.trim()) return process.env.BATON_ACTOR.trim();
  try {
    const name = execFileSync("git", ["config", "user.name"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (name) return name;
  } catch {
    // not a repo or no git: fall through
  }
  try {
    return userInfo().username || "unknown";
  } catch {
    return "unknown";
  }
}

export function resolvePrefix(root: string, config: Config): string {
  return config.tasks.prefix ?? defaultPrefix(basename(root));
}

export interface OpenOptions {
  actor?: string;
}

/** Open the native store for a project. Caller must close() the returned db. */
export function openTaskService(
  root: string,
  config: Config,
  opts: OpenOptions = {},
): { service: TaskService; db: TaskDb } {
  const db = new TaskDb({
    tasksJsonl: contextPath(root, TASKS_FILE),
    memoriesJsonl: contextPath(root, MEMORIES_FILE),
    dbFile: contextPath(root, ContextPaths.cache, TASKS_DB),
  });
  const service = new TaskService(db, resolvePrefix(root, config), resolveActor(root, opts.actor));
  return { service, db };
}

/** Map a native issue to the packet-level Task (labels spec:<id>, check:<cmd>). */
export function issueToTask(i: Issue): Task {
  const task: Task = {
    id: i.id,
    title: i.title,
    status: i.status,
    priority: i.priority,
    specSections: i.labels.filter((l) => l.startsWith("spec:")).map((l) => l.slice(5)),
    issueType: i.issueType,
  };
  if (i.description) task.description = i.description;
  if (i.assignee) task.assignee = i.assignee;
  if (i.closedAt) task.closedAt = i.closedAt;
  if (i.closeReason) task.closeReason = i.closeReason;
  const check = i.labels.find((l) => l.startsWith("check:"));
  if (check) task.checkCommand = check.slice(6);
  return task;
}

/** TaskStore adapter used by mission / handoff / verify. */
export class NativeTaskStore implements TaskStore {
  readonly name = "native" as const;

  constructor(
    private readonly root: string,
    private readonly config: Config,
  ) {}

  private with<T>(fn: (s: TaskService) => T): T {
    const { service, db } = openTaskService(this.root, this.config);
    try {
      return fn(service);
    } finally {
      db.close();
    }
  }

  async available(): Promise<boolean> {
    return true;
  }

  async ready(limit: number): Promise<Task[]> {
    return this.with((s) => s.ready({ limit }).map(issueToTask));
  }

  async get(id: string): Promise<Task | null> {
    return this.with((s) => {
      const i = s.get(id);
      return i ? issueToTask(i) : null;
    });
  }

  async close(id: string, reason: string): Promise<void> {
    this.with((s) => s.close(id, reason));
  }
}
