import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PACKET_HEADER } from "../src/core/budget.js";
import { loadConfig } from "../src/core/config.js";
import { evaluateFreshness } from "../src/core/drift.js";
import { isInjectable } from "../src/core/freshness.js";
import { buildMission, parseBudget } from "../src/core/mission.js";
import { loadSectionIndex } from "../src/core/sections.js";
import { getTask } from "../src/core/tasks/snapshot.js";
import { runCli } from "./helpers/cli.js";
import {
  commitAll,
  makeRepo,
  makeTempDir,
  REPO_ROOT,
  runGit,
  stampFixture,
  withService,
} from "./helpers/repo.js";

// spawn/spawnSync are not on mission's path today, so counting execFile covers it.
const spawned = vi.hoisted(() => ({ count: 0 }));
vi.mock("node:child_process", async (importOriginal) => {
  const { countingChildProcess } = await import("./helpers/spawn-count.js");
  return countingChildProcess(await importOriginal(), spawned);
});

const NOW = new Date("2026-10-20T00:00:00.000Z");

async function fixture(): Promise<string> {
  const root = makeRepo();
  const sha = commitAll(root, "base");
  stampFixture(root, sha.slice(0, 12));
  await withService(root, "alice", (s) => {
    const t = s.create({ title: "Add login", labels: ["spec:auth"] });
    s.claim(t.id);
  });
  commitAll(root, "stamp");
  return root;
}

const SNAPSHOT = `# baton mission brief
Project <project> at commit <sha>, generated 2026-10-20T00:00:00.000Z. Facts below come from .context/, the task store and git.

State (from .context/STATE.md):
Nothing handed off yet.

Task <task> (P2, in progress, @alice): Add login
  spec sections: auth

Freshness of .context/: 6 fresh, 0 aging, 0 stale, 0 unverified, 1 superseded.
Superseded: adr-0002 (by adr-0001).

Spec section "Authentication" (auth, .context/spec.md:3, fresh):
Users sign in with passkeys (\`src/auth/login.ts\`).

Decision ADR 0001 (accepted): Use passkeys for sign-in (.context/decisions/0001-use-passkeys.md)

More context on demand: .context/spec.md, .context/decisions/, .context/knowledge/ (topics: knowledge-windows). baton mission --task <id> prints the brief for one task.`;

describe("buildMission", () => {
  it("gathers state, task, spec, decision and freshness facts", async () => {
    const root = await fixture();
    const r = await buildMission(root, await loadConfig(root), { now: NOW });
    expect(r.text).toContain("Task bt-");
    expect(r.text).toContain("(P2, in progress, @alice): Add login");
    expect(r.text).toContain(
      'Spec section "Authentication" (auth, .context/spec.md:3, fresh):\nUsers sign in with passkeys',
    );
    expect(r.text).toContain(
      "Decision ADR 0001 (accepted): Use passkeys for sign-in (.context/decisions/0001-use-passkeys.md)",
    );
    expect(r.text).toContain("Superseded: adr-0002 (by adr-0001).");
    expect(r.text).toContain("State (from .context/STATE.md):\nNothing handed off yet.");
    expect(r.text).toContain(
      "Freshness of .context/: 6 fresh, 0 aging, 0 stale, 0 unverified, 1 superseded.",
    );
  });

  it("fixture packet snapshot", async () => {
    const root = await fixture();
    const config = await loadConfig(root);
    const r = await buildMission(root, config, { now: NOW });
    const sha12 = runGit(root, "rev-parse", "HEAD").slice(0, 12);
    const normalised = r.text
      .replaceAll(basename(root), "<project>")
      .replaceAll(sha12, "<sha>")
      .replace(/\bbt-[0-9a-z]{3,8}\b/g, "<task>");
    expect(normalised).toBe(SNAPSHOT);
  });

  it("unknown --task rejects with exit 1", async () => {
    const root = await fixture();
    await expect(
      buildMission(root, await loadConfig(root), { taskId: "bt-zzz" }),
    ).rejects.toMatchObject({ exitCode: 1 });
  });
});

describe("parseBudget", () => {
  it("parses integers and falls back", () => {
    expect(parseBudget("5000", 9000)).toBe(5000);
    expect(parseBudget(undefined, 9000)).toBe(9000);
  });

  it.each(["0", "10001", "abc", "1.5"])("rejects %s", (v) => {
    expect(() => parseBudget(v, 9000)).toThrowError(/budget must be an integer from 1 to 10000/);
    try {
      parseBudget(v, 9000);
    } catch (err) {
      expect(err).toMatchObject({ exitCode: 1 });
    }
  });
});

describe("mission command", () => {
  it("respects --budget and writes the cache", async () => {
    const root = await fixture();
    const r = await runCli(["mission", "--budget", "3000"], root);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trimEnd().length).toBeLessThanOrEqual(3000);
    const cache = join(root, ".context", ".cache");
    expect(readFileSync(join(cache, "last-packet.txt"), "utf8")).toBe(r.stdout.trimEnd());
    const json = JSON.parse(readFileSync(join(cache, "last-packet.json"), "utf8"));
    expect(json.maxChars).toBe(3000);
  });

  it("prints JSON with --format json", async () => {
    const root = await fixture();
    const r = await runCli(["mission", "--format", "json"], root);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).text.startsWith(PACKET_HEADER)).toBe(true);
  });

  it("rejects an unknown --format with exit 1", async () => {
    const root = await fixture();
    const r = await runCli(["mission", "--format", "yaml"], root);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--format/);
    expect(r.stderr).toMatch(/text, json/);
  });

  it("rejects a large budget", async () => {
    const root = await fixture();
    const r = await runCli(["mission", "--budget", "20000"], root);
    expect(r.exitCode).toBe(1);
  });

  it("needs .context/ and creates nothing without it", async () => {
    const dir = makeTempDir();
    runGit(dir, "init", "-q");
    const r = await runCli(["mission"], dir);
    expect(r.exitCode).toBe(1);
    expect(existsSync(join(dir, ".context"))).toBe(false);
  });
});

describe("dogfood: this repo's packet", () => {
  it("honours the budget and never leaks withheld bodies", async () => {
    const config = await loadConfig(REPO_ROOT);
    const r = await buildMission(REPO_ROOT, config);
    expect(r.text.length).toBeLessThanOrEqual(config.packet.maxChars);
    expect(r.chars).toBe(r.text.length);
    expect(r.text.startsWith(`${PACKET_HEADER}\n`)).toBe(true);

    if (r.blocks.find((b) => b.key === "freshness")?.kept) {
      for (const w of r.withheld) expect(r.text).toContain(w.id);
    }

    const index = await loadSectionIndex(REPO_ROOT, { lenient: true });
    const report = await evaluateFreshness(index, config);
    for (const sf of report.sections) {
      if (isInjectable(sf.result.level) || sf.section.body.length < 60) continue;
      expect(r.text).not.toContain(sf.section.body.slice(0, 60));
    }

    expect(r.taskIds.length).toBeLessThanOrEqual(config.packet.maxTasks);
    for (const id of r.taskIds) {
      expect(r.text).toContain(`Task ${id} (`);
      expect((await getTask(REPO_ROOT, config, id))?.issueType).not.toBe("epic");
    }
  });

  // Guards against per-section subprocess fan-out in buildMission (process spawn is what makes a
  // build slow on Windows). It targets fan-out that scales with the number of sections; a single
  // extra constant call can slip under the bound because of the +1 slack below.
  // The count depends on repo data, so the bound is derived from it: FIXED_SPAWNS covers the calls
  // every evaluateFreshness run makes (isGitRepo, headSha, the two ls-files calls of
  // listRepoFiles, statusLines) plus the task snapshot's own calls; each distinct verified_at
  // sha adds one changedFilesPerCommit call, and ignoredPaths adds at most one more.
  const FIXED_SPAWNS = 6;

  it("bounds subprocess calls per distinct verified_at commit, the same on every build", async () => {
    const config = await loadConfig(REPO_ROOT);
    const index = await loadSectionIndex(REPO_ROOT, { lenient: true });
    const distinctShas = new Set(
      index.sections.map((s) => s.meta.verifiedAt).filter((v): v is string => v !== null),
    ).size;
    const bound = FIXED_SPAWNS + distinctShas + 1;
    const counts: number[] = [];
    for (let i = 0; i < 2; i++) {
      const before = spawned.count;
      await buildMission(REPO_ROOT, config);
      counts.push(spawned.count - before);
    }
    expect(counts[0]).toBeLessThanOrEqual(bound);
    expect(counts[1]).toBe(counts[0]);
  });
});
