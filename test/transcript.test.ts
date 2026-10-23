import { mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  claudeProjectsDir,
  encodeProjectDir,
  findProjectTranscriptDirs,
  firstTurnContextTokens,
  listSessionTranscripts,
  parseTranscript,
  readTranscriptTail,
  recentToolCalls,
  redactSecrets,
  summarizeToolUse,
  sumUsage,
  toolUses,
} from "../src/core/transcript.js";
import { makeTempDir } from "./helpers/repo.js";
import { toJsonl, toolResult, toolUse } from "./helpers/transcript.js";

const jsonl = readFileSync(new URL("./fixtures/transcript.jsonl", import.meta.url), "utf8");

describe("transcript", () => {
  const { records, malformedLines } = parseTranscript(jsonl);

  it("parses leniently", () => {
    expect(records).toHaveLength(5);
    expect(malformedLines).toBe(1);
  });

  it("de-duplicates usage repeated across content-block lines", () => {
    expect(sumUsage(records)).toEqual({
      inputTokens: 7,
      cacheCreationInputTokens: 1000,
      cacheReadInputTokens: 2000,
      outputTokens: 50,
    });
  });

  it("reports context size at the first assistant turn", () => {
    expect(firstTurnContextTokens(records)).toBe(1502);
  });

  it("encodes project dirs like Claude Code", () => {
    expect(encodeProjectDir("/home/user/work/my-repo")).toBe("-home-user-work-my-repo");
  });
});

describe("claudeProjectsDir", () => {
  it("honours CLAUDE_CONFIG_DIR and falls back to ~/.claude", () => {
    expect(claudeProjectsDir({ CLAUDE_CONFIG_DIR: "/x/cfg" }, "/home/u")).toBe(
      join("/x/cfg", "projects"),
    );
    expect(claudeProjectsDir({}, "/home/u")).toBe(join("/home/u", ".claude", "projects"));
  });
});

describe("findProjectTranscriptDirs", () => {
  const root = "C:\\Work\\Demo";

  it("finds a differently-cased project dir on Windows only", async () => {
    const p = makeTempDir();
    mkdirSync(join(p, "c--work-demo"));
    mkdirSync(join(p, "other"));
    expect(await findProjectTranscriptDirs(root, { projectsDir: p, platform: "win32" })).toEqual([
      join(p, "c--work-demo"),
    ]);
    expect(await findProjectTranscriptDirs(root, { projectsDir: p, platform: "linux" })).toEqual(
      [],
    );
  });

  it("finds an exactly-named project dir everywhere", async () => {
    const p2 = makeTempDir();
    mkdirSync(join(p2, "C--Work-Demo"));
    mkdirSync(join(p2, "other"));
    for (const platform of ["win32", "linux"] as const) {
      expect(await findProjectTranscriptDirs(root, { projectsDir: p2, platform })).toEqual([
        join(p2, "C--Work-Demo"),
      ]);
    }
    expect(
      await findProjectTranscriptDirs(root, {
        projectsDir: join(p2, "missing"),
        platform: "win32",
      }),
    ).toEqual([]);
  });
});

describe("listSessionTranscripts", () => {
  it("lists session transcripts newest first", async () => {
    const d = makeTempDir();
    writeFileSync(join(d, "a.jsonl"), "{}\n");
    const hourAgo = new Date(Date.now() - 3_600_000);
    utimesSync(join(d, "a.jsonl"), hourAgo, hourAgo);
    writeFileSync(join(d, "b.jsonl"), "{}\n");
    mkdirSync(join(d, "sub"));
    writeFileSync(join(d, "notes.txt"), "x");
    const files = await listSessionTranscripts([d]);
    expect(files.map((f) => f.sessionId)).toEqual(["b", "a"]);
    expect(files[0]?.path).toBe(join(d, "b.jsonl"));
  });
});

describe("readTranscriptTail", () => {
  it("reads only the tail", async () => {
    const d = makeTempDir();
    // Each line is exactly 100 bytes including its newline.
    const lines = ["1", "2", "3"].map((n) =>
      JSON.stringify({ type: "user", pad: n.repeat(60) }).padEnd(99, " "),
    );
    expect(lines.every((l) => l.length === 99)).toBe(true);
    const file = join(d, "s.jsonl");
    writeFileSync(file, `${lines.join("\n")}\n`);
    const tail = await readTranscriptTail(file, 150);
    expect(tail.records).toHaveLength(1);
    expect(tail.records[0]?.pad).toBe("3".repeat(60));
    expect(tail.malformedLines).toBe(0);
    expect((await readTranscriptTail(file, 100_000)).records).toHaveLength(3);
  });
});

describe("tool-call summaries", () => {
  const edit = toolUse("t1", "Edit", { file_path: "C:\\work\\demo\\src\\a.ts" });
  const records = parseTranscript(
    toJsonl([
      edit,
      toolUse("t2", "Bash", { command: "npm run check\necho done" }),
      toolResult("t2", "fail", true),
      toolUse("t3", "Read", { file_path: "/elsewhere/x.md" }),
      edit,
    ]),
  ).records;

  it("extracts tool uses, deduped, with failures marked", () => {
    const uses = toolUses(records);
    expect(uses.map((u) => [u.id, u.isError])).toEqual([
      ["t1", false],
      ["t2", true],
      ["t3", false],
    ]);
    expect(uses[0]?.timestamp).toBe("2026-10-20T10:00:00.000Z");
  });

  it("summarises tool calls", () => {
    expect(recentToolCalls(records, "c:\\work\\demo", 10, "win32")).toEqual([
      "Edit src/a.ts",
      "Bash: npm run check (failed)",
      "Read …/x.md",
    ]);
    expect(recentToolCalls(records, "c:\\work\\demo", 2, "win32")).toEqual([
      "Bash: npm run check (failed)",
      "Read …/x.md",
    ]);
  });

  it("compares the root case-sensitively off Windows", () => {
    expect(recentToolCalls(records.slice(0, 1), "c:\\work\\demo", 10, "linux")).toEqual([
      "Edit …/a.ts",
    ]);
  });

  it("cuts long commands", () => {
    const [use] = toolUses(
      parseTranscript(toJsonl([toolUse("b", "Bash", { command: "x".repeat(100) })])).records,
    );
    expect(use && summarizeToolUse(use, "/w", "linux")).toBe(`Bash: ${"x".repeat(80)}…`);
  });

  it("redacts every argument kind", () => {
    const one = (name: string, input: Record<string, unknown>) =>
      recentToolCalls(
        parseTranscript(toJsonl([toolUse("z", name, input)])).records,
        "/work/demo",
        1,
        "linux",
      )[0];
    expect(one("Grep", { pattern: "token=abc123secret" })).toBe("Grep token=[redacted]");
    expect(one("Task", { description: "use key sk-aaaaaaaaaaaaaaaaaaaa" })).toBe(
      "Task: use key [redacted]",
    );
    expect(one("Read", { file_path: "/home/u/.ssh/id_rsa" })).toBe("Read …/id_rsa");
  });
});

describe("redactSecrets", () => {
  it("redacts secrets and leaves ordinary commands alone", () => {
    const bearer = redactSecrets('curl -H "Authorization: Bearer abcdef1234567890"');
    expect(bearer).toContain("Bearer [redacted]");
    expect(bearer).not.toContain("abcdef1234567890");
    expect(redactSecrets("export GITHUB_TOKEN=ghp_aaaaaaaaaaaaaaaaaaaaaaaa")).not.toContain("ghp_");
    expect(redactSecrets("API_KEY=xyz123 npm start")).toBe("API_KEY=[redacted] npm start");
    expect(redactSecrets("npm run check")).toBe("npm run check");
  });
});
