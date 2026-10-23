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

  it.each([
    ["git clone https://alice:hunter2pass@example.com/r.git", "hunter2pass"],
    ["DATABASE_URL=postgres://u:pw123456@h/db", "pw123456"],
    ['{"password":"hunter2"}', "hunter2"],
    ['{"api_key": "abcdef123456"}', "abcdef123456"],
    ["mysql --password hunter2", "hunter2"],
    ["mysql --password=hunter2", "hunter2"],
    ["tool --api-key xyz", "xyz"],
    ["curl -u alice:hunter2 https://example.com", "hunter2"],
    ["curl --user alice:hunter2 https://example.com", "hunter2"],
    ["STRIPE=sk_live_abcdefghijklmnop1234", "abcdefghijklmnop1234"],
    [`//registry:_authToken=npm_${"a".repeat(36)}`, "a".repeat(36)],
    [`NPM=npm_${"b".repeat(36)}`, "b".repeat(36)],
    ["curl -H 'Authorization: token abcdef123456'", "abcdef123456"],
    ["Authorization: Bearer abcdef123456", "abcdef123456"],
    ["Authorization: basic dXNlcjpwYXNz", "dXNlcjpwYXNz"],
    ["redis-cli -u redis://:sup3rsecret@host:6379", "sup3rsecret"],
    ["curl -uuser:pass1234 https://example.com", "pass1234"],
    ["MYSQL_PWD=hunter2 mysql -h db", "hunter2"],
  ])("redacts %s", (input, secret) => {
    const out = redactSecrets(input);
    expect(out).not.toContain(secret);
    expect(out).toContain("[redacted]");
  });

  it.each([
    ["curl -u :hunter2pass https://api.x.com", ["hunter2pass"]],
    ["git clone https://alice:p@ss/word@github.com/x.git", ["p@ss", "ss/word", "alice"]],
    ["psql postgres://u:abc@def@db:5432/x", ["abc", "def"]],
    ["curl https://opaqueTOKENvalue1234567890@github.com/o/r", ["opaqueTOKENvalue1234567890"]],
    [
      "git remote set-url origin https://github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz@github.com/o/r",
      ["github_pat_", "abcdefghijklmnopqrstuvwxyz"],
    ],
    [
      "export GH=github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz",
      ["github_pat_", "abcdefghijklmnopqrstuvwxyz"],
    ],
    [
      "curl https://oauth2:glpat-abcdefghij1234567890@gitlab.com/x",
      ["glpat-", "abcdefghij1234567890"],
    ],
    ["echo glpat-abcdefghij1234567890", ["glpat-", "abcdefghij1234567890"]],
    ["echo AIzaSyA1234567890abcdefghijklmnopqrstuvw", ["AIza", "1234567890abcdefghij"]],
    ["mysql -u root -pSuperSecret123 db", ["SuperSecret123"]],
    ["docker login -u bob -p S3cr3tPw registry", ["S3cr3tPw"]],
    ["node x --pass hunter2", ["hunter2"]],
    ["http --auth bob:pw123 x.com", ["pw123"]],
    ["aws configure set aws_secret_access_key wJalrXUtnFEMI/K7MDENG", ["wJalrXUtnFEMI"]],
    ["printf 'machine x login y password hunter2' > ~/.netrc", ["hunter2"]],
  ])("redacts the secret in %s", (input, secrets) => {
    const out = redactSecrets(input);
    for (const secret of secrets) expect(out).not.toContain(secret);
    expect(out).toContain("[redacted]");
  });

  it("keeps the shape of the commands around redacted secrets", () => {
    expect(redactSecrets("mysql -u root -pSuperSecret123 db")).toBe(
      "mysql -u root -p[redacted] db",
    );
    expect(redactSecrets("docker login -u bob -p S3cr3tPw registry")).toBe(
      "docker login -u bob -p [redacted] registry",
    );
    expect(redactSecrets("git clone https://alice:p@ss/word@github.com/x.git")).toBe(
      "git clone https://[redacted]@github.com/x.git",
    );
    expect(redactSecrets("git clone ssh://git@github.com/o/r.git")).toBe(
      "git clone ssh://[redacted]@github.com/o/r.git",
    );
  });

  it("leaves ordinary -p flags, ports and URLs alone", () => {
    expect(redactSecrets("mkdir -p out/dir")).toBe("mkdir -p out/dir");
    expect(redactSecrets("mkdir -pv out")).toBe("mkdir -pv out");
    expect(redactSecrets("docker run -p 8080:80 img")).toBe("docker run -p 8080:80 img");
    expect(redactSecrets("curl http://localhost:8080/a/b@c")).toBe(
      "curl http://localhost:8080/a/b@c",
    );
    expect(redactSecrets("git clone https://github.com/o/r.git")).toBe(
      "git clone https://github.com/o/r.git",
    );
    expect(redactSecrets("jest --passWithNoTests")).toBe("jest --passWithNoTests");
  });

  it("redactSecrets itself is bounded on long adversarial input", () => {
    const runs = [
      "-".repeat(100_000),
      "a-".repeat(50_000),
      "login ".repeat(20_000),
      "curl -x ".repeat(15_000),
      "a://".repeat(25_000),
      "x://a:".repeat(20_000),
    ];
    for (const run of runs) {
      const t0 = performance.now();
      const out = redactSecrets(run);
      expect(performance.now() - t0).toBeLessThan(1000);
      expect(out.length).toBeLessThanOrEqual(1100);
    }
  });

  it("drops, rather than leaks, a secret that sits past the scan limit", () => {
    const out = redactSecrets(`${"x ".repeat(600)}password=hunter2`);
    expect(out).not.toContain("hunter2");
    expect(out.endsWith("…")).toBe(true);
  });

  it("stays fast on pathological input", () => {
    const runs = ["-".repeat(100_000), `--${"-".repeat(100_000)}x`, "a-".repeat(50_000)];
    for (const run of runs) {
      const t0 = performance.now();
      const out = summarizeToolUse(
        { id: "1", name: "Bash", input: { command: run }, isError: false },
        "/w",
        "linux",
      );
      expect(performance.now() - t0).toBeLessThan(1000);
      expect(out.length).toBeLessThanOrEqual(90);
    }
  });

  it("does not mistake the working directory for a password", () => {
    expect(redactSecrets("cd $PWD && pwd")).toBe("cd $PWD && pwd");
    expect(redactSecrets("echo $PWD: here")).toBe("echo $PWD: here");
  });

  it("keeps the non-secret parts of redacted commands", () => {
    expect(redactSecrets("git clone https://alice:hunter2pass@example.com/r.git")).toBe(
      "git clone https://[redacted]@example.com/r.git",
    );
    expect(redactSecrets("curl -u alice:hunter2 https://example.com")).toBe(
      "curl -u alice:[redacted] https://example.com",
    );
    expect(redactSecrets("mysql --password hunter2 -h db")).toBe(
      "mysql --password [redacted] -h db",
    );
  });
});

describe("absolute paths inside Bash, Glob and Grep arguments", () => {
  const summary = (
    name: string,
    input: Record<string, unknown>,
    root: string,
    p: NodeJS.Platform,
  ) =>
    recentToolCalls(parseTranscript(toJsonl([toolUse("p", name, input)])).records, root, 1, p)[0];

  it("shortens out-of-repo Windows and POSIX paths", () => {
    const win = summary(
      "Bash",
      { command: "cat C:\\Users\\jeswi\\.aws\\credentials" },
      "c:\\work\\demo",
      "win32",
    );
    expect(win).toBe("Bash: cat …/credentials");
    expect(win).not.toContain("jeswi");
    expect(summary("Bash", { command: "cat C:/Users/jeswi/.aws/credentials" }, "/w", "linux")).toBe(
      "Bash: cat …/credentials",
    );
    expect(summary("Bash", { command: "cat /home/alice/.ssh/id_rsa" }, "/w", "linux")).toBe(
      "Bash: cat …/id_rsa",
    );
    expect(summary("Grep", { pattern: "/Users/alice/notes.md" }, "/w", "linux")).toBe(
      "Grep …/notes.md",
    );
    expect(summary("Glob", { pattern: "C:\\Users\\jeswi\\docs\\*.md" }, "/w", "linux")).toBe(
      "Glob …/*.md",
    );
  });

  it.each([
    ["cd /c/Users/jeswi/.ssh && cat id_rsa", "cd …/.ssh && cat id_rsa"],
    ["ls /mnt/c/Users/jeswi/x", "ls …/x"],
    ["type \\\\fileserver\\share\\jeswi\\secrets.txt", "type …/secrets.txt"],
    ["cat //fileserver/share/jeswi/secrets.txt", "cat …/secrets.txt"],
    ["cat file:///home/alice/x", "cat …/x"],
    ["cat file:///C:/Users/jeswi/x", "cat …/x"],
  ])("shortens %s on both platforms", (command, expected) => {
    for (const platform of ["win32", "linux"] as const) {
      const out = summary("Bash", { command }, "c:\\work\\demo", platform);
      expect(out).toBe(`Bash: ${expected}`);
      expect(out).not.toMatch(/jeswi|alice|fileserver/);
    }
  });

  it("resolves Git Bash and WSL drive paths against the root on Windows", () => {
    expect(
      summary("Bash", { command: "cat /c/work/demo/src/a.ts" }, "c:\\work\\demo", "win32"),
    ).toBe("Bash: cat src/a.ts");
    expect(
      summary("Bash", { command: "cat /mnt/c/work/demo/src/a.ts" }, "c:\\work\\demo", "win32"),
    ).toBe("Bash: cat src/a.ts");
  });

  it("shortens paths in Task and Agent descriptions", () => {
    expect(summary("Task", { description: "read C:\\Users\\jeswi\\x.txt" }, "/w", "linux")).toBe(
      "Task: read …/x.txt",
    );
    expect(summary("Agent", { description: "see /home/alice/notes" }, "/w", "linux")).toBe(
      "Agent: see …/notes",
    );
  });

  it("makes paths under the repo root relative and leaves other tokens alone", () => {
    expect(
      summary("Bash", { command: "cat C:\\Work\\Demo\\src\\a.ts" }, "c:\\work\\demo", "win32"),
    ).toBe("Bash: cat src/a.ts");
    expect(summary("Bash", { command: "ls /dev/null https://x.dev/home/y" }, "/w", "linux")).toBe(
      "Bash: ls /dev/null https://x.dev/home/y",
    );
  });
});
