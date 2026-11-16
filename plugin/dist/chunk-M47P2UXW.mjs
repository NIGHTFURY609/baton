#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  DEFAULT_PRIORITY,
  TaskError,
  childId,
  defaultPrefix,
  generateUniqueId,
  issueToRecord,
  memoryToRecord,
  nextChildNumber,
  nowNs,
  parseJsonl,
  readTextOrEmpty,
  recordToIssue,
  recordToMemory,
  serializeJsonl,
  sha256,
  validateLabel,
  validatePriority,
  validateTitle,
  writeFileAtomic
} from "./chunk-QYQVMIUC.mjs";
import {
  ContextPaths,
  contextPath
} from "./chunk-HVIRJWHJ.mjs";

// src/core/tasks/native/store.ts
import { execFileSync } from "child_process";
import { userInfo } from "os";
import { basename } from "path";

// src/core/tasks/native/db.ts
import { mkdirSync } from "fs";
import { createRequire } from "module";
import { dirname } from "path";
var SCHEMA_VERSION = "1";
var SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT, design TEXT, acceptance_criteria TEXT, notes TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority INTEGER NOT NULL DEFAULT 2,
  issue_type TEXT NOT NULL DEFAULT 'task',
  assignee TEXT,
  created_at TEXT NOT NULL, created_by TEXT,
  updated_at TEXT NOT NULL,
  started_at TEXT, closed_at TEXT, close_reason TEXT,
  defer_until TEXT, external_ref TEXT
);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE TABLE IF NOT EXISTS dependencies (
  issue_id TEXT NOT NULL,
  depends_on_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'blocks',
  created_at TEXT NOT NULL, created_by TEXT,
  PRIMARY KEY (issue_id, depends_on_id)
);
CREATE INDEX IF NOT EXISTS idx_deps_target ON dependencies(depends_on_id, type);
CREATE TABLE IF NOT EXISTS labels (
  issue_id TEXT NOT NULL, label TEXT NOT NULL,
  PRIMARY KEY (issue_id, label)
);
CREATE INDEX IF NOT EXISTS idx_labels_label ON labels(label);
CREATE TABLE IF NOT EXISTS comments (
  issue_id TEXT NOT NULL, id INTEGER NOT NULL,
  author TEXT, text TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (issue_id, id)
);
CREATE TABLE IF NOT EXISTS memories (
  key TEXT PRIMARY KEY, value TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
`;
var sqliteCtor;
function loadSqlite() {
  if (sqliteCtor) return sqliteCtor;
  const original = process.emitWarning;
  process.emitWarning = ((warning, ...rest) => {
    const text = typeof warning === "string" ? warning : warning.message;
    if (/SQLite is an experimental feature/.test(text)) return;
    return original.call(process, warning, ...rest);
  });
  try {
    const require2 = createRequire(import.meta.url);
    sqliteCtor = require2("node:sqlite").DatabaseSync;
  } finally {
    process.emitWarning = original;
  }
  return sqliteCtor;
}
var TaskDb = class {
  constructor(paths) {
    this.paths = paths;
    mkdirSync(dirname(paths.dbFile), { recursive: true });
    const Database = loadSqlite();
    this.db = new Database(paths.dbFile);
    this.db.exec("PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }
  paths;
  db;
  inTx = false;
  close() {
    this.db.close();
  }
  all(sql, ...params) {
    return this.db.prepare(sql).all(...params);
  }
  get(sql, ...params) {
    return this.db.prepare(sql).get(...params);
  }
  run(sql, ...params) {
    return Number(this.db.prepare(sql).run(...params).changes);
  }
  sourceHash() {
    const tasksText = readTextOrEmpty(this.paths.tasksJsonl);
    const memoriesText = readTextOrEmpty(this.paths.memoriesJsonl);
    return {
      hash: sha256(`${SCHEMA_VERSION}\0${tasksText}\0${memoriesText}`),
      tasksText,
      memoriesText
    };
  }
  cachedHash() {
    return this.get("SELECT value FROM meta WHERE key = 'source_hash'")?.value;
  }
  /**
   * Rebuild every table from the JSONL files. Caller holds the write lock.
   *
   * The JSONL files carry `merge=union` in .gitattributes, so a merge where
   * both sides changed the same task leaves two lines with one id. The line
   * with the later updated_at wins (last writer wins, per record). Returns
   * true when duplicates were collapsed, so the caller re-exports a clean file.
   */
  rebuild(tasksText, memoriesText, hash) {
    this.db.exec(
      "DELETE FROM issues; DELETE FROM dependencies; DELETE FROM labels; DELETE FROM comments; DELETE FROM memories;"
    );
    let duplicates = false;
    const issues = /* @__PURE__ */ new Map();
    for (const [n, r] of parseJsonl(tasksText, this.paths.tasksJsonl).entries()) {
      if (r._type !== void 0 && r._type !== "issue") continue;
      const issue = recordToIssue(r, `${this.paths.tasksJsonl}:${n + 1}`);
      const prev = issues.get(issue.id);
      if (prev) duplicates = true;
      if (!prev || issue.updatedAt >= prev.updatedAt) issues.set(issue.id, issue);
    }
    for (const issue of issues.values()) this.insertIssue(issue);
    const memories = /* @__PURE__ */ new Map();
    for (const [n, r] of parseJsonl(memoriesText, this.paths.memoriesJsonl).entries()) {
      const m = recordToMemory(r, `${this.paths.memoriesJsonl}:${n + 1}`);
      const prev = memories.get(m.key);
      if (prev) duplicates = true;
      if (!prev || m.updatedAt >= prev.updatedAt) memories.set(m.key, m);
    }
    for (const m of memories.values()) this.upsertMemory({ ...m });
    this.run("INSERT OR REPLACE INTO meta(key, value) VALUES ('source_hash', ?)", hash);
    return duplicates;
  }
  /** Ensure the cache reflects the JSONL files (cheap when unchanged). */
  sync() {
    const { hash } = this.sourceHash();
    if (hash === this.cachedHash()) return;
    this.write(() => void 0, { exportAfter: false });
  }
  /**
   * Run `fn` under an exclusive write lock. The cache is re-synced from the
   * JSONL files first if they changed; afterwards the JSONL files are
   * re-exported (unless exportAfter is false) and the new hash recorded.
   */
  write(fn, opts = {}) {
    if (this.inTx) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    this.inTx = true;
    try {
      const src = this.sourceHash();
      let normalize = false;
      if (src.hash !== this.cachedHash()) {
        normalize = this.rebuild(src.tasksText, src.memoriesText, src.hash);
      }
      const result = fn();
      if (opts.exportAfter !== false || normalize) this.exportJsonl();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    } finally {
      this.inTx = false;
    }
  }
  exportJsonl() {
    const issues = this.loadIssues(this.all("SELECT * FROM issues ORDER BY id"));
    const tasksText = serializeJsonl(issues.map(issueToRecord));
    const memories = this.all("SELECT * FROM memories ORDER BY key").map(rowToMemory);
    const memoriesText = serializeJsonl(memories.map(memoryToRecord));
    if (tasksText !== readTextOrEmpty(this.paths.tasksJsonl)) {
      writeFileAtomic(this.paths.tasksJsonl, tasksText);
    }
    if (memoriesText !== readTextOrEmpty(this.paths.memoriesJsonl)) {
      writeFileAtomic(this.paths.memoriesJsonl, memoriesText);
    }
    const hash = sha256(`${SCHEMA_VERSION}\0${tasksText}\0${memoriesText}`);
    this.run("INSERT OR REPLACE INTO meta(key, value) VALUES ('source_hash', ?)", hash);
  }
  insertIssue(i) {
    this.run(
      `INSERT INTO issues (id, title, description, design, acceptance_criteria, notes, status, priority,
         issue_type, assignee, created_at, created_by, updated_at, started_at, closed_at, close_reason,
         defer_until, external_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      i.id,
      i.title,
      i.description ?? null,
      i.design ?? null,
      i.acceptanceCriteria ?? null,
      i.notes ?? null,
      i.status,
      i.priority,
      i.issueType,
      i.assignee ?? null,
      i.createdAt,
      i.createdBy ?? null,
      i.updatedAt,
      i.startedAt ?? null,
      i.closedAt ?? null,
      i.closeReason ?? null,
      i.deferUntil ?? null,
      i.externalRef ?? null
    );
    for (const l of new Set(i.labels)) {
      this.run("INSERT OR IGNORE INTO labels (issue_id, label) VALUES (?, ?)", i.id, l);
    }
    for (const d of i.dependencies) this.insertDependency(d);
    for (const c of i.comments) {
      this.run(
        "INSERT OR REPLACE INTO comments (issue_id, id, author, text, created_at) VALUES (?, ?, ?, ?, ?)",
        i.id,
        c.id,
        c.author ?? null,
        c.text,
        c.createdAt
      );
    }
  }
  insertDependency(d) {
    this.run(
      "INSERT OR REPLACE INTO dependencies (issue_id, depends_on_id, type, created_at, created_by) VALUES (?, ?, ?, ?, ?)",
      d.issueId,
      d.dependsOnId,
      d.type,
      d.createdAt,
      d.createdBy ?? null
    );
  }
  upsertMemory(m) {
    this.run(
      `INSERT INTO memories (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      m.key,
      m.value,
      m.createdAt,
      m.updatedAt
    );
  }
  /** Hydrate issue rows with labels, outgoing dependencies and comments. */
  loadIssues(rows) {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const marks = ids.map(() => "?").join(",");
    const labels = /* @__PURE__ */ new Map();
    for (const r of this.all(
      `SELECT issue_id, label FROM labels WHERE issue_id IN (${marks}) ORDER BY label`,
      ...ids
    )) {
      const k = r.issue_id;
      labels.set(k, [...labels.get(k) ?? [], r.label]);
    }
    const deps = /* @__PURE__ */ new Map();
    for (const r of this.all(`SELECT * FROM dependencies WHERE issue_id IN (${marks})`, ...ids)) {
      const k = r.issue_id;
      deps.set(k, [...deps.get(k) ?? [], rowToDependency(r)]);
    }
    const comments = /* @__PURE__ */ new Map();
    for (const r of this.all(
      `SELECT * FROM comments WHERE issue_id IN (${marks}) ORDER BY id`,
      ...ids
    )) {
      const k = r.issue_id;
      const c = {
        id: Number(r.id),
        text: r.text,
        createdAt: r.created_at
      };
      if (r.author) c.author = r.author;
      comments.set(k, [...comments.get(k) ?? [], c]);
    }
    return rows.map((r) => {
      const issue = {
        id: r.id,
        title: r.title,
        status: r.status,
        priority: Number(r.priority),
        issueType: r.issue_type,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        labels: labels.get(r.id) ?? [],
        dependencies: deps.get(r.id) ?? [],
        comments: comments.get(r.id) ?? []
      };
      const optional = [
        ["description", "description"],
        ["design", "design"],
        ["acceptanceCriteria", "acceptance_criteria"],
        ["notes", "notes"],
        ["assignee", "assignee"],
        ["createdBy", "created_by"],
        ["startedAt", "started_at"],
        ["closedAt", "closed_at"],
        ["closeReason", "close_reason"],
        ["deferUntil", "defer_until"],
        ["externalRef", "external_ref"]
      ];
      for (const [k, col] of optional) {
        if (r[col] != null && r[col] !== "") issue[k] = r[col];
      }
      return issue;
    });
  }
};
function rowToDependency(r) {
  const d = {
    issueId: r.issue_id,
    dependsOnId: r.depends_on_id,
    type: r.type,
    createdAt: r.created_at
  };
  if (r.created_by) d.createdBy = r.created_by;
  return d;
}
function rowToMemory(r) {
  return {
    key: r.key,
    value: r.value,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

// src/core/tasks/native/service.ts
var HYBRID_RECENT_MS = 48 * 60 * 60 * 1e3;
var BLOCKED_CTE = `
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
var DESCENDANTS_CTE = `
WITH RECURSIVE descendants(id) AS (
  SELECT issue_id FROM dependencies WHERE type = 'parent-child' AND depends_on_id = ?
  UNION
  SELECT d.issue_id FROM dependencies d JOIN descendants x ON d.depends_on_id = x.id
  WHERE d.type = 'parent-child'
)`;
function deriveMemoryKey(content) {
  let s = content.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  s = s.split("-").slice(0, 8).join("-");
  if (s.length > 60) s = s.slice(0, 60).replace(/-+$/, "");
  return s;
}
var TaskService = class {
  constructor(db, prefix, actor) {
    this.db = db;
    this.prefix = prefix;
    this.actor = actor;
  }
  db;
  prefix;
  actor;
  now() {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
  exists(id) {
    return this.db.get("SELECT 1 AS x FROM issues WHERE id = ?", id) !== void 0;
  }
  require(id) {
    const row = this.db.get("SELECT * FROM issues WHERE id = ?", id);
    if (!row) throw new TaskError(`no task ${id}`, "not_found");
    return this.db.loadIssues([row])[0];
  }
  parentOf(id) {
    return this.db.get(
      "SELECT depends_on_id AS p FROM dependencies WHERE issue_id = ? AND type = 'parent-child'",
      id
    )?.p;
  }
  // ---- reads -------------------------------------------------------------
  get(id) {
    this.db.sync();
    const row = this.db.get("SELECT * FROM issues WHERE id = ?", id);
    return row ? this.db.loadIssues([row])[0] ?? null : null;
  }
  list(f = {}) {
    this.db.sync();
    const where = [];
    const params = [];
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
  ready(f = {}) {
    this.db.sync();
    const now = (f.now ?? /* @__PURE__ */ new Date()).toISOString();
    const where = ["i.status = 'open'", "i.id NOT IN (SELECT issue_id FROM blocked_transitively)"];
    const params = [];
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
  blocked() {
    this.db.sync();
    const rows = this.db.all(
      `${BLOCKED_CTE} SELECT DISTINCT i.* FROM issues i JOIN blocked_transitively bt ON bt.issue_id = i.id
       WHERE i.status != 'closed' ORDER BY i.priority, i.created_at, i.id`
    );
    return this.db.loadIssues(rows).map((issue) => {
      const direct = this.db.all(
        `SELECT d.depends_on_id AS id FROM dependencies d JOIN issues b ON b.id = d.depends_on_id
           WHERE d.issue_id = ? AND d.type = 'blocks' AND b.status != 'closed' ORDER BY d.depends_on_id`,
        issue.id
      ).map((r) => r.id);
      const parent = this.parentOf(issue.id);
      return { issue, blockedBy: direct.length ? direct : parent ? [parent] : [] };
    });
  }
  // ---- writes ------------------------------------------------------------
  create(input) {
    return this.db.write(() => {
      const title = validateTitle(input.title);
      const priority = validatePriority(input.priority ?? DEFAULT_PRIORITY);
      const labels = (input.labels ?? []).map(validateLabel);
      const now = this.now();
      let id;
      if (input.parent) {
        if (!this.exists(input.parent))
          throw new TaskError(`no parent ${input.parent}`, "not_found");
        const ids = this.db.all("SELECT id FROM issues WHERE id LIKE ? ESCAPE '\\'", `${likeEscape(input.parent)}.%`).map((r) => r.id);
        id = childId(input.parent, nextChildNumber(input.parent, ids));
      } else {
        const topLevel = Number(
          this.db.get(
            "SELECT COUNT(*) AS n FROM issues WHERE id LIKE ? ESCAPE '\\' AND instr(substr(id, ?), '.') = 0",
            `${likeEscape(this.prefix)}-%`,
            this.prefix.length + 2
          )?.n ?? 0
        );
        id = generateUniqueId(
          {
            prefix: this.prefix,
            title,
            description: input.description ?? "",
            creator: this.actor,
            timestampNs: nowNs()
          },
          topLevel,
          (candidate) => this.exists(candidate)
        );
      }
      const issue = {
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
        comments: []
      };
      const optional = [
        "description",
        "design",
        "acceptanceCriteria",
        "notes",
        "assignee",
        "deferUntil",
        "externalRef"
      ];
      for (const k of optional) {
        const v = input[k];
        if (typeof v === "string" && v.trim()) issue[k] = v;
      }
      this.db.insertIssue(issue);
      if (input.parent) this.addDependency(id, input.parent, "parent-child");
      for (const [type, target] of input.deps ?? []) this.addDependency(id, target, type);
      return this.require(id);
    });
  }
  update(id, u) {
    return this.db.write(() => {
      const issue = this.require(id);
      const sets = [];
      const params = [];
      const set = (col, v) => {
        sets.push(`${col} = ?`);
        params.push(v);
      };
      if (u.title !== void 0) set("title", validateTitle(u.title));
      if (u.description !== void 0) set("description", u.description || null);
      if (u.design !== void 0) set("design", u.design || null);
      if (u.acceptanceCriteria !== void 0)
        set("acceptance_criteria", u.acceptanceCriteria || null);
      if (u.notes !== void 0) set("notes", u.notes || null);
      if (u.priority !== void 0) set("priority", validatePriority(u.priority));
      if (u.issueType !== void 0) set("issue_type", u.issueType);
      if (u.assignee !== void 0) set("assignee", u.assignee || null);
      if (u.deferUntil !== void 0) set("defer_until", u.deferUntil || null);
      if (u.status !== void 0) {
        if (u.status === "closed") {
          throw new TaskError(
            "use close to close a task (it checks children and blockers)",
            "invalid"
          );
        }
        set("status", u.status);
        const reopening = issue.status === "closed";
        if (reopening) {
          sets.push("closed_at = NULL", "close_reason = NULL");
          set("started_at", u.status === "in_progress" ? this.now() : null);
        } else if (u.status === "in_progress" && !issue.startedAt) {
          set("started_at", this.now());
        }
      }
      for (const l of u.addLabels ?? []) {
        this.db.run(
          "INSERT OR IGNORE INTO labels (issue_id, label) VALUES (?, ?)",
          id,
          validateLabel(l)
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
  claim(id) {
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
        id
      );
      return this.require(id);
    });
  }
  /** Claim the first ready, unassigned issue in sort order. */
  claimNext(f = {}) {
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
  close(id, reason = "Closed", force = false) {
    return this.db.write(() => {
      const issue = this.require(id);
      if (issue.status === "closed") return issue;
      if (!force) {
        const children = this.db.all(
          `SELECT d.issue_id AS id FROM dependencies d JOIN issues c ON c.id = d.issue_id
             WHERE d.depends_on_id = ? AND d.type = 'parent-child' AND c.status != 'closed' ORDER BY d.issue_id`,
          id
        ).map((r) => r.id);
        if (children.length) {
          throw new TaskError(
            `${id} has open children: ${children.join(", ")} (close them first or use --force)`,
            "has_open_children"
          );
        }
        const blockers = this.db.all(
          `SELECT d.depends_on_id AS id FROM dependencies d JOIN issues b ON b.id = d.depends_on_id
             WHERE d.issue_id = ? AND d.type = 'blocks' AND b.status != 'closed' ORDER BY d.depends_on_id`,
          id
        ).map((r) => r.id);
        if (blockers.length) {
          throw new TaskError(
            `${id} is blocked by open ${blockers.join(", ")} (or use --force)`,
            "has_open_blockers"
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
        id
      );
      return this.require(id);
    });
  }
  /** Reopen a task. `started_at` is cleared, so verify's diff rule counts from the next claim. */
  reopen(id) {
    return this.db.write(() => {
      this.require(id);
      this.db.run(
        `UPDATE issues SET status = 'open', closed_at = NULL, close_reason = NULL, started_at = NULL,
           updated_at = ? WHERE id = ?`,
        this.now(),
        id
      );
      return this.require(id);
    });
  }
  /** Delete a task. Refuses if other tasks depend on it, unless forced (edges are removed). */
  delete(id, force = false) {
    this.db.write(() => {
      this.require(id);
      const dependents = this.db.all(
        "SELECT issue_id AS id FROM dependencies WHERE depends_on_id = ? ORDER BY issue_id",
        id
      ).map((r) => r.id);
      if (dependents.length && !force) {
        throw new TaskError(
          `${dependents.join(", ")} depend on ${id} (remove the links first or use --force)`,
          "conflict"
        );
      }
      this.db.run("DELETE FROM dependencies WHERE issue_id = ? OR depends_on_id = ?", id, id);
      this.db.run("DELETE FROM labels WHERE issue_id = ?", id);
      this.db.run("DELETE FROM comments WHERE issue_id = ?", id);
      this.db.run("DELETE FROM issues WHERE id = ?", id);
    });
  }
  addDependency(issueId, dependsOnId, type = "blocks") {
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
            "cycle"
          );
        }
      }
      if (type === "blocks" && this.inSameLineage(issueId, dependsOnId)) {
        throw new TaskError(
          `${issueId} and ${dependsOnId} are ancestor/descendant; use parent-child, not blocks`,
          "invalid"
        );
      }
      this.db.insertDependency({
        issueId,
        dependsOnId,
        type,
        createdAt: this.now(),
        createdBy: this.actor
      });
      this.db.run("UPDATE issues SET updated_at = ? WHERE id = ?", this.now(), issueId);
    });
  }
  removeDependency(issueId, dependsOnId) {
    this.db.write(() => {
      const n = this.db.run(
        "DELETE FROM dependencies WHERE issue_id = ? AND depends_on_id = ?",
        issueId,
        dependsOnId
      );
      if (n === 0) throw new TaskError(`${issueId} does not depend on ${dependsOnId}`, "not_found");
      this.db.run("UPDATE issues SET updated_at = ? WHERE id = ?", this.now(), issueId);
    });
  }
  /** Whether `to` is reachable from `from` along scheduling edges (blocks, parent-child). */
  reachable(from, to) {
    const row = this.db.get(
      `WITH RECURSIVE r(id) AS (
         SELECT ? UNION
         SELECT d.depends_on_id FROM dependencies d JOIN r ON d.issue_id = r.id
         WHERE d.type IN ('blocks', 'parent-child')
       ) SELECT COUNT(*) AS n FROM r WHERE id = ?`,
      from,
      to
    );
    return Number(row?.n ?? 0) > 0;
  }
  ancestors(id) {
    const out = /* @__PURE__ */ new Set();
    let cur = this.parentOf(id);
    while (cur && !out.has(cur)) {
      out.add(cur);
      cur = this.parentOf(cur);
    }
    return out;
  }
  inSameLineage(a, b) {
    return this.ancestors(a).has(b) || this.ancestors(b).has(a);
  }
  addComment(id, text) {
    return this.db.write(() => {
      this.require(id);
      const body = text.trim();
      if (!body) throw new TaskError("comment text is required", "invalid");
      const next = Number(
        this.db.get("SELECT COALESCE(MAX(id), 0) + 1 AS n FROM comments WHERE issue_id = ?", id)?.n ?? 1
      );
      this.db.run(
        "INSERT INTO comments (issue_id, id, author, text, created_at) VALUES (?, ?, ?, ?, ?)",
        id,
        next,
        this.actor,
        body,
        this.now()
      );
      this.db.run("UPDATE issues SET updated_at = ? WHERE id = ?", this.now(), id);
      return this.require(id);
    });
  }
  // ---- memories ----------------------------------------------------------
  remember(value, key) {
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
  recall(key) {
    this.db.sync();
    const row = this.db.get("SELECT * FROM memories WHERE key = ?", key);
    return row ? rowToMemory(row) : null;
  }
  forget(key) {
    return this.db.write(() => this.db.run("DELETE FROM memories WHERE key = ?", key) > 0);
  }
  memories(search) {
    this.db.sync();
    if (!search) return this.db.all("SELECT * FROM memories ORDER BY key").map(rowToMemory);
    const q = `%${search.toLowerCase()}%`;
    return this.db.all(
      "SELECT * FROM memories WHERE lower(key) LIKE ? OR lower(value) LIKE ? ORDER BY key",
      q,
      q
    ).map(rowToMemory);
  }
  // ---- import ------------------------------------------------------------
  /**
   * Import a Beads JSONL export (`bd export`, or `bd export --include-memories`).
   * Foreign statuses/types/dependency kinds are mapped to the closest supported
   * value. Existing ids are skipped unless `overwrite`. Dependencies pointing
   * at ids not in the store are dropped and reported.
   */
  importBeads(text, source, overwrite = false) {
    return this.db.write(() => {
      const stats = {
        created: 0,
        updated: 0,
        skipped: 0,
        memories: 0,
        droppedDeps: []
      };
      const issues = [];
      for (const [n, r] of parseJsonl(text, source).entries()) {
        const where = `${source}:${n + 1}`;
        if (r._type === "memory") {
          const m = recordToMemory(r, where);
          this.db.upsertMemory(m);
          stats.memories++;
        } else if (r._type === void 0 || r._type === "issue") {
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
};
function likeEscape(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// src/core/tasks/native/store.ts
var TASKS_FILE = "tasks.jsonl";
var MEMORIES_FILE = "memories.jsonl";
var TASKS_DB = "tasks.db";
function resolveActor(root, explicit) {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.BATON_ACTOR?.trim()) return process.env.BATON_ACTOR.trim();
  try {
    const name = execFileSync("git", ["config", "user.name"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (name) return name;
  } catch {
  }
  try {
    return userInfo().username || "unknown";
  } catch {
    return "unknown";
  }
}
function resolvePrefix(root, config) {
  return config.tasks.prefix ?? defaultPrefix(basename(root));
}
function openTaskService(root, config, opts = {}) {
  const db = new TaskDb({
    tasksJsonl: contextPath(root, TASKS_FILE),
    memoriesJsonl: contextPath(root, MEMORIES_FILE),
    dbFile: contextPath(root, ContextPaths.cache, TASKS_DB)
  });
  const service = new TaskService(db, resolvePrefix(root, config), resolveActor(root, opts.actor));
  return { service, db };
}
function issueToTask(i) {
  const task = {
    id: i.id,
    title: i.title,
    status: i.status,
    priority: i.priority,
    specSections: i.labels.filter((l) => l.startsWith("spec:")).map((l) => l.slice(5)),
    issueType: i.issueType
  };
  if (i.description) task.description = i.description;
  if (i.assignee) task.assignee = i.assignee;
  if (i.closedAt) task.closedAt = i.closedAt;
  if (i.closeReason) task.closeReason = i.closeReason;
  const check = i.labels.find((l) => l.startsWith("check:"));
  if (check) task.checkCommand = check.slice(6);
  return task;
}
var NativeTaskStore = class {
  constructor(root, config) {
    this.root = root;
    this.config = config;
  }
  root;
  config;
  name = "native";
  with(fn) {
    const { service, db } = openTaskService(this.root, this.config);
    try {
      return fn(service);
    } finally {
      db.close();
    }
  }
  async available() {
    return true;
  }
  async ready(limit) {
    return this.with((s) => s.ready({ limit }).map(issueToTask));
  }
  async get(id) {
    return this.with((s) => {
      const i = s.get(id);
      return i ? issueToTask(i) : null;
    });
  }
  async close(id, reason) {
    this.with((s) => s.close(id, reason));
  }
};

export {
  TASKS_FILE,
  MEMORIES_FILE,
  TASKS_DB,
  resolveActor,
  resolvePrefix,
  openTaskService,
  issueToTask,
  NativeTaskStore
};
//# sourceMappingURL=chunk-M47P2UXW.mjs.map