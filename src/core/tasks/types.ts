import type { Task } from "../types.js";

/**
 * Adapter over a structured task store. Default is baton's native store
 * (.context/tasks.jsonl, ported from Beads; ADR 0009); Beads itself and
 * Claude Code Tasks are optional backends. Never a markdown TODO list.
 */
export interface TaskStore {
  readonly name: "native" | "beads" | "claude-tasks" | "none";
  /** Cheap probe: is the backend installed and initialised in this repo? */
  available(): Promise<boolean>;
  /** Unblocked work, highest priority first. */
  ready(limit: number): Promise<Task[]>;
  get(id: string): Promise<Task | null>;
  close(id: string, reason: string): Promise<void>;
}
