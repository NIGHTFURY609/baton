import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/core/config.js";
import {
  gatherHandoff,
  type HandoffData,
  renderState,
  runHandoff,
  STATE_PATH,
  stripVolatile,
} from "../src/core/handoff.js";
import { stateHead } from "../src/core/mission.js";
import { loadSectionIndex } from "../src/core/sections.js";
import type { TaskSnapshot } from "../src/core/tasks/snapshot.js";
import type { Task } from "../src/core/types.js";
import { runCli } from "./helpers/cli.js";
import {
  commitAll,
  makeRepo,
  makeTempDir,
  REPO_ROOT,
  runGit,
  withService,
} from "./helpers/repo.js";
import { isolateClaudeConfig, toJsonl, toolUse } from "./helpers/transcript.js";

beforeEach(() => {
  isolateClaudeConfig();
  process.env.BATON_ACTOR = "tester";
});

const task = (t: Partial<Task> & Pick<Task, "id" | "title" | "status">): Task => ({
  specSections: [],
  ...t,
});

function reference(): HandoffData {
  const snapshot: TaskSnapshot = {
    backend: "native",
    inProgress: [
      task({
        id: "bt-1",
        title: "Wire hooks",
        status: "in_progress",
        priority: 1,
        assignee: "alice",
      }),
    ],
    ready: [task({ id: "bt-3", title: "Write docs", status: "open", priority: 2 })],
    blocked: [],
    recentlyClosed: [
      task({
        id: "bt-2",
        title: "Index sections",
        status: "closed",
        priority: 1,
        closedAt: "2026-10-19T10:00:00.000Z",
        closeReason: "done",
      }),
    ],
    openEpics: [task({ id: "bt-e", title: "Phase 1", status: "open", issueType: "epic" })],
    memories: [],
  };
  return {
    generatedAt: "2026-10-20T12:00:00.000Z",
    reason: "manual",
    git: true,
    head: "0123456789abcdef0123",
    branch: "main",
    snapshot,
    status: [" M src/a.ts", "?? notes.md"],
    diffStat: [" src/a.ts | 3 +++", " 1 file changed, 3 insertions(+)"],
    toolCalls: ["Edit src/a.ts", "Bash: npm run check"],
    sessionId: "s1",
  };
}

const EXPECTED = `---
id: state
kind: state
verified_at: "0123456789ab"
source_paths: []
generated_by: baton handoff
generated_at: 2026-10-20T12:00:00.000Z
reason: "manual"
---
# State

Last handoff: 2026-10-20T12:00:00.000Z (manual) at commit 0123456789ab on branch main.

## Summary

- Open epics: bt-e Phase 1
- Recently closed: bt-2 Index sections (2026-10-19)
- Blocked: none
- Working tree: 2 changed path(s); 1 file changed, 3 insertions(+)
- Last tool calls: Edit src/a.ts; Bash: npm run check

## In progress

- bt-1 P1 Wire hooks (@alice)

## Ready next

- bt-3 P2 Write docs

## Recently closed

- bt-2 Index sections (closed 2026-10-19: done)

## Blocked

- none

## Working tree

\`\`\`text
 M src/a.ts
?? notes.md
\`\`\`

## Diff stat

\`\`\`text
 src/a.ts | 3 +++
 1 file changed, 3 insertions(+)
\`\`\`

## Recent tool calls

From session s1 (oldest first):

- Edit src/a.ts
- Bash: npm run check
`;

describe("renderState", () => {
  it("renders the reference STATE exactly", () => {
    expect(renderState(reference())).toBe(EXPECTED);
  });

  it("ignores only volatile parts", () => {
    const a = renderState(reference());
    const later = renderState({ ...reference(), generatedAt: "2026-10-21T00:00:00.000Z" });
    expect(later).not.toBe(a);
    expect(stripVolatile(later)).toBe(stripVolatile(a));
    expect(stripVolatile(renderState({ ...reference(), reason: "pre-compact" }))).not.toBe(
      stripVolatile(a),
    );
  });

  it("caps long lists", () => {
    const status = Array.from({ length: 35 }, (_, i) => `?? f${i}.txt`);
    const text = renderState({ ...reference(), status });
    expect(text).toContain("?? f29.txt\n… 5 more\n```");
    expect(text).not.toContain("f30.txt");
    const stat = [...Array.from({ length: 40 }, (_, i) => ` f${i}.ts | 1 +`), " 40 files changed"];
    const capped = renderState({ ...reference(), diffStat: stat });
    expect(capped).toContain(" f29.ts | 1 +\n… 10 more files\n 40 files changed\n```");
    expect(capped).not.toContain("f30.ts");
  });

  it("renders blocked and reason-less closes exactly", () => {
    const d = reference();
    d.snapshot.blocked = [
      { task: task({ id: "bt-4", title: "A", status: "blocked" }), blockedBy: ["bt-3"] },
      { task: task({ id: "bt-5", title: "B", status: "blocked" }), blockedBy: ["bt-3", "bt-6"] },
    ];
    d.snapshot.recentlyClosed = [
      task({ id: "bt-2", title: "Index", status: "closed", closedAt: "2026-10-19T10:00:00.000Z" }),
    ];
    const text = renderState(d);
    expect(text).toContain("- Blocked: 2 (bt-4 by bt-3; bt-5 by bt-3, bt-6)");
    expect(text).toContain("- bt-4 A (blocked by bt-3)");
    expect(text).toContain("- bt-5 B (blocked by bt-3, bt-6)");
    expect(text).toContain("- bt-2 Index (closed 2026-10-19)\n");
  });

  it("handles no commits", () => {
    const text = renderState({ ...reference(), head: null, diffStat: [] });
    expect(text).toContain("verified_at: null\n");
    expect(text).toContain("at commit none on branch main.");
    expect(text).toContain("## Diff stat\n\n- no commits yet\n");
  });

  it("covers detached, non-git, clean and empty cases", () => {
    const detached = renderState({ ...reference(), branch: null });
    expect(detached).toContain("at commit 0123456789ab on a detached HEAD.");
    const none = renderState({
      ...reference(),
      git: false,
      head: null,
      branch: null,
      status: [],
      diffStat: [],
      toolCalls: [],
      sessionId: null,
    });
    expect(none).toContain("at commit none (not a git repository).");
    expect(none).toContain("- Working tree: not a git repository");
    expect(none).toContain("## Working tree\n\n- not a git repository\n");
    expect(none).toContain("## Diff stat\n\n- not a git repository\n");
    expect(none).toContain("- Last tool calls: none recorded");
    expect(none).toContain("## Recent tool calls\n\n- none recorded\n");
    const clean = renderState({ ...reference(), status: [], diffStat: [] });
    expect(clean).toContain("- Working tree: clean");
    expect(clean).toContain("## Working tree\n\n- clean\n");
    expect(clean).toContain("## Diff stat\n\n- no changes against HEAD\n");
  });

  it("limits summary items and tool calls to three", () => {
    const d = reference();
    d.snapshot.openEpics = ["a", "b", "c", "d", "e"].map((x) =>
      task({ id: `bt-${x}`, title: x.toUpperCase(), status: "open", issueType: "epic" }),
    );
    d.toolCalls = ["t1", "t2", "t3", "t4"];
    const text = renderState(d);
    expect(text).toContain("- Open epics: bt-a A; bt-b B; bt-c C (+2 more)");
    expect(text).toContain("- Last tool calls: t2; t3; t4");
  });

  it("stays LF", () => {
    expect(renderState(reference())).not.toContain("\r");
  });
});

async function gitFixture() {
  const root = makeRepo();
  await withService(root, "alice", (s) => {
    const a = s.create({ title: "Wire hooks", priority: 1 });
    s.claim(a.id);
    const c = s.create({ title: "Index" });
    s.close(c.id, "done");
  });
  commitAll(root, "tasks");
  writeFileSync(join(root, "src", "auth", "login.ts"), "export const login = 2;\n");
  const dir = makeTempDir("baton-transcript-");
  const transcriptPath = join(dir, "t1.jsonl");
  writeFileSync(
    transcriptPath,
    toJsonl([toolUse("u1", "Edit", { file_path: join(root, "src", "auth", "login.ts") })]),
  );
  return { root, transcriptPath };
}

describe("gatherHandoff and runHandoff", () => {
  it("gathers from git, tasks and the transcript", async () => {
    const { root, transcriptPath } = await gitFixture();
    const data = await gatherHandoff(root, await loadConfig(root), {
      reason: "manual",
      transcriptPath,
    });
    expect(data.status).toEqual([" M src/auth/login.ts"]);
    expect(data.diffStat.some((l) => l.includes("login.ts"))).toBe(true);
    expect(data.toolCalls).toEqual(["Edit src/auth/login.ts"]);
    expect(data.sessionId).toBe("t1");
    expect(data.branch).toBe("main");
    expect(data.snapshot.inProgress[0]?.title).toBe("Wire hooks");
  });

  it("writes shell commands to STATE.md as names only", async () => {
    const { root, transcriptPath } = await gitFixture();
    writeFileSync(
      transcriptPath,
      toJsonl([
        toolUse("s1", "Bash", { command: "mysql -pW@ter123 db" }),
        toolUse("s2", "Bash", { command: "curl -u user:pass https://x" }),
        toolUse("s3", "PowerShell", { command: '"x" | ConvertTo-SecureString' }),
        toolUse("s4", "Bash", { command: "zip -r a.zip f -P secret" }),
      ]),
    );
    const { text } = await runHandoff(root, await loadConfig(root), {
      reason: "manual",
      transcriptPath,
      dryRun: true,
    });
    expect(text).toContain("- Bash: mysql (+2 args)");
    expect(text).toContain("- Bash: curl (+3 args)");
    expect(text).toContain("- PowerShell: (expression) | ConvertTo-SecureString");
    expect(text).toContain("- Bash: zip (+5 args)");
    for (const secret of ["W@ter123", "user:pass", '"x"', "secret", "a.zip"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("writes, then is idempotent", async () => {
    const { root, transcriptPath } = await gitFixture();
    const config = await loadConfig(root);
    const path = join(root, STATE_PATH);
    const first = await runHandoff(root, config, {
      reason: "manual",
      transcriptPath,
      now: new Date("2026-10-20T12:00:00Z"),
    });
    expect(first.changed).toBe(true);
    expect(first.path).toBe(path);
    const bytes = readFileSync(path);
    const second = await runHandoff(root, config, {
      reason: "manual",
      transcriptPath,
      now: new Date("2026-10-20T13:00:00Z"),
    });
    expect(second.changed).toBe(false);
    expect(readFileSync(path).equals(bytes)).toBe(true);
  });

  it("excludes STATE.md from its own status", async () => {
    const { root, transcriptPath } = await gitFixture();
    const config = await loadConfig(root);
    await runHandoff(root, config, { reason: "manual", transcriptPath });
    expect(runGit(root, "status", "--porcelain")).toContain("STATE.md");
    const data = await gatherHandoff(root, config, { reason: "manual", transcriptPath });
    expect(data.status.some((l) => l.includes("STATE.md"))).toBe(false);
    expect(data.diffStat.some((l) => l.includes("STATE.md"))).toBe(false);
  });

  it("accepts a CRLF copy as unchanged", async () => {
    const { root, transcriptPath } = await gitFixture();
    const config = await loadConfig(root);
    const path = join(root, STATE_PATH);
    await runHandoff(root, config, { reason: "manual", transcriptPath });
    writeFileSync(path, readFileSync(path, "utf8").replace(/\n/g, "\r\n"));
    const again = await runHandoff(root, config, { reason: "manual", transcriptPath });
    expect(again.changed).toBe(false);
  });

  it("dry run writes nothing", async () => {
    const { root, transcriptPath } = await gitFixture();
    const path = join(root, STATE_PATH);
    const before = readFileSync(path);
    const r = await runHandoff(root, await loadConfig(root), {
      reason: "manual",
      transcriptPath,
      dryRun: true,
    });
    expect(r.changed).toBe(true);
    expect(r.text).toMatch(/^---\nid: state/);
    expect(readFileSync(path).equals(before)).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("Nothing handed off yet.");
  });

  it("the written STATE is a fresh, injectable section", async () => {
    const { root, transcriptPath } = await gitFixture();
    await runHandoff(root, await loadConfig(root), { reason: "manual", transcriptPath });
    const head = runGit(root, "rev-parse", "HEAD");
    const index = await loadSectionIndex(root);
    const state = index.byId.get("state");
    expect(state?.meta.verifiedAt).toBe(head.slice(0, 12));
    expect(stateHead(state?.body ?? "")).toMatch(/^Last handoff:/);
  });

  it("works without git", async () => {
    const root = makeRepo(undefined, { git: false });
    const data = await gatherHandoff(root, await loadConfig(root), { reason: "manual" });
    expect(data.git).toBe(false);
    expect(data.head).toBeNull();
    expect(data.branch).toBeNull();
    expect(data.status).toEqual([]);
    expect(data.diffStat).toEqual([]);
    expect(renderState(data)).toContain("(not a git repository)");
  });
});

describe("handoff command", () => {
  it("needs .context/", async () => {
    const dir = makeTempDir();
    runGit(dir, "init", "-q");
    const r = await runCli(["handoff"], dir);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("baton init");
  });

  it("prints, writes, then reports unchanged", async () => {
    const { root } = await gitFixture();
    const dry = await runCli(["handoff", "--dry-run"], root);
    expect(dry.exitCode).toBe(0);
    expect(dry.stdout.startsWith("---\nid: state")).toBe(true);
    const wrote = await runCli(["handoff", "--reason", "manual"], root);
    expect(wrote.stdout).toBe("wrote .context/STATE.md (manual)\n");
    const again = await runCli(["handoff", "--reason", "manual"], root);
    expect(again.stdout).toBe(".context/STATE.md unchanged\n");
  });

  it("is fast on this repo (dry run only, loose bound)", async () => {
    const dir = makeTempDir("baton-transcript-");
    const transcriptPath = join(dir, "perf.jsonl");
    writeFileSync(transcriptPath, toJsonl([toolUse("p1", "Bash", { command: "npm run check" })]));
    const config = await loadConfig(REPO_ROOT);
    const opts = { reason: "perf", dryRun: true, transcriptPath };
    await runHandoff(REPO_ROOT, config, opts);
    const t0 = performance.now();
    await runHandoff(REPO_ROOT, config, opts);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});
