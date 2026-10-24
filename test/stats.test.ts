import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectStats,
  median,
  renderStats,
  type SessionMetrics,
  type StatsReport,
  summarize,
} from "../src/core/stats.js";
import { encodeProjectDir } from "../src/core/transcript.js";
import { runCli } from "./helpers/cli.js";
import { makeRepo, makeTempDir } from "./helpers/repo.js";
import { isolateClaudeConfig, toJsonl, toolUse, userPrompt } from "./helpers/transcript.js";

const ORIGINAL_CONFIG = process.env.CLAUDE_CONFIG_DIR;
afterEach(() => {
  if (ORIGINAL_CONFIG === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CONFIG;
});

function m(over: Partial<SessionMetrics> = {}): SessionMetrics {
  return {
    v: 1,
    sessionId: "s",
    source: "transcript",
    startedAt: null,
    endedAt: null,
    firstTurnContextTokens: null,
    usage: {
      inputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      outputTokens: 0,
    },
    docReads: 0,
    docReadChars: 0,
    packetInjections: 0,
    packetChars: 0,
    docTokensEstimate: 0,
    tasksClosed: [],
    corrections: 0,
    secondsToFirstEdit: null,
    hookErrors: 0,
    malformedLines: 0,
    ...over,
  };
}

const THREE = [
  m({
    sessionId: "a",
    firstTurnContextTokens: 1000,
    docTokensEstimate: 100,
    tasksClosed: ["a"],
    packetInjections: 1,
    packetChars: 120,
    corrections: 1,
    secondsToFirstEdit: 95,
    hookErrors: 1,
    startedAt: "2026-10-19T09:00:00.000Z",
  }),
  m({
    sessionId: "b",
    firstTurnContextTokens: 2000,
    docTokensEstimate: 300,
    tasksClosed: ["b"],
    startedAt: "2026-10-20T09:00:00.000Z",
  }),
  m({
    sessionId: "c",
    docTokensEstimate: 0,
    secondsToFirstEdit: 30,
    startedAt: "2026-10-20T10:00:00.000Z",
  }),
];

const EDIT_USAGE = {
  input_tokens: 1,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  output_tokens: 1,
};

function s1(): string {
  return toJsonl([
    userPrompt("hi", "2026-10-19T09:00:00.000Z"),
    toolUse("a", "Edit", { file_path: "x" }, "2026-10-19T09:00:10.000Z", EDIT_USAGE),
  ]);
}

function setup(): { root: string; projects: string; dir: string } {
  const root = makeRepo();
  const projects = makeTempDir();
  const dir = join(projects, encodeProjectDir(root));
  mkdirSync(dir, { recursive: true });
  return { root, projects, dir };
}

describe("median and summarize", () => {
  it("median handles empty, odd and even", () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2])).toBe(2);
  });

  it("summarizes three sessions", () => {
    expect(summarize(THREE, 2)).toEqual({
      sessions: 3,
      fromSnapshotsOnly: 0,
      firstDay: "2026-10-19",
      lastDay: "2026-10-20",
      startTokens: { median: 1500, mean: 1500, min: 1000, max: 2000 },
      docTokens: { total: 400, medianPerSession: 100, tasksClosed: 2, perTask: 200 },
      packet: { sessions: 1, avgChars: 120, avgTokens: 30 },
      corrections: { total: 1, perSession: 0.33 },
      secondsToFirstEdit: { median: 63 },
      hookErrors: 1,
      driftFlags: 2,
    });
  });

  it("reports nulls when there is nothing to measure", () => {
    const s = summarize([m()], 0);
    expect(s.startTokens).toBeNull();
    expect(s.secondsToFirstEdit).toBeNull();
    expect(s.docTokens.perTask).toBeNull();
    expect(s.firstDay).toBeNull();
  });
});

describe("collectStats", () => {
  it("collects, snapshots and survives deletion", async () => {
    const { root, projects, dir } = setup();
    writeFileSync(join(dir, "s1.jsonl"), s1());

    const first = await collectStats(root, { projectsDir: projects });
    expect(first.sessions).toHaveLength(1);
    expect(first.sessions[0]?.source).toBe("transcript");
    const snap = JSON.parse(readFileSync(join(root, ".context/.cache/stats/s1.json"), "utf8"));
    expect(snap.sessionId).toBe("s1");

    rmSync(join(dir, "s1.jsonl"));
    const second = await collectStats(root, { projectsDir: projects });
    expect(second.sessions).toHaveLength(1);
    expect(second.sessions[0]?.source).toBe("snapshot");
    expect(second.summary.fromSnapshotsOnly).toBe(1);
  });

  it("filters by --since", async () => {
    const { root, projects, dir } = setup();
    writeFileSync(join(dir, "s1.jsonl"), s1());
    const later = await collectStats(root, { projectsDir: projects, since: "2026-10-20" });
    expect(later.sessions).toHaveLength(0);
    const same = await collectStats(root, { projectsDir: projects, since: "2026-10-19" });
    expect(same.sessions).toHaveLength(1);
    await expect(
      collectStats(root, { projectsDir: projects, since: "20261019" }),
    ).rejects.toMatchObject({ exitCode: 1 });
  });

  it("reads one --session file", async () => {
    const { root, dir } = setup();
    const sessionPath = join(dir, "only.jsonl");
    writeFileSync(sessionPath, s1());
    const r = await collectStats(root, { sessionPath });
    expect(r.sessions).toHaveLength(1);
    expect(r.sessions[0]?.sessionId).toBe("only");
    expect(r.projectDirs).toEqual([]);
  });

  it("does not snapshot a --session file into this project's stats", async () => {
    const { root, dir } = setup();
    const sessionPath = join(dir, "foreign.jsonl");
    writeFileSync(sessionPath, s1());
    await collectStats(root, { sessionPath });
    expect(existsSync(join(root, ".context/.cache/stats/foreign.json"))).toBe(false);
  });

  it("rejects an unreadable --session path with exit 1", async () => {
    const { root, dir } = setup();
    const sessionPath = join(dir, "missing.jsonl");
    await expect(collectStats(root, { sessionPath })).rejects.toMatchObject({
      exitCode: 1,
      message: `cannot read ${sessionPath}`,
    });
    isolateClaudeConfig();
    const res = await runCli(["stats", "--session", sessionPath], root);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toBe(`baton: cannot read ${sessionPath}\n`);
  });

  it("works without .context/", async () => {
    const bare = makeTempDir();
    const projects = makeTempDir();
    const dir = join(projects, encodeProjectDir(bare));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "s1.jsonl"), s1());
    const r = await collectStats(bare, { projectsDir: projects });
    expect(r.sessions).toHaveLength(1);
    expect(existsSync(join(bare, ".context"))).toBe(false);
  });

  it("skips unparsable and foreign-version snapshots", async () => {
    const { root, projects } = setup();
    const stats = join(root, ".context/.cache/stats");
    mkdirSync(stats, { recursive: true });
    writeFileSync(join(stats, "bad.json"), "{not json");
    writeFileSync(join(stats, "v2.json"), JSON.stringify({ ...m({ sessionId: "v2" }), v: 2 }));
    writeFileSync(join(stats, "ok.json"), JSON.stringify(m({ sessionId: "ok" })));
    const r = await collectStats(root, { projectsDir: projects });
    expect(r.sessions.map((s) => s.sessionId)).toEqual(["ok"]);
    expect(r.sessions[0]?.source).toBe("snapshot");
  });

  it("counts drift flags", async () => {
    const { root, projects } = setup();
    const lines = [
      { v: 1, ts: "t", event: "flag", id: "x" },
      { v: 1, ts: "t", event: "flag", id: "y" },
      { v: 1, ts: "t", event: "verified", id: "x" },
    ];
    mkdirSync(join(root, ".context/.cache"), { recursive: true });
    writeFileSync(
      join(root, ".context/.cache/drift.jsonl"),
      `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`,
    );
    const r = await collectStats(root, { projectsDir: projects });
    expect(r.summary.driftFlags).toBe(2);
  });
});

describe("renderStats", () => {
  it("says so when there are no sessions", () => {
    const r: StatsReport = { projectDirs: [], sessions: [], summary: summarize([], 0) };
    expect(renderStats(r)).toMatch(/^no sessions found \(looked in: none\)/);
  });

  it("renders the summary lines", () => {
    const r: StatsReport = { projectDirs: ["/p"], sessions: THREE, summary: summarize(THREE, 2) };
    const out = renderStats(r);
    expect(out).toContain("sessions: 3 (2026-10-19 to 2026-10-20; 0 from snapshots only)");
    expect(out).toContain(
      "tokens at session start: median 1,500 · mean 1,500 · min 1,000 · max 2,000",
    );
    expect(out).toContain(
      "doc tokens (estimate, chars/4): total 400 · median per session 100 · per closed task 200 (2 tasks closed)",
    );
    expect(out).toContain("baton packet: injected in 1 session(s), avg 120 chars (~30 tokens)");
    expect(out).toContain("corrections (keyword heuristic): 1 total, 0.33 per session");
    expect(out).toContain("time to first edit: median 63 s");
    expect(out).toContain("hook errors (baton): 1");
    expect(out).toContain("drift flags logged: 2");
  });

  it("renders the no-data variants", () => {
    const ms = [m({ startedAt: "2026-10-19T09:00:00.000Z" })];
    const out = renderStats({ projectDirs: [], sessions: ms, summary: summarize(ms, 0) });
    expect(out).toContain("tokens at session start: no data");
    expect(out).toContain("per closed task n/a (0 tasks closed)");
    expect(out).toContain("baton packet: not seen in any session");
    expect(out).toContain("time to first edit: no edits");
  });
});

describe("stats command", () => {
  it("prints json for the project's transcripts and a message when empty", async () => {
    const root = makeRepo();
    const cfg = isolateClaudeConfig();
    const dir = join(cfg, "projects", encodeProjectDir(root));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "s1.jsonl"), s1());

    const res = await runCli(["stats", "--format", "json"], root);
    expect(res.exitCode).toBe(0);
    expect(JSON.parse(res.stdout).sessions).toHaveLength(1);

    isolateClaudeConfig();
    const empty = await runCli(["stats"], makeRepo());
    expect(empty.exitCode).toBe(0);
    expect(empty.stdout).toContain("no sessions found");
  });

  it("rejects a bad --since with exit 1", async () => {
    isolateClaudeConfig();
    const res = await runCli(["stats", "--since", "nope"], makeTempDir());
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("since must be YYYY-MM-DD");
  });
});
