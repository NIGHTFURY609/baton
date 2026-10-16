/*
 * Task data model for baton's native task store.
 *
 * Portions adapted from Beads (https://github.com/gastownhall/beads),
 * internal/types/types.go. MIT License, Copyright (c) 2025 Beads Contributors.
 * See THIRD_PARTY_NOTICES.md. Ported subset only: no wisps, molecules, gates,
 * pinned/hooked statuses, leases or custom statuses.
 */

export const STATUSES = ["open", "in_progress", "blocked", "deferred", "closed"] as const;
export type Status = (typeof STATUSES)[number];

export const ISSUE_TYPES = [
  "task",
  "bug",
  "feature",
  "epic",
  "chore",
  "spike",
  "decision",
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

/**
 * Dependency types. `blocks` and `parent-child` affect readiness and are
 * checked for cycles ("scheduling edges", as in Beads); the rest are links.
 * An edge reads: issueId depends on dependsOnId. For parent-child, issueId is
 * the child and dependsOnId the parent.
 */
export const DEP_TYPES = ["blocks", "parent-child", "related", "discovered-from"] as const;
export type DepType = (typeof DEP_TYPES)[number];
export const SCHEDULING_DEP_TYPES: readonly DepType[] = ["blocks", "parent-child"];

export const MIN_PRIORITY = 0; // P0 = most urgent
export const MAX_PRIORITY = 4;
export const DEFAULT_PRIORITY = 2;
export const MAX_TITLE_LENGTH = 500;
/** Max dots in a hierarchical id (bt-a3f.1.2.3), as in Beads. */
export const MAX_CHILD_DEPTH = 3;

export interface Dependency {
  issueId: string;
  dependsOnId: string;
  type: DepType;
  createdAt: string;
  createdBy?: string;
}

export interface Comment {
  id: number;
  author?: string;
  text: string;
  createdAt: string;
}

export interface Issue {
  id: string;
  title: string;
  description?: string;
  design?: string;
  acceptanceCriteria?: string;
  notes?: string;
  status: Status;
  priority: number;
  issueType: IssueType;
  assignee?: string;
  createdAt: string;
  createdBy?: string;
  updatedAt: string;
  startedAt?: string;
  closedAt?: string;
  closeReason?: string;
  deferUntil?: string;
  externalRef?: string;
  labels: string[];
  /** Outgoing edges only (this issue depends on ...). */
  dependencies: Dependency[];
  comments: Comment[];
}

export interface Memory {
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export class TaskError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "invalid"
      | "cycle"
      | "conflict"
      | "already_claimed"
      | "not_claimable"
      | "has_open_children"
      | "has_open_blockers",
  ) {
    super(message);
    this.name = "TaskError";
  }
}

export function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}
export function isIssueType(v: unknown): v is IssueType {
  return typeof v === "string" && (ISSUE_TYPES as readonly string[]).includes(v);
}
export function isDepType(v: unknown): v is DepType {
  return typeof v === "string" && (DEP_TYPES as readonly string[]).includes(v);
}

export function validateTitle(title: string): string {
  const t = title.trim();
  if (!t) throw new TaskError("title is required", "invalid");
  if (t.length > MAX_TITLE_LENGTH) {
    throw new TaskError(`title is longer than ${MAX_TITLE_LENGTH} characters`, "invalid");
  }
  return t;
}

export function validatePriority(p: number): number {
  if (!Number.isInteger(p) || p < MIN_PRIORITY || p > MAX_PRIORITY) {
    throw new TaskError(`priority must be an integer ${MIN_PRIORITY}-${MAX_PRIORITY}`, "invalid");
  }
  return p;
}

/** Accepts "1", "P1" or "p1". */
export function parsePriority(input: string): number {
  return validatePriority(Number(input.replace(/^p/i, "")));
}

/**
 * Labels may contain spaces (`check:npm test`) but not newlines. Commas are
 * allowed here; the CLI splits --labels on commas, so use --check for a
 * command that contains one.
 */
export function validateLabel(label: string): string {
  const l = label.trim();
  if (!l || /[\r\n]/.test(l) || l.length > 200)
    throw new TaskError(`invalid label "${label}"`, "invalid");
  return l;
}
