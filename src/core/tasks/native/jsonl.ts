/*
 * JSONL files: the committed source of truth for tasks and memories.
 *
 * Record shape follows Beads' `bd export` (snake_case fields, `_type`,
 * labels/dependencies/comments embedded in the issue line) so files stay
 * readable by Beads tooling and imports from Beads are a direct mapping.
 * Format adapted from Beads cmd/bd/export.go, MIT License,
 * Copyright (c) 2025 Beads Contributors. See THIRD_PARTY_NOTICES.md.
 *
 * Lines are sorted by id/key and empty fields are omitted, so a change to one
 * task is a one-line diff and concurrent branches merge cleanly.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type Comment,
  type Dependency,
  type Issue,
  isDepType,
  isIssueType,
  isStatus,
  type Memory,
  TaskError,
} from "./model.js";

type Raw = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

/** Drop undefined, empty strings and empty arrays so lines stay minimal. */
function compact(obj: Raw): Raw {
  const out: Raw = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

export function issueToRecord(i: Issue): Raw {
  return compact({
    _type: "issue",
    id: i.id,
    title: i.title,
    description: i.description,
    design: i.design,
    acceptance_criteria: i.acceptanceCriteria,
    notes: i.notes,
    status: i.status,
    priority: i.priority,
    issue_type: i.issueType,
    assignee: i.assignee,
    created_at: i.createdAt,
    created_by: i.createdBy,
    updated_at: i.updatedAt,
    started_at: i.startedAt,
    closed_at: i.closedAt,
    close_reason: i.closeReason,
    defer_until: i.deferUntil,
    external_ref: i.externalRef,
    labels: [...i.labels].sort(),
    dependencies: [...i.dependencies]
      .sort((a, b) => a.dependsOnId.localeCompare(b.dependsOnId))
      .map((d) =>
        compact({
          issue_id: d.issueId,
          depends_on_id: d.dependsOnId,
          type: d.type,
          created_at: d.createdAt,
          created_by: d.createdBy,
        }),
      ),
    comments: i.comments.map((c) =>
      compact({ id: c.id, author: c.author, text: c.text, created_at: c.createdAt }),
    ),
  });
}

/**
 * Parse one issue record. Strict for baton's own file; `lenient` maps foreign
 * values (Beads statuses/types/dependency kinds baton does not model) to the
 * closest supported value instead of failing.
 */
export function recordToIssue(r: Raw, where: string, lenient = false): Issue {
  const id = str(r.id);
  const title = str(r.title);
  if (!id || !title) throw new TaskError(`${where}: issue needs id and title`, "invalid");

  let status = r.status ?? "open";
  if (!isStatus(status)) {
    if (!lenient) throw new TaskError(`${where}: unknown status ${String(status)}`, "invalid");
    status = status === "hooked" ? "in_progress" : "open"; // pinned, custom -> open
  }
  let issueType = r.issue_type ?? r.type ?? "task";
  if (!isIssueType(issueType)) {
    if (!lenient) throw new TaskError(`${where}: unknown type ${String(issueType)}`, "invalid");
    issueType = issueType === "story" ? "feature" : issueType === "milestone" ? "epic" : "task";
  }
  const priority = typeof r.priority === "number" ? r.priority : 2;
  const now = new Date(0).toISOString();

  const dependencies: Dependency[] = [];
  for (const d of Array.isArray(r.dependencies) ? (r.dependencies as Raw[]) : []) {
    const target = str(d.depends_on_id);
    if (!target) continue;
    const rawType: unknown = d.type ?? "blocks";
    let type: Dependency["type"];
    if (isDepType(rawType)) type = rawType;
    else if (lenient) type = "related";
    else throw new TaskError(`${where}: unknown dependency ${String(rawType)}`, "invalid");
    const dep: Dependency = {
      issueId: id,
      dependsOnId: target,
      type,
      createdAt: str(d.created_at) ?? now,
    };
    const by = str(d.created_by);
    if (by) dep.createdBy = by;
    dependencies.push(dep);
  }

  const comments: Comment[] = [];
  let seq = 0;
  for (const c of Array.isArray(r.comments) ? (r.comments as Raw[]) : []) {
    const text = str(c.text);
    if (!text) continue;
    seq = typeof c.id === "number" ? c.id : seq + 1;
    const comment: Comment = { id: seq, text, createdAt: str(c.created_at) ?? now };
    const author = str(c.author);
    if (author) comment.author = author;
    comments.push(comment);
  }

  const issue: Issue = {
    id,
    title,
    status: status as Issue["status"],
    priority: Math.min(4, Math.max(0, Math.trunc(priority))),
    issueType: issueType as Issue["issueType"],
    createdAt: str(r.created_at) ?? now,
    updatedAt: str(r.updated_at) ?? str(r.created_at) ?? now,
    labels: Array.isArray(r.labels)
      ? r.labels.filter((l): l is string => typeof l === "string")
      : [],
    dependencies,
    comments,
  };
  const optional: [keyof Issue, unknown][] = [
    ["description", r.description],
    ["design", r.design],
    ["acceptanceCriteria", r.acceptance_criteria],
    ["notes", r.notes],
    ["assignee", r.assignee],
    ["createdBy", r.created_by],
    ["startedAt", r.started_at],
    ["closedAt", r.closed_at],
    ["closeReason", r.close_reason],
    ["deferUntil", r.defer_until],
    ["externalRef", r.external_ref],
  ];
  for (const [k, v] of optional) {
    const s = str(v);
    if (s) (issue as unknown as Raw)[k] = s;
  }
  return issue;
}

export function memoryToRecord(m: Memory): Raw {
  return {
    _type: "memory",
    key: m.key,
    value: m.value,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  };
}

export function recordToMemory(r: Raw, where: string): Memory {
  const key = str(r.key);
  const value = str(r.value);
  if (!key || value === undefined)
    throw new TaskError(`${where}: memory needs key and value`, "invalid");
  const now = new Date(0).toISOString();
  return {
    key,
    value,
    createdAt: str(r.created_at) ?? now,
    updatedAt: str(r.updated_at) ?? str(r.created_at) ?? now,
  };
}

/** Parse a JSONL file into raw records; blank lines skipped; bad JSON is an error with a line number. */
export function parseJsonl(text: string, file: string): Raw[] {
  const out: Raw[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let v: unknown;
    try {
      v = JSON.parse(line);
    } catch {
      throw new TaskError(`${file}:${i + 1}: invalid JSON`, "invalid");
    }
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      throw new TaskError(`${file}:${i + 1}: expected a JSON object`, "invalid");
    }
    out.push(v as Raw);
  });
  return out;
}

export function serializeJsonl(records: Raw[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
}

export function readTextOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Write via temp file + rename so readers never see a half-written file.
 * Windows can refuse the rename while another process holds the target open
 * (EPERM/EBUSY), so retry briefly.
 */
export function writeFileAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text, "utf8");
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmp, path);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if ((code !== "EPERM" && code !== "EBUSY") || attempt >= 20) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
}
