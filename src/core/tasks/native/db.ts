/*
 * SQLite cache over the JSONL source of truth (ADR 0009).
 *
 * .context/tasks.jsonl and .context/memories.jsonl are committed and are the
 * only truth. .context/.cache/tasks.db is a git-ignored index rebuilt from
 * them whenever their content hash differs from the one the cache last saw
 * (e.g. after git pull, merge or checkout). Every write runs inside
 * BEGIN IMMEDIATE, which serialises writers across processes: re-sync if
 * needed, mutate, export JSONL atomically, record the new hash, commit.
 *
 * Uses Node's built-in node:sqlite (no native dependency). Schema shape
 * follows Beads' core tables (issues, dependencies, labels, comments);
 * adapted from internal/storage/schema/migrations 0001-0003, MIT License,
 * Copyright (c) 2025 Beads Contributors. See THIRD_PARTY_NOTICES.md.
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  issueToRecord,
  memoryToRecord,
  parseJsonl,
  readTextOrEmpty,
  recordToIssue,
  recordToMemory,
  serializeJsonl,
  sha256,
  writeFileAtomic,
} from "./jsonl.js";
import type { Comment, Dependency, Issue, Memory } from "./model.js";

const SCHEMA_VERSION = "1";

const SCHEMA = `
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

type Row = Record<string, unknown>;

let sqliteCtor: typeof DatabaseSync | undefined;

/**
 * Load node:sqlite lazily and without its ExperimentalWarning: hooks print to
 * the harness, and a warning on stderr every session is noise. Loaded only
 * when the task store is used, so other commands pay nothing.
 */
function loadSqlite(): typeof DatabaseSync {
  if (sqliteCtor) return sqliteCtor;
  const original = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === "string" ? warning : warning.message;
    if (/SQLite is an experimental feature/.test(text)) return;
    return (original as (...a: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;
  try {
    const require = createRequire(import.meta.url);
    sqliteCtor = (require("node:sqlite") as typeof import("node:sqlite")).DatabaseSync;
  } finally {
    process.emitWarning = original;
  }
  return sqliteCtor;
}

export interface StorePaths {
  tasksJsonl: string;
  memoriesJsonl: string;
  dbFile: string;
}

export class TaskDb {
  readonly db: DatabaseSync;
  private inTx = false;

  constructor(readonly paths: StorePaths) {
    mkdirSync(dirname(paths.dbFile), { recursive: true });
    const Database = loadSqlite();
    this.db = new Database(paths.dbFile);
    this.db.exec("PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  all(sql: string, ...params: SQLInputValue[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }
  get(sql: string, ...params: SQLInputValue[]): Row | undefined {
    return this.db.prepare(sql).get(...params) as Row | undefined;
  }
  run(sql: string, ...params: SQLInputValue[]): number {
    return Number(this.db.prepare(sql).run(...params).changes);
  }

  private sourceHash(): { hash: string; tasksText: string; memoriesText: string } {
    const tasksText = readTextOrEmpty(this.paths.tasksJsonl);
    const memoriesText = readTextOrEmpty(this.paths.memoriesJsonl);
    return {
      hash: sha256(`${SCHEMA_VERSION}\0${tasksText}\0${memoriesText}`),
      tasksText,
      memoriesText,
    };
  }

  private cachedHash(): string | undefined {
    return this.get("SELECT value FROM meta WHERE key = 'source_hash'")?.value as
      | string
      | undefined;
  }

  /**
   * Rebuild every table from the JSONL files. Caller holds the write lock.
   *
   * The JSONL files carry `merge=union` in .gitattributes, so a merge where
   * both sides changed the same task leaves two lines with one id. The line
   * with the later updated_at wins (last writer wins, per record). Returns
   * true when duplicates were collapsed, so the caller re-exports a clean file.
   */
  private rebuild(tasksText: string, memoriesText: string, hash: string): boolean {
    this.db.exec(
      "DELETE FROM issues; DELETE FROM dependencies; DELETE FROM labels; DELETE FROM comments; DELETE FROM memories;",
    );
    let duplicates = false;
    const issues = new Map<string, Issue>();
    for (const [n, r] of parseJsonl(tasksText, this.paths.tasksJsonl).entries()) {
      if (r._type !== undefined && r._type !== "issue") continue;
      const issue = recordToIssue(r, `${this.paths.tasksJsonl}:${n + 1}`);
      const prev = issues.get(issue.id);
      if (prev) duplicates = true;
      if (!prev || issue.updatedAt >= prev.updatedAt) issues.set(issue.id, issue);
    }
    for (const issue of issues.values()) this.insertIssue(issue);
    const memories = new Map<string, Memory>();
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
  sync(): void {
    const { hash } = this.sourceHash();
    if (hash === this.cachedHash()) return;
    this.write(() => undefined, { exportAfter: false });
  }

  /**
   * Run `fn` under an exclusive write lock. The cache is re-synced from the
   * JSONL files first if they changed; afterwards the JSONL files are
   * re-exported (unless exportAfter is false) and the new hash recorded.
   */
  write<T>(fn: () => T, opts: { exportAfter?: boolean } = {}): T {
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

  private exportJsonl(): void {
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

  insertIssue(i: Issue): void {
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
      i.externalRef ?? null,
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
        c.createdAt,
      );
    }
  }

  insertDependency(d: Dependency): void {
    this.run(
      "INSERT OR REPLACE INTO dependencies (issue_id, depends_on_id, type, created_at, created_by) VALUES (?, ?, ?, ?, ?)",
      d.issueId,
      d.dependsOnId,
      d.type,
      d.createdAt,
      d.createdBy ?? null,
    );
  }

  upsertMemory(m: Memory): void {
    this.run(
      `INSERT INTO memories (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      m.key,
      m.value,
      m.createdAt,
      m.updatedAt,
    );
  }

  /** Hydrate issue rows with labels, outgoing dependencies and comments. */
  loadIssues(rows: Row[]): Issue[] {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id as string);
    const marks = ids.map(() => "?").join(",");
    const labels = new Map<string, string[]>();
    for (const r of this.all(
      `SELECT issue_id, label FROM labels WHERE issue_id IN (${marks}) ORDER BY label`,
      ...ids,
    )) {
      const k = r.issue_id as string;
      labels.set(k, [...(labels.get(k) ?? []), r.label as string]);
    }
    const deps = new Map<string, Dependency[]>();
    for (const r of this.all(`SELECT * FROM dependencies WHERE issue_id IN (${marks})`, ...ids)) {
      const k = r.issue_id as string;
      deps.set(k, [...(deps.get(k) ?? []), rowToDependency(r)]);
    }
    const comments = new Map<string, Comment[]>();
    for (const r of this.all(
      `SELECT * FROM comments WHERE issue_id IN (${marks}) ORDER BY id`,
      ...ids,
    )) {
      const k = r.issue_id as string;
      const c: Comment = {
        id: Number(r.id),
        text: r.text as string,
        createdAt: r.created_at as string,
      };
      if (r.author) c.author = r.author as string;
      comments.set(k, [...(comments.get(k) ?? []), c]);
    }
    return rows.map((r) => {
      const issue: Issue = {
        id: r.id as string,
        title: r.title as string,
        status: r.status as Issue["status"],
        priority: Number(r.priority),
        issueType: r.issue_type as Issue["issueType"],
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
        labels: labels.get(r.id as string) ?? [],
        dependencies: deps.get(r.id as string) ?? [],
        comments: comments.get(r.id as string) ?? [],
      };
      const optional: [keyof Issue, string][] = [
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
        ["externalRef", "external_ref"],
      ];
      for (const [k, col] of optional) {
        if (r[col] != null && r[col] !== "") (issue as unknown as Row)[k] = r[col];
      }
      return issue;
    });
  }
}

function rowToDependency(r: Row): Dependency {
  const d: Dependency = {
    issueId: r.issue_id as string,
    dependsOnId: r.depends_on_id as string,
    type: r.type as Dependency["type"],
    createdAt: r.created_at as string,
  };
  if (r.created_by) d.createdBy = r.created_by as string;
  return d;
}

export function rowToMemory(r: Row): Memory {
  return {
    key: r.key as string,
    value: r.value as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}
