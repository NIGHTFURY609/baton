import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli.js";
import { commitAll, makeTempDir, runGit, writeFiles } from "./helpers/repo.js";
import { isolateClaudeConfig } from "./helpers/transcript.js";

describe("/init-spec and /checkpoint through the CLI", () => {
  it("walks both command sequences with the Phase 2 fallbacks", async () => {
    isolateClaudeConfig();
    process.env.BATON_ACTOR = "tester";
    const dir = makeTempDir();
    runGit(dir, "-c", "init.defaultBranch=main", "init", "-q");

    // init
    expect((await runCli(["init", "--no-hooks"], dir)).exitCode).toBe(0);

    // write a section
    appendFileSync(
      join(dir, ".context", "spec.md"),
      '\n## Storage\n<!-- baton: {id: storage, kind: intent, verified_at: null, source_paths: ["src/db/**"]} -->\n\nOne SQLite file per user.\n',
    );
    writeFiles(dir, { "src/db/store.ts": "export const store = 1;\n" });
    commitAll(dir, "spec");

    // stamp
    const stamp = await runCli(
      ["verify-doc", "purpose", "scope", "storage", "rules-project", "rules-continuity"],
      dir,
    );
    expect(stamp.exitCode).toBe(0);
    expect(stamp.stdout.split("\n").filter((l) => l.startsWith("verified "))).toHaveLength(5);

    // check freshness
    const drift = await runCli(["drift", "--format", "json"], dir);
    expect(drift.exitCode).toBe(0);
    const { sections } = JSON.parse(drift.stdout) as {
      sections: { id: string; level: string }[];
    };
    const label = (id: string) => sections.find((s) => s.id === id)?.level;
    expect(label("purpose")).toBe("fresh");
    expect(label("scope")).toBe("fresh");
    expect(label("storage")).toBe("fresh");
    expect(label("state")).toBe("unverified");

    // init-spec's decide fallback
    const decide = await runCli(
      ["task", "create", "Decide: SQLite per user", "-t", "decision", "--spec", "storage"],
      dir,
    );
    expect(decide.exitCode).toBe(0);

    // checkpoint's verify fallback
    const created = await runCli(
      ["task", "create", "Add store", "--spec", "storage", "--check", "node -e 0", "--json"],
      dir,
    );
    expect(created.exitCode).toBe(0);
    const id = (JSON.parse(created.stdout) as { id: string }).id;
    expect((await runCli(["task", "update", id, "--claim"], dir)).exitCode).toBe(0);
    execFileSync("node", ["-e", "0"]);
    const closed = await runCli(["task", "close", id, "--reason", "check passed: node -e 0"], dir);
    expect(closed.exitCode).toBe(0);

    // handoff
    expect((await runCli(["handoff", "--reason", "manual"], dir)).exitCode).toBe(0);
    const state = readFileSync(join(dir, ".context", "STATE.md"), "utf8");
    expect(state).toContain('reason: "manual"');
    expect(state.slice(state.indexOf("## Recently closed"))).toContain("Add store");

    // gate
    expect((await runCli(["drift", "--fail-on", "stale"], dir)).exitCode).toBe(0);

    // packet
    const packet = await runCli(["mission"], dir);
    expect(packet.stdout).toContain("Decide: SQLite per user");
    expect(packet.stdout).toContain('Spec section "Storage"');
  });
});
