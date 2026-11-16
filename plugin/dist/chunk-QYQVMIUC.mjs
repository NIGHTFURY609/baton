#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);

// src/core/tasks/native/jsonl.ts
import { createHash } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";

// src/core/tasks/native/model.ts
var STATUSES = ["open", "in_progress", "blocked", "deferred", "closed"];
var ISSUE_TYPES = [
  "task",
  "bug",
  "feature",
  "epic",
  "chore",
  "spike",
  "decision"
];
var DEP_TYPES = ["blocks", "parent-child", "related", "discovered-from"];
var MIN_PRIORITY = 0;
var MAX_PRIORITY = 4;
var DEFAULT_PRIORITY = 2;
var MAX_TITLE_LENGTH = 500;
var MAX_CHILD_DEPTH = 3;
var TaskError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "TaskError";
  }
  code;
};
function isStatus(v) {
  return typeof v === "string" && STATUSES.includes(v);
}
function isIssueType(v) {
  return typeof v === "string" && ISSUE_TYPES.includes(v);
}
function isDepType(v) {
  return typeof v === "string" && DEP_TYPES.includes(v);
}
function validateTitle(title) {
  const t = title.trim();
  if (!t) throw new TaskError("title is required", "invalid");
  if (t.length > MAX_TITLE_LENGTH) {
    throw new TaskError(`title is longer than ${MAX_TITLE_LENGTH} characters`, "invalid");
  }
  return t;
}
function validatePriority(p) {
  if (!Number.isInteger(p) || p < MIN_PRIORITY || p > MAX_PRIORITY) {
    throw new TaskError(`priority must be an integer ${MIN_PRIORITY}-${MAX_PRIORITY}`, "invalid");
  }
  return p;
}
function parsePriority(input) {
  return validatePriority(Number(input.replace(/^p/i, "")));
}
function validateLabel(label) {
  const l = label.trim();
  if (!l || /[\r\n]/.test(l) || l.length > 200)
    throw new TaskError(`invalid label "${label}"`, "invalid");
  return l;
}

// src/core/tasks/native/jsonl.ts
var str = (v) => typeof v === "string" && v !== "" ? v : void 0;
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === void 0 || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}
function issueToRecord(i) {
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
    dependencies: [...i.dependencies].sort((a, b) => a.dependsOnId.localeCompare(b.dependsOnId)).map(
      (d) => compact({
        issue_id: d.issueId,
        depends_on_id: d.dependsOnId,
        type: d.type,
        created_at: d.createdAt,
        created_by: d.createdBy
      })
    ),
    comments: i.comments.map(
      (c) => compact({ id: c.id, author: c.author, text: c.text, created_at: c.createdAt })
    )
  });
}
function recordToIssue(r, where, lenient = false) {
  const id = str(r.id);
  const title = str(r.title);
  if (!id || !title) throw new TaskError(`${where}: issue needs id and title`, "invalid");
  let status = r.status ?? "open";
  if (!isStatus(status)) {
    if (!lenient) throw new TaskError(`${where}: unknown status ${String(status)}`, "invalid");
    status = status === "hooked" ? "in_progress" : "open";
  }
  let issueType = r.issue_type ?? r.type ?? "task";
  if (!isIssueType(issueType)) {
    if (!lenient) throw new TaskError(`${where}: unknown type ${String(issueType)}`, "invalid");
    issueType = issueType === "story" ? "feature" : issueType === "milestone" ? "epic" : "task";
  }
  const priority = typeof r.priority === "number" ? r.priority : 2;
  const now = (/* @__PURE__ */ new Date(0)).toISOString();
  const dependencies = [];
  for (const d of Array.isArray(r.dependencies) ? r.dependencies : []) {
    const target = str(d.depends_on_id);
    if (!target) continue;
    const rawType = d.type ?? "blocks";
    let type;
    if (isDepType(rawType)) type = rawType;
    else if (lenient) type = "related";
    else throw new TaskError(`${where}: unknown dependency ${String(rawType)}`, "invalid");
    const dep = {
      issueId: id,
      dependsOnId: target,
      type,
      createdAt: str(d.created_at) ?? now
    };
    const by = str(d.created_by);
    if (by) dep.createdBy = by;
    dependencies.push(dep);
  }
  const comments = [];
  let seq = 0;
  for (const c of Array.isArray(r.comments) ? r.comments : []) {
    const text = str(c.text);
    if (!text) continue;
    seq = typeof c.id === "number" ? c.id : seq + 1;
    const comment = { id: seq, text, createdAt: str(c.created_at) ?? now };
    const author = str(c.author);
    if (author) comment.author = author;
    comments.push(comment);
  }
  const issue = {
    id,
    title,
    status,
    priority: Math.min(4, Math.max(0, Math.trunc(priority))),
    issueType,
    createdAt: str(r.created_at) ?? now,
    updatedAt: str(r.updated_at) ?? str(r.created_at) ?? now,
    labels: Array.isArray(r.labels) ? r.labels.filter((l) => typeof l === "string") : [],
    dependencies,
    comments
  };
  const optional = [
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
    ["externalRef", r.external_ref]
  ];
  for (const [k, v] of optional) {
    const s = str(v);
    if (s) issue[k] = s;
  }
  return issue;
}
function memoryToRecord(m) {
  return {
    _type: "memory",
    key: m.key,
    value: m.value,
    created_at: m.createdAt,
    updated_at: m.updatedAt
  };
}
function recordToMemory(r, where) {
  const key = str(r.key);
  const value = str(r.value);
  if (!key || value === void 0)
    throw new TaskError(`${where}: memory needs key and value`, "invalid");
  const now = (/* @__PURE__ */ new Date(0)).toISOString();
  return {
    key,
    value,
    createdAt: str(r.created_at) ?? now,
    updatedAt: str(r.updated_at) ?? str(r.created_at) ?? now
  };
}
function parseJsonl(text, file) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let v;
    try {
      v = JSON.parse(line);
    } catch {
      throw new TaskError(`${file}:${i + 1}: invalid JSON`, "invalid");
    }
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      throw new TaskError(`${file}:${i + 1}: expected a JSON object`, "invalid");
    }
    out.push(v);
  });
  return out;
}
function serializeJsonl(records) {
  return records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
}
function readTextOrEmpty(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return "";
    throw err;
  }
}
function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}
function writeFileAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text, "utf8");
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmp, path);
      return;
    } catch (err) {
      const code = err.code;
      if (code !== "EPERM" && code !== "EBUSY" || attempt >= 20) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
}

// src/core/tasks/native/ids.ts
import { createHash as createHash2 } from "crypto";
var BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
function encodeBase36(data, length) {
  let num = 0n;
  for (const byte of data) num = num << 8n | BigInt(byte);
  let out = "";
  while (num > 0n) {
    out = BASE36[Number(num % 36n)] + out;
    num /= 36n;
  }
  out = out.padStart(length, "0");
  return out.length > length ? out.slice(out.length - length) : out;
}
function bytesForLength(length) {
  switch (length) {
    case 3:
      return 2;
    case 4:
      return 3;
    case 5:
    case 6:
      return 4;
    case 7:
    case 8:
      return 5;
    default:
      return 3;
  }
}
function generateHashId(i) {
  const content = `${i.title}|${i.description}|${i.creator}|${i.timestampNs}|${i.nonce}`;
  const digest = createHash2("sha256").update(content).digest();
  return `${i.prefix}-${encodeBase36(digest.subarray(0, bytesForLength(i.length)), i.length)}`;
}
var DEFAULT_ADAPTIVE_ID = {
  maxCollisionProbability: 0.25,
  minLength: 3,
  maxLength: 8
};
function computeAdaptiveLength(numIssues, cfg = DEFAULT_ADAPTIVE_ID) {
  for (let length = cfg.minLength; length <= cfg.maxLength; length++) {
    const total = 36 ** length;
    const prob = 1 - Math.exp(-(numIssues * numIssues) / (2 * total));
    if (prob <= cfg.maxCollisionProbability) return length;
  }
  return cfg.maxLength;
}
function generateUniqueId(input, topLevelCount, exists) {
  const base = computeAdaptiveLength(topLevelCount);
  for (let length = base; length <= DEFAULT_ADAPTIVE_ID.maxLength; length++) {
    for (let nonce = 0; nonce < 10; nonce++) {
      const id = generateHashId({ ...input, length, nonce });
      if (!exists(id)) return id;
    }
  }
  throw new TaskError("could not generate a unique id; try again", "conflict");
}
function childId(parentId, n) {
  const depth = (parentId.match(/\./g) ?? []).length;
  if (depth >= MAX_CHILD_DEPTH) {
    throw new TaskError(
      `cannot nest deeper than ${MAX_CHILD_DEPTH} levels under ${parentId}`,
      "invalid"
    );
  }
  return `${parentId}.${n}`;
}
function nextChildNumber(parentId, existingIds) {
  const prefix = `${parentId}.`;
  let max = 0;
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length).split(".")[0]);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max + 1;
}
var TASK_ID = new RegExp(
  `^([a-z0-9]+(?:-[a-z0-9]+)*)-[0-9a-z]{3,8}(?:\\.[1-9]\\d{0,5}){0,${MAX_CHILD_DEPTH}}$`
);
function isTaskIdShape(s, prefix) {
  const m = TASK_ID.exec(s);
  if (m === null) return false;
  const p = m[1] ?? "";
  return prefix === void 0 ? p.length <= 16 : p === prefix;
}
function defaultPrefix(folderName) {
  const p = folderName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  return p || "task";
}
function nowNs() {
  return BigInt(Date.now()) * 1000000n + process.hrtime.bigint() % 1000000n;
}

export {
  ISSUE_TYPES,
  DEP_TYPES,
  DEFAULT_PRIORITY,
  TaskError,
  isStatus,
  isIssueType,
  isDepType,
  validateTitle,
  validatePriority,
  parsePriority,
  validateLabel,
  issueToRecord,
  recordToIssue,
  memoryToRecord,
  recordToMemory,
  parseJsonl,
  serializeJsonl,
  readTextOrEmpty,
  sha256,
  writeFileAtomic,
  generateUniqueId,
  childId,
  nextChildNumber,
  isTaskIdShape,
  defaultPrefix,
  nowNs
};
//# sourceMappingURL=chunk-QYQVMIUC.mjs.map