import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TaskDb } from "../src/core/tasks/native/db.js";
import {
  computeAdaptiveLength,
  defaultPrefix,
  encodeBase36,
  generateHashId,
  nextChildNumber,
} from "../src/core/tasks/native/ids.js";
import { TaskError } from "../src/core/tasks/native/model.js";
import { deriveMemoryKey, TaskService } from "../src/core/tasks/native/service.js";
import { makeTempDir } from "./helpers/repo.js";

// ---- parity with Beads' own golden tests -----------------------------------

describe("ids (Beads parity)", () => {
  it("matches Beads' GenerateHashID vectors (internal/idgen/hash_test.go)", () => {
    const timestampNs = BigInt(Date.UTC(2024, 0, 2, 3, 4, 5, 6)) * 1_000_000n;
    const expected: Record<number, string> = {
      3: "bd-vju",
      4: "bd-8d8e",
      5: "bd-bi3tk",
      6: "bd-8bi3tk",
      7: "bd-r5sr6bm",
      8: "bd-8r5sr6bm",
    };
    for (const [length, id] of Object.entries(expected)) {
      expect(
        generateHashId({
          prefix: "bd",
          title: "Fix login",
          description: "Details",
          creator: "jira-import",
          timestampNs,
          length: Number(length),
          nonce: 0,
        }),
      ).toBe(id);
    }
  });

  it("pads and truncates base36 like Beads", () => {
    expect(encodeBase36(new Uint8Array([0]), 3)).toBe("000");
    expect(encodeBase36(new Uint8Array([255, 255]), 3)).toBe("1ekf".slice(-3));
  });

  it("grows id length with the birthday bound", () => {
    expect(computeAdaptiveLength(0)).toBe(3);
    expect(computeAdaptiveLength(100)).toBe(3);
    expect(computeAdaptiveLength(200)).toBe(4);
    expect(computeAdaptiveLength(1_000_000)).toBe(8);
  });

  it("numbers children after the highest existing one", () => {
    expect(nextChildNumber("bt-a3f", ["bt-a3f.1", "bt-a3f.3", "bt-a3f.3.1", "bt-b"])).toBe(4);
    expect(defaultPrefix("a-skills")).toBe("askills");
  });
});

describe("deriveMemoryKey (Beads parity, internal/memoryapi/memoryapi_test.go)", () => {
  it.each([
    ["always run tests with -race flag", "always-run-tests-with-race-flag"],
    ["v1.2.3 release notes", "v1-2-3-release-notes"],
    ["one two three four five six seven eight nine", "one-two-three-four-five-six-seven-eight"],
    [
      "supercalifragilisticexpialidocious antidisestablishmentarianism pneumonoultramicroscopic",
      "supercalifragilisticexpialidocious-antidisestablishmentarian",
    ],
    [
      "aaaaaaaaaaa bbbbbbbbbbb ccccccccccc ddddddddddd eeeeeeeeeee fff",
      "aaaaaaaaaaa-bbbbbbbbbbb-ccccccccccc-ddddddddddd-eeeeeeeeeee",
    ],
    ["Café naïve résumé", "caf-na-ve-r-sum"],
    ["日本語のメモ", ""],
  ])("%s", (input, want) => {
    expect(deriveMemoryKey(input)).toBe(want);
  });
});

// ---- store behaviour -------------------------------------------------------

let dir: string;
let db: TaskDb;
const open = (actor = "tester") => {
  db = new TaskDb({
    tasksJsonl: join(dir, ".context", "tasks.jsonl"),
    memoriesJsonl: join(dir, ".context", "memories.jsonl"),
    dbFile: join(dir, ".context", ".cache", "tasks.db"),
  });
  return new TaskService(db, "bt", actor);
};
const jsonl = () => readFileSync(join(dir, ".context", "tasks.jsonl"), "utf8");

beforeEach(() => {
  dir = makeTempDir("baton-tasks-");
  mkdirSync(join(dir, ".context"));
});
afterEach(() => db?.close());

describe("TaskService", () => {
  it("creates tasks with hash ids and hierarchical child ids", () => {
    const s = open();
    const epic = s.create({ title: "Epic", issueType: "epic" });
    expect(epic.id).toMatch(/^bt-[0-9a-z]{3}$/);
    const c1 = s.create({ title: "One", parent: epic.id });
    const c2 = s.create({ title: "Two", parent: epic.id });
    const g = s.create({ title: "Grand", parent: c2.id });
    expect([c1.id, c2.id, g.id]).toEqual([`${epic.id}.1`, `${epic.id}.2`, `${epic.id}.2.1`]);
    expect(c1.dependencies).toEqual([
      expect.objectContaining({ dependsOnId: epic.id, type: "parent-child" }),
    ]);
  });

  it("computes ready work: open, unblocked, not under a blocked parent, not deferred", () => {
    const s = open();
    const a = s.create({ title: "A", priority: 2 });
    const b = s.create({ title: "B", priority: 0, deps: [["blocks", a.id]] });
    const bChild = s.create({ title: "B child", parent: b.id });
    const later = s.create({ title: "Later", deferUntil: "2999-01-01T00:00:00Z" });
    const ids = () => s.ready().map((i) => i.id);
    expect(ids()).toEqual([a.id]);
    expect(s.ready({ includeDeferred: true }).map((i) => i.id)).toContain(later.id);
    expect(s.blocked().map((r) => [r.issue.id, r.blockedBy])).toEqual([
      [b.id, [a.id]],
      [bChild.id, [b.id]],
    ]);
    s.close(a.id);
    expect(ids()).toEqual([b.id, bChild.id]);
  });

  it("rejects cycles, self links and blocks within one lineage", () => {
    const s = open();
    const a = s.create({ title: "A" });
    const b = s.create({ title: "B", deps: [["blocks", a.id]] });
    expect(() => s.addDependency(a.id, b.id)).toThrow(/cycle/);
    expect(() => s.addDependency(a.id, a.id)).toThrow(/itself/);
    const child = s.create({ title: "child", parent: a.id });
    expect(() => s.addDependency(child.id, a.id, "blocks")).toThrow(/ancestor/);
    expect(() => s.addDependency(a.id, child.id, "parent-child")).toThrow(/cycle/);
    s.addDependency(a.id, b.id, "related"); // non-scheduling links may form loops
  });

  it("claims atomically and idempotently", () => {
    const s = open("alice");
    const t = s.create({ title: "T" });
    const claimed = s.claim(t.id);
    expect(claimed).toMatchObject({ status: "in_progress", assignee: "alice" });
    expect(claimed.startedAt).toBeDefined();
    expect(s.claim(t.id).updatedAt).toBe(claimed.updatedAt); // re-claim: no-op
    db.close();
    const bob = open("bob");
    expect(() => bob.claim(t.id)).toThrow(/already claimed by alice/);
    const u = bob.create({ title: "U" });
    expect(bob.claimNext()?.id).toBe(u.id);
    expect(bob.claimNext()).toBeNull();
  });

  it("refuses to close with open children or blockers unless forced", () => {
    const s = open();
    const p = s.create({ title: "P" });
    const c = s.create({ title: "C", parent: p.id });
    expect(() => s.close(p.id)).toThrow(TaskError);
    const blocker = s.create({ title: "Blocker" });
    s.addDependency(c.id, blocker.id);
    expect(() => s.close(c.id)).toThrow(/blocked by open/);
    expect(s.close(c.id, "forced", true).status).toBe("closed");
    expect(s.close(p.id, "done").closeReason).toBe("done");
    expect(s.reopen(p.id)).toMatchObject({ status: "open" });
    expect(s.get(p.id)?.closedAt).toBeUndefined();
  });

  it("keeps comments, labels and memories in sorted, minimal JSONL", () => {
    const s = open();
    const t = s.create({ title: "T", labels: ["spec:freshness", "check:npm test"] });
    s.addComment(t.id, "first");
    s.update(t.id, { addLabels: ["phase-1"], removeLabels: ["check:npm test"] });
    s.remember("Hooks must use exec form on Windows");
    const line = JSON.parse(jsonl().trim());
    expect(line).toMatchObject({
      _type: "issue",
      id: t.id,
      labels: ["phase-1", "spec:freshness"],
      comments: [{ id: 1, author: "tester", text: "first" }],
    });
    expect(line.description).toBeUndefined(); // empty fields omitted
    expect(s.recall("hooks-must-use-exec-form-on-windows")?.value).toMatch(/exec form/);
    expect(s.forget("hooks-must-use-exec-form-on-windows")).toBe(true);
  });

  it("treats the JSONL as truth: external edits and a lost cache are picked up", () => {
    const s = open();
    const t = s.create({ title: "Original" });
    writeFileSync(
      join(dir, ".context", "tasks.jsonl"),
      jsonl().replace("Original", "Edited by git"),
    );
    expect(s.get(t.id)?.title).toBe("Edited by git");
    db.close();
    const fresh = open();
    expect(fresh.list().map((i) => i.title)).toEqual(["Edited by git"]);
  });

  it("collapses duplicate ids left by a union merge (later updated_at wins)", () => {
    const s = open();
    const t = s.create({ title: "Base" });
    const rec = JSON.parse(jsonl());
    const ours = { ...rec, title: "Ours", updated_at: "2030-01-01T00:00:00.000Z" };
    const theirs = { ...rec, title: "Theirs", updated_at: "2031-01-01T00:00:00.000Z" };
    writeFileSync(
      join(dir, ".context", "tasks.jsonl"),
      `${JSON.stringify(ours)}\n${JSON.stringify(theirs)}\n`,
    );
    expect(s.get(t.id)?.title).toBe("Theirs");
    s.create({ title: "Another" }); // next write normalises the file
    expect(
      jsonl()
        .split("\n")
        .filter((l) => l.includes(t.id)),
    ).toHaveLength(1);
  });

  it("imports a Beads export, mapping what baton does not model", () => {
    const s = open();
    const exportText = [
      JSON.stringify({
        _type: "issue",
        id: "bd-1",
        title: "Pinned story",
        status: "pinned",
        priority: 1,
        issue_type: "story",
        labels: ["x"],
        dependencies: [
          { issue_id: "bd-1", depends_on_id: "bd-2", type: "waits-for" },
          { issue_id: "bd-1", depends_on_id: "bd-404", type: "blocks" },
        ],
        comments: [{ id: 7, author: "a", text: "hi", created_at: "2026-01-01T00:00:00Z" }],
      }),
      JSON.stringify({ id: "bd-2", title: "List-style line", status: "hooked" }),
      JSON.stringify({ _type: "memory", key: "k", value: "v" }),
    ].join("\n");
    const r = s.importBeads(exportText, "beads.jsonl");
    expect(r).toMatchObject({ created: 2, memories: 1, droppedDeps: ["bd-1 -> bd-404"] });
    expect(s.get("bd-1")).toMatchObject({
      status: "open",
      issueType: "feature",
      dependencies: [expect.objectContaining({ dependsOnId: "bd-2", type: "related" })],
      comments: [expect.objectContaining({ id: 7, text: "hi" })],
    });
    expect(s.get("bd-2")?.status).toBe("in_progress");
    expect(s.importBeads(exportText, "beads.jsonl").skipped).toBe(2);
  });
});
