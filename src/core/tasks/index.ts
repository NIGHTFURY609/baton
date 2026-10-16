import type { Config } from "../config.js";
import { notImplemented } from "../errors.js";
import { BeadsStore } from "./beads.js";
import { NativeTaskStore } from "./native/store.js";
import type { TaskStore } from "./types.js";

export type { TaskStore } from "./types.js";

/** Used when no backend is configured or found: the packet simply has no task block. */
export class NoTaskStore implements TaskStore {
  readonly name = "none" as const;
  async available() {
    return true;
  }
  async ready() {
    return [];
  }
  async get() {
    return null;
  }
  async close(): Promise<void> {
    throw new Error("No task backend configured. Set tasks.backend in .context/config.yaml.");
  }
}

/**
 * Pick the backend (ADR 0009). `native` (default) is baton's own store in
 * .context/tasks.jsonl. `beads` shells out to an installed `bd`. Claude Code
 * Tasks use an undocumented format, so that adapter is not built yet.
 */
export async function resolveTaskStore(config: Config, root: string): Promise<TaskStore> {
  switch (config.tasks.backend) {
    case "none":
      return new NoTaskStore();
    case "beads":
      return new BeadsStore(root);
    case "claude-tasks":
      return notImplemented("claude-tasks backend", "later (format undocumented)");
    default:
      return new NativeTaskStore(root, config);
  }
}
