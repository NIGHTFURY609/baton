import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { notImplemented } from "../errors.js";
import type { Task } from "../types.js";
import type { TaskStore } from "./types.js";

const run = promisify(execFile);

const STATUSES = new Set<Task["status"]>(["open", "in_progress", "blocked", "deferred", "closed"]);

/**
 * Map one issue from `bd ... --json` to a Task. The exact JSON shape is not
 * fully documented (some versions emit `type`, others `issue_type`), so this
 * accepts what it can and ignores the rest. Spec links and check commands
 * ride on labels: `spec:<section-id>` and `check:<command>`.
 */
export function issueToTask(raw: Record<string, unknown>): Task | null {
  const id = raw.id;
  const title = raw.title;
  if (typeof id !== "string" || typeof title !== "string") return null;
  const status = STATUSES.has(raw.status as Task["status"])
    ? (raw.status as Task["status"])
    : "open";
  const labels = Array.isArray(raw.labels)
    ? raw.labels.filter((l): l is string => typeof l === "string")
    : [];
  const task: Task = {
    id,
    title,
    status,
    specSections: labels.filter((l) => l.startsWith("spec:")).map((l) => l.slice(5)),
  };
  if (typeof raw.priority === "number") task.priority = raw.priority;
  if (typeof raw.description === "string" && raw.description) task.description = raw.description;
  const check = labels.find((l) => l.startsWith("check:"));
  if (check) task.checkCommand = check.slice(6);
  return task;
}

export function parseReadyJson(stdout: string): Task[] {
  const data = JSON.parse(stdout) as unknown;
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { issues?: unknown })?.issues)
      ? (data as { issues: unknown[] }).issues
      : [];
  return list
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map(issueToTask)
    .filter((t): t is Task => t !== null);
}

export class BeadsStore implements TaskStore {
  readonly name = "beads" as const;

  constructor(private readonly cwd: string) {}

  async available(): Promise<boolean> {
    try {
      await run("bd", ["--version"], { cwd: this.cwd });
      return true;
    } catch {
      return false;
    }
  }

  async ready(limit: number): Promise<Task[]> {
    const { stdout } = await run("bd", ["ready", "--json"], { cwd: this.cwd });
    return parseReadyJson(stdout).slice(0, limit);
  }

  async get(_id: string): Promise<Task | null> {
    return notImplemented("BeadsStore.get", "Phase 1 (MVP)");
  }

  async close(_id: string, _reason: string): Promise<void> {
    notImplemented("BeadsStore.close", "Phase 2 (Gates)");
  }
}
