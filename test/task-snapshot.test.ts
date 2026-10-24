import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigSchema, defaultConfig } from "../src/core/config.js";
import { emptySnapshot, getTask, readTaskSnapshot } from "../src/core/tasks/snapshot.js";
import { CONTEXT_FIXTURE, makeRepo, withService } from "./helpers/repo.js";

function build() {
  const root = makeRepo(CONTEXT_FIXTURE, { git: false });
  return withService(root, "alice", (s) => {
    const E = s.create({ title: "Phase 1", issueType: "epic" });
    const A = s.create({ title: "Wire hooks", priority: 1 });
    s.claim(A.id);
    const B = s.create({ title: "Write docs" });
    const C = s.create({ title: "Index sections" });
    s.close(C.id, "done");
    const D = s.create({ title: "Blocked one", deps: [["blocks", B.id]] });
    s.remember("Node 22 is required");
    return { root, E, A, B, C, D };
  });
}

const ids = (ts: { id: string }[]) => ts.map((t) => t.id);

describe("task snapshot", () => {
  it("reads in-progress, ready, blocked, closed, epics and memories", async () => {
    const { root, E, A, B, C, D } = await build();
    const snap = await readTaskSnapshot(root, defaultConfig(), { readyLimit: 5, closedLimit: 5 });
    expect(snap.backend).toBe("native");
    expect(ids(snap.inProgress)).toEqual([A.id]);
    expect(snap.inProgress[0]).toMatchObject({ assignee: "alice", status: "in_progress" });
    expect(ids(snap.ready)).toEqual([B.id]);
    expect(snap.blocked).toEqual([
      { task: expect.objectContaining({ id: D.id }), blockedBy: [B.id] },
    ]);
    expect(ids(snap.recentlyClosed)).toEqual([C.id]);
    expect(snap.recentlyClosed[0]?.closeReason).toBe("done");
    expect(snap.recentlyClosed[0]?.closedAt).toBeDefined();
    expect(ids(snap.openEpics)).toEqual([E.id]);
    expect(snap.openEpics[0]?.issueType).toBe("epic");
    expect(snap.memories).toEqual([{ key: "node-22-is-required", value: "Node 22 is required" }]);
  });

  it("orders recent closes newest first", async () => {
    const { root } = await build();
    const { C1, C2 } = await withService(root, "alice", async (s) => {
      const C1 = s.create({ title: "First close" });
      s.close(C1.id, "done");
      await new Promise((r) => setTimeout(r, 5));
      const C2 = s.create({ title: "Second close" });
      s.close(C2.id, "done");
      return { C1, C2 };
    });
    const config = defaultConfig();
    const many = await readTaskSnapshot(root, config, { readyLimit: 5, closedLimit: 5 });
    expect(ids(many.recentlyClosed).slice(0, 2)).toEqual([C2.id, C1.id]);
    const one = await readTaskSnapshot(root, config, { readyLimit: 5, closedLimit: 1 });
    expect(ids(one.recentlyClosed)).toEqual([C2.id]);
    const none = await readTaskSnapshot(root, config, { readyLimit: 5, closedLimit: 0 });
    expect(none.recentlyClosed).toEqual([]);
  });

  it("keeps in-progress epics out of inProgress", async () => {
    const { root, E, A } = await build();
    await withService(root, "alice", (s) => s.claim(E.id));
    const snap = await readTaskSnapshot(root, defaultConfig(), { readyLimit: 5, closedLimit: 5 });
    expect(ids(snap.inProgress)).toEqual([A.id]);
    expect(ids(snap.openEpics)).toEqual([E.id]);
  });

  it("none backend is empty and opens nothing", async () => {
    const root = makeRepo(CONTEXT_FIXTURE, { git: false });
    const config = ConfigSchema.parse({ tasks: { backend: "none" } });
    const snap = await readTaskSnapshot(root, config, { readyLimit: 5, closedLimit: 5 });
    expect(snap).toEqual(emptySnapshot("none"));
    expect(existsSync(join(root, ".context", ".cache", "tasks.db"))).toBe(false);
  });

  it("getTask finds a task or returns null", async () => {
    const { root, A } = await build();
    const config = defaultConfig();
    expect((await getTask(root, config, A.id))?.title).toBe("Wire hooks");
    expect(await getTask(root, config, "bt-zzz")).toBeNull();
  });
});
