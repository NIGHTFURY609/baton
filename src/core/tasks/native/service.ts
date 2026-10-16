/*
 * Task operations: create, update, claim, close, reopen, dependencies,
 * comments, delete, ready/blocked queries, memories and Beads import.
 *
 * Semantics ported from Beads (https://github.com/gastownhall/beads):
 * - ready rule: migrations 0017/0044 `ready_issues` view + defer filter in
 *   internal/storage/sqlbuild/ready.go; sort policies from the same file
 * - claim: internal/storage/issueops/claim.go (claimable states, idempotent
 *   re-claim by the same actor, conflict errors)
 * - close: internal/storage/issueops/close.go (refuse with open children or
 *   live direct blockers unless forced)
 * - cycle and hierarchy checks: internal/storage/issueops/dependencies.go
 * - memory keys: internal/memoryapi/memoryapi.go (DeriveKey)
 * MIT License, Copyright (c) 2025 Beads Contributors. See THIRD_PARTY_NOTICES.md.
 *
 * Simplifications versus Beads: no leases, wisps, molecules, gates, pinned
 * issues, custom statuses or the persisted is_blocked flag; readiness is
 * computed per query with a recursive CTE (Beads' pre-0046 rule).
 */
import type { SQLInputValue } from "node:sqlite";
import { rowToMemory, type TaskDb } from "./db.js";
import { childId, generateUniqueId, nextChildNumber, nowNs } from "./ids.js";
import { parseJsonl, recordToIssue, recordToMemory } from "./jsonl.js";
import {
  DEFAULT_PRIORITY,
  type DepType,
  type Issue,
  type IssueType,
  type Memory,
  type Status,
  TaskError,
  validateLabel,
  validatePriority,
  validateTitle,
} from "./model.js";

export type SortPolicy = "priority" | "oldest" | "hybrid";

export interface CreateInput {
  title: string;
  description?: string;
  design?: string;
  acceptanceCriteria?: string;
  notes?: string;
  priority?: number;
  issueType?: IssueType;
  labels?: string[];
  parent?: string;
  /** Extra dependencies of the new issue: [type, dependsOnId]. */
  deps?: [DepType, string][];
  assignee?: string;
  deferUntil?: string;
  externalRef?: string;
}

export interface UpdateInput {
  title?: string;
  description?: string;
  design?: string;
  acceptanceCriteria?: string;
  notes?: string;
  priority?: number;
  issueType?: IssueType;
  status?: Exclude<Status, "closed">;
  assignee?: string | null;
  deferUntil?: string | null;
  addLabels?: string[];
  removeLabels?: string[];
}

export interface ListFilter {
  status?: Status[];
  labels?: string[];
  parent?: string;
  assignee?: string;
  issueType?: IssueType;
  limit?: number;
}

export interface ReadyFilter {
  limit?: number;
  sort?: SortPolicy;
  labels?: string[];
  assignee?: string;
  unassigned?: boolean;
  parent?: string;
  includeDeferred?: boolean;
  now?: Date;
}

export interface BlockedIssue {
  issue: Issue;
  blockedBy: string[];
}

const HYBRID_RECENT_MS = 48 * 60 * 60 * 1000;

/** Issues blocked directly by an open `blocks` target, or inheriting a blocked parent. */
const BLOCKED_CTE = `
WITH RECURSIVE
blocked_directly AS (
  SELECT DISTINCT d.issue_id FROM dependencies d
  JOIN issues b ON b.id = d.depends_on_id
  WHERE d.type = 'blocks' AND b.status != 'closed'
),
blocked_transitively(issue_id, depth) AS (
  SELECT issue_id, 0 FROM blocked_directly
  UNION
  SELECT d.issue_id, bt.depth + 1 FROM blocked_transitively bt
  JOIN dependencies d ON d.depends_on_id = bt.issue_id
  WHERE d.type = 'parent-child' AND bt.depth < 50
)`;

const DESCENDANTS_CTE = `
WITH RECURSIVE descendants(id) AS (
  SELECT issue_id FROM dependencies WHERE type = 'parent-child' AND depends_on_id = ?
  UNION
  SELECT d.issue_id FROM dependencies d JOIN descendants x ON d.depends_on_id = x.id
  WHERE d.type = 'parent-child'
)`;

/** Beads' DeriveKey: lowercase slug of the first 8 words, max 60 chars. */
export function deriveMemoryKey(content: string): string {
  let s = content
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  s = s.split("-").slice(0, 8).join("-");
  if (s.length > 60) s = s.slice(0, 60).replace(/-+$/, "");
  return s;
}

export class TaskService {
  constructor(
    private readonly db: TaskDb,
    private readonly prefix: string,
    private readonly actor: string,
  ) {}

  private now(): string {
    return new Date().toISOString();
  }

  private exists(id: string): boolean {
    return this.db.get("SELECT 1 AS x FROM issues WHERE id = ?", id) !== undefined;
  }

  private require(id: string): Issue {
    const row = this.db.get("SELECT * FROM issues WHERE id = ?", id);
    if (!row) throw new TaskError(`no task ${id}`, "not_found");
    return this.db.loadIssues([row])[0] as Issue;
  }

  private parentOf(id: string): string | undefined {
    return this.db.get(
      "SELECT depends_on_id AS p FROM dependencies WHERE issue_id = ? AND type = 'parent-child'",
      id,
    )?.p as string | undefined;
  }

  // ---- reads -------------------------------------------------------------

  get(id: string): Issue | null {
    this.db.sync();
    const row = this.db.get("SELECT * FROM issues WHERE id = ?", id);
    return row ? (this.db.loadIssues([row])[0] ?? null) : null;
  }

  list(f: ListFilter = {}): Issue[] {
    this.db.sync();
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    let cte = "";
    if (f.status?.length) {
      where.push(`status IN (${f.status.map(() => "?").join(",")})`);
      params.push(...f.status);
    }
    if (f.assignee) {
      where.push("assignee = ?");
      params.push(f.assignee);
    }
    if (f.issueType) {
      where.push("issue_type = ?");
      params.push(f.issueType);
    }
    for (const l of f.labels ?? []) {
      where.push("id IN (SELECT issue_id FROM labels WHERE label = ?)");
      params.push(l);
    }
    if (f.parent) {
      cte = DESCENDANTS_CTE;
      params.unshift(f.parent);
      where.push("id IN (SELECT id FROM descendants)");
    }
    const sql = `${cte} SELECT * FROM issues ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY status = 'closed', priority, created_at, id ${f.limit ? "LIMIT ?" : ""}`;
    if (f.limit) params.push(f.limit);
    return this.db.loadIssues(this.db.all(sql, ...params));
  }

  /**
   * Ready work: status open, not blocked directly or through a blocked
   * ancestor, not deferred (nor a child of a deferred parent).
   */
  ready(f: ReadyFilter = {}): Issue[] {
    this.db.sync();
    const now = (f.now ?? new Date()).toISOString();
    const where = ["i.status = 'open'", "i.id NOT IN (SELECT issue_id FROM blocked_transitively)"];
    const params: SQLInputValue[] = [];
    let extraCte = "";
    if (!f.includeDeferred) {
      where.push("(i.defer_until IS NULL OR i.defer_until <= ?)");
      params.push(now);
      where.push(`i.id NOT IN (SELECT d.issue_id FROM dependencies d JOIN issues p ON p.id = d.depends_on_id
        WHERE d.type = 'parent-child' AND p.defer_until IS NOT NULL AND p.defer_until > ?)`);
      params.push(now);
    }
    for (const l of f.labels ?? []) {
      where.push("i.id IN (SELECT issue_id FROM labels WHERE label = ?)");
      params.push(l);
    }
    if (f.assignee) {
      where.push("i.assignee = ?");
      params.push(f.assignee);
    }
    if (f.unassigned) where.push("(i.assignee IS NULL OR i.assignee = '')");
    if (f.parent) {
      extraCte = `, descendants(id) AS (
        SELECT issue_id FROM dependencies WHERE type = 'parent-child' AND depends_on_id = ?
        UNION SELECT d.issue_id FROM dependencies d JOIN descendants x ON d.depends_on_id = x.id
        WHERE d.type = 'parent-child')`;
      params.unshift(f.parent);
      where.push("i.id IN (SELECT id FROM descendants)");
    }
    let order = "ORDER BY i.priority ASC, i.created_at ASC, i.id ASC";
    if (f.sort === "oldest") order = "ORDER BY i.created_at ASC, i.id ASC";
    if (f.sort === "hybrid") {
      const cutoff = new Date(Date.parse(now) - HYBRID_RECENT_MS).toISOString();
      order = `ORDER BY CASE WHEN i.created_at >= ? THEN 0 ELSE 1 END,
        CASE WHEN i.created_at >= ? THEN i.priority ELSE 999 END, i.created_at, i.id`;
      params.push(cutoff, cutoff);
    }
    const sql = `${BLOCKED_CTE}${extraCte}
      SELECT i.* FROM issues i WHERE ${where.join(" AND ")} ${order} LIMIT ?`;
    params.push(f.limit ?? 100);
    return this.db.loadIssues(this.db.all(sql, ...params));
  }

  /** Non-closed issues that are blocked, with their open direct blockers (or parent). */
  blocked(): BlockedIssue[] {
    this.db.sync();
    const rows = this.db.all(
      `${BLOCKED_CTE} SELECT DISTINCT i.* FROM issues i JOIN blocked_transitively bt ON bt.issue_id = i.id
       WHERE i.status != 'closed' ORDER BY i.priority, i.created_at, i.id`,
    );
    return this.db.loadIssues(rows).map((issue) => {
      const direct = this.db
        .all(
          `SELECT d.depends_on_id AS id FROM dependencies d JOIN issues b ON b.id = d.depends_on_id
           WHERE d.issue_id = ? AND d.type = 'blocks' AND b.status != 'closed' ORDER BY d.depends_on_id`,
          issue.id,
        )
        .map((r) => r.id as string);
      const parent = this.parentOf(issue.id);
      return { issue, blockedBy: direct.length ? direct : parent ? [parent] : [] };
    });
  }

  // ---- writes ------------------------------------------------------------

  create(input: CreateInput): Issue {
    return this.db.write(() => {
      const title = validateTitle(input.title);
      const priority = validatePriority(input.priority ?? DEFAULT_PRIORITY);
      const labels = (input.labels ?? []).map(validateLabel);
      const now = this.now();
      let id: string;
      if (input.parent) {
        if (!this.exists(input.parent))
          throw new TaskError(`no parent ${input.parent}`, "not_found");
        const ids = this.db
          .all("SELECT id FROM issues WHERE id LIKE ? ESCAPE '\\'", `${likeEscape(input.parent)}.%`)
          .map((r) => r.id as string);
        id = childId(input.parent, nextChildNumber(input.parent, ids));
      } else {
        const topLevel = Number(
          this.db.get(
            "SELECT COUNT(*) AS n FROM issues WHERE id LIKE ? ESCAPE '\\' AND instr(substr(id, ?), '.') = 0",
            `${likeEscape(this.prefix)}-%`,
            this.prefix.length + 2,
          )?.n ?? 0,
        );
        id = generateUniqueId(
          {
            prefix: this.prefix,
            title,
            description: input.description ?? "",
            creator: this.actor,
            timestampNs: nowNs(),
          },
          topLevel,
          (candidate) => this.exists(candidate),
        );
      }
      const issue: Issue = {
        id,
        title,
        status: "open",
        priority,
        issueType: input.issueType ?? "task",
        createdAt: now,
        createdBy: this.actor,
        updatedAt: now,
        labels,
        dependencies: [],
        comments: [],
      };
      const optional: (keyof CreateInput & keyof Issue)[] = [
        "description",
        "design",
        "acceptanceCriteria",
        "notes",
        "assignee",
        "deferUntil",
        "externalRef",
      ];
      for (const k of optional) {
        const v = input[k];
        if (typeof v === "string" && v.trim()) (issue as unknown as Record<string, unknown>)[k] = v;
      }
      this.db.insertIssue(issue);
      if (input.parent) this.addDependency(id, input.parent, "parent-child");
      for (const [type, target] of input.deps ?? []) this.addDependency(id, target, type);
      return this.require(id);
    });
  }

  update(id: string, u: UpdateInput): Issue {
    return this.db.write(() => {
      const issue = this.require(id);
      const sets: string[] = [];
      const params: SQLInputValue[] = [];
      const set = (col: string, v: SQLInputValue) => {
        sets.push(`${col} = ?`);
        params.push(v);
      };
      if (u.title !== undefined) set("title", validateTitle(u.title));
      if (u.description !== undefined) set("description", u.description || null);
      if (u.design !== undefined) set("design", u.design || null);
      if (u.acceptanceCriteria !== undefined)
        set("acceptance_criteria", u.acceptanceCriteria || null);
      if (u.notes !== undefined) set("notes", u.notes || null);
      if (u.priority !== undefined) set("priority", validatePriority(u.priority));
      if (u.issueType !== undefined) set("issue_type", u.issueType);
      if (u.assignee !== undefined) set("assignee", u.assignee || null);
      if (u.deferUntil !== undefined) set("defer_until", u.deferUntil || null);
      if (u.status !== undefined) {
        if ((u.status as string) === "closed") {
          throw new TaskError(
            "use close to close a task (it checks children and blockers)",
            "invalid",
          );
        }
        set("status", u.status);
        if (u.status === "in_progress" && !issue.startedAt) set("started_at", this.now());
        if (issue.status === "closed") {
          sets.push("closed_at = NULL", "close_reason = NULL");
        }
      }
      for (const l of u.addLabels ?? []) {
        this.db.run(
          "INSERT OR IGNORE INTO labels (issue_id, label) VALUES (?, ?)",
          id,
          validateLabel(l),
        );
      }
      for (const l of u.removeLabels ?? []) {
        this.db.run("DELETE FROM labels WHERE issue_id = ? AND label = ?", id, l);
      }
      set("updated_at", this.now());
      this.db.run(`UPDATE issues SET ${sets.join(", ")} WHERE id = ?`, ...params, id);
      return this.require(id);
    });
  }

  /**
   * Claim for the current actor: open + unassigned (or already ours) ->
   * in_progress with assignee and started_at. Re-claiming an issue the actor
   * already has in progress is a no-op success, so retries are safe.
   */
  claim(id: string): Issue {
    return this.db.write(() => {
      const issue = this.require(id);
      if (issue.status === "in_progress" && issue.assignee === this.actor) return issue;
      if (issue.assignee && issue.assignee !== this.actor) {
        throw new TaskError(`${id} is already claimed by ${issue.assignee}`, "already_claimed");
      }
      if (issue.status !== "open") {
        throw new TaskError(`${id} is not claimable (status ${issue.status})`, "not_claimable");
      }
      const now = this.now();
      this.db.run(
        `UPDATE issues SET assignee = ?, status = 'in_progress', updated_at = ?,
           started_at = COALESCE(started_at, ?) WHERE id = ? AND status = 'open'`,
        this.actor,
        now,
        now,
        id,
      );
      return this.require(id);
    });
  }

  /** Claim the first ready, unassigned issue in sort order. */
  claimNext(f: ReadyFilter = {}): Issue | null {
    return this.db.write(() => {
      for (const candidate of this.ready({ ...f, unassigned: true })) {
        try {
          return this.claim(candidate.id);
        } catch (err) {
          if (!(err instanceof TaskError)) throw err;
        }
      }
      return null;
    });
  }

  close(id: string, reason = "Closed", force = false): Issue {
    return this.db.write(() => {
      const issue = this.require(id);
      if (issue.status === "closed") return issue;
      if (!force) {
        const children = this.db
          .all(
            `SELECT d.issue_id AS id FROM dependencies d JOIN issues c ON c.id = d.issue_id
             WHERE d.depends_on_id = ? AND d.type = 'parent-child' AND c.status != 'closed' ORDER BY d.issue_id`,
            id,
          )
          .map((r) => r.id as string);
        if (children.length) {
          throw new TaskError(
            `${id} has open children: ${children.join(", ")} (close them first or use --force)`,
            "has_open_children",
          );
        }
        const blockers = this.db
          .all(
            `SELECT d.depends_on_id AS id FROM dependencies d JOIN issues b ON b.id = d.depends_on_id
             WHERE d.issue_id = ? AND d.type = 'blocks' AND b.status != 'closed' ORDER BY d.depends_on_id`,
            id,
          )
          .map((r) => r.id as string);
        if (blockers.length) {
          throw new TaskError(
            `${id} is blocked by open ${blockers.join(", ")} (or use --force)`,
            "has_open_blockers",
          );
        }
      }
      const now = this.now();
      this.db.run(
        `UPDATE issues SET status = 'closed', closed_at = ?, close_reason = ?, updated_at = ?
         WHERE id = ? AND status != 'closed'`,
        now,
        reason,
        now,
        id,
      );
      return this.require(id);
    });
  }

  reopen(id: string): Issue {
    return this.db.write(() => {
      this.require(id);
      this.db.run(
        `UPDATE issues SET status = 'open', closed_at = NULL, close_reason = NULL, updated_at = ?
         WHERE id = ?`,
        this.now(),
        id,
      );
      return this.require(id);
    });
  }

  /** Delete a task. Refuses if other tasks depend on it, unless forced (edges are removed). */
  delete(id: string, force = false): void {
    this.db.write(() => {
      this.require(id);
      const dependents = this.db
        .all(
          "SELECT issue_id AS id FROM dependencies WHERE depends_on_id = ? ORDER BY issue_id",
          id,
        )
        .map((r) => r.id as string);
      if (dependents.length && !force) {
        throw new TaskError(
          `${dependents.join(", ")} depend on ${id} (remove the links first or use --force)`,
          "conflict",
        );
      }
      this.db.run("DELETE FROM dependencies WHERE issue_id = ? OR depends_on_id = ?", id, id);
      this.db.run("DELETE FROM labels WHERE issue_id = ?", id);
      this.db.run("DELETE FROM comments WHERE issue_id = ?", id);
      this.db.run("DELETE FROM issues WHERE id = ?", id);
    });
  }

  addDependency(issueId: string, dependsOnId: string, type: DepType = "blocks"): void {
    this.db.write(() => {
      if (issueId === dependsOnId)
        throw new TaskError(`${issueId} cannot depend on itself`, "cycle");
      this.require(issueId);
      this.require(dependsOnId);
      if (type === "parent-child") {
        const existing = this.parentOf(issueId);
        if (existing && existing !== dependsOnId) {
          throw new TaskError(`${issueId} already has parent ${existing}`, "conflict");
        }
      }
      if (type === "blocks" || type === "parent-child") {
        if (this.reachable(dependsOnId, issueId)) {
          throw new TaskError(
            `adding ${issueId} -> ${dependsOnId} (${type}) would create a dependency cycle`,
            "cycle",
          );
        }
      }
      if (type === "blocks" && this.inSameLineage(issueId, dependsOnId)) {
        throw new TaskError(
          `${issueId} and ${dependsOnId} are ancestor/descendant; use parent-child, not blocks`,
          "invalid",
        );
      }
      this.db.insertDependency({
        issueId,
        dependsOnId,
        type,
        createdAt: this.now(),
        createdBy: this.actor,
      });
      this.db.run("UPDATE issues SET updated_at = ? WHERE id = ?", this.now(), issueId);
    });
  }

  removeDependency(issueId: string, dependsOnId: string): void {
    this.db.write(() => {
      const n = this.db.run(
        "DELETE FROM dependencies WHERE issue_id = ? AND depends_on_id = ?",
        issueId,
        dependsOnId,
      );
      if (n === 0) throw new TaskError(`${issueId} does not depend on ${dependsOnId}`, "not_found");
      this.db.run("UPDATE issues SET updated_at = ? WHERE id = ?", this.now(), issueId);
    });
  }

  /** Whether `to` is reachable from `from` along scheduling edges (blocks, parent-child). */
  private reachable(from: string, to: string): boolean {
    const row = this.db.get(
      `WITH RECURSIVE r(id) AS (
         SELECT ? UNION
         SELECT d.depends_on_id FROM dependencies d JOIN r ON d.issue_id = r.id
         WHERE d.type IN ('blocks', 'parent-child')
       ) SELECT COUNT(*) AS n FROM r WHERE id = ?`,
      from,
      to,
    );
    return Number(row?.n ?? 0) > 0;
  }

  private ancestors(id: string): Set<string> {
    const out = new Set<string>();
    let cur = this.parentOf(id);
    while (cur && !out.has(cur)) {
      out.add(cur);
      cur = this.parentOf(cur);
    }
    return out;
  }

  private inSameLineage(a: string, b: string): boolean {
    return this.ancestors(a).has(b) || this.ancestors(b).has(a);
  }

  addComment(id: string, text: string): Issue {
    return this.db.write(() => {
      this.require(id);
      const body = text.trim();
      if (!body) throw new TaskError("comment text is required", "invalid");
      const next = Number(
        this.db.get("SELECT COALESCE(MAX(id), 0) + 1 AS n FROM comments WHERE issue_id = ?", id)
          ?.n ?? 1,
      );
      this.db.run(
        "INSERT INTO comments (issue_id, id, author, text, created_at) VALUES (?, ?, ?, ?, ?)",
        id,
        next,
        this.actor,
        body,
        this.now(),
      );
      this.db.run("UPDATE issues SET updated_at = ? WHERE id = ?", this.now(), id);
      return this.require(id);
    });
  }

  // ---- memories ----------------------------------------------------------

  remember(value: string, key?: string): Memory {
    return this.db.write(() => {
      const v = value.trim();
      if (!v) throw new TaskError("nothing to remember", "invalid");
      const k = key?.trim() || deriveMemoryKey(v);
      if (!k) throw new TaskError("could not derive a key; pass --key", "invalid");
      const now = this.now();
      this.db.upsertMemory({ key: k, value: v, createdAt: now, updatedAt: now });
      return rowToMemory(this.db.get("SELECT * FROM memories WHERE key = ?", k) ?? {});
    });
  }

  recall(key: string): Memory | null {
    this.db.sync();
    const row = this.db.get("SELECT * FROM memories WHERE key = ?", key);
    return row ? rowToMemory(row) : null;
  }

  forget(key: string): boolean {
    return this.db.write(() => this.db.run("DELETE FROM memories WHERE key = ?", key) > 0);
  }

  memories(search?: string): Memory[] {
    this.db.sync();
    if (!search) return this.db.all("SELECT * FROM memories ORDER BY key").map(rowToMemory);
    const q = `%${search.toLowerCase()}%`;
    return this.db
      .all(
        "SELECT * FROM memories WHERE lower(key) LIKE ? OR lower(value) LIKE ? ORDER BY key",
        q,
        q,
      )
      .map(rowToMemory);
  }

  // ---- import ------------------------------------------------------------

  /**
   * Import a Beads JSONL export (`bd export`, or `bd export --include-memories`).
   * Foreign statuses/types/dependency kinds are mapped to the closest supported
   * value. Existing ids are skipped unless `overwrite`. Dependencies pointing
   * at ids not in the store are dropped and reported.
   */
  importBeads(
    text: string,
    source: string,
    overwrite = false,
  ): {
    created: number;
    updated: number;
    skipped: number;
    memories: number;
    droppedDeps: string[];
  } {
    return this.db.write(() => {
      const stats = {
        created: 0,
        updated: 0,
        skipped: 0,
        memories: 0,
        droppedDeps: [] as string[],
      };
      const issues: Issue[] = [];
      for (const [n, r] of parseJsonl(text, source).entries()) {
        const where = `${source}:${n + 1}`;
        if (r._type === "memory") {
          const m = recordToMemory(r, where);
          this.db.upsertMemory(m);
          stats.memories++;
        } else if (r._type === undefined || r._type === "issue") {
          issues.push(recordToIssue(r, where, true));
        }
      }
      for (const issue of issues) {
        if (this.exists(issue.id)) {
          if (!overwrite) {
            stats.skipped++;
            continue;
          }
          this.db.run("DELETE FROM labels WHERE issue_id = ?", issue.id);
          this.db.run("DELETE FROM comments WHERE issue_id = ?", issue.id);
          this.db.run("DELETE FROM dependencies WHERE issue_id = ?", issue.id);
          this.db.run("DELETE FROM issues WHERE id = ?", issue.id);
          stats.updated++;
        } else {
          stats.created++;
        }
        this.db.insertIssue({ ...issue, dependencies: [] });
      }
      for (const issue of issues) {
        for (const d of issue.dependencies) {
          if (!this.exists(d.dependsOnId)) {
            stats.droppedDeps.push(`${d.issueId} -> ${d.dependsOnId}`);
            continue;
          }
          this.db.insertDependency(d);
        }
      }
      return stats;
    });
  }
}

function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
