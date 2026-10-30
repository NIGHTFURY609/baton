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
  summarizeShellCommand,
  summarizeToolUse,
  sumUsage,
  toolUses,
} from "../src/core/transcript.js";
import { BLOWUP_MS } from "./helpers/limits.js";
import { makeTempDir } from "./helpers/repo.js";
import { toJsonl, toolResult, toolUse } from "./helpers/transcript.js";

/** What handoff passes for this repo: the task id prefix and the package.json script names. */
const KNOWN = {
  taskPrefix: "bt",
  taskIds: new Set(["bt-abc", "bt-a3f", "bt-a3f.1", "bt-vyr.2", "bt-w2a", "bt-bk4"]),
  npmScripts: new Set(["check", "build", "deploy"]),
};

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
    expect(recentToolCalls(records, "c:\\work\\demo", 10, "win32", KNOWN)).toEqual([
      "Edit src/a.ts",
      "Bash: npm run check (failed)",
      "Read …/x.md",
    ]);
    expect(recentToolCalls(records, "c:\\work\\demo", 2, "win32", KNOWN)).toEqual([
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

describe("shell tool-call summaries: command names only", () => {
  const one = (name: string, command: string) =>
    recentToolCalls(
      parseTranscript(toJsonl([toolUse("s", name, { command })])).records,
      "c:\\work\\demo",
      1,
      "win32",
      KNOWN,
    )[0];

  it.each([
    ["Bash", "mysql -pW@ter123 db", "Bash: mysql (+2 args)", ["W@ter123", "ter123", "db"]],
    ["Bash", "curl -u user:pass https://x", "Bash: curl (+3 args)", ["user", "pass", "https://x"]],
    [
      "PowerShell",
      '"x" | ConvertTo-SecureString',
      "PowerShell: (expression) | ConvertTo-SecureString",
      ['"x"'],
    ],
    ["Bash", "zip -r a.zip f -P secret", "Bash: zip (+5 args)", ["secret", "a.zip"]],
    [
      "Bash",
      "API_KEY=hunter2 npm run deploy -- --token abc",
      "Bash: npm run deploy (+3 args)",
      ["hunter2", "API_KEY", "abc"],
    ],
    // PowerShell reads `API_KEY=hunter2` as an expression, so the two grammars disagree.
    [
      "run_shell_command",
      "API_KEY=hunter2 npm run deploy -- --token abc",
      "run_shell_command: (expression)",
      ["hunter2", "API_KEY", "abc"],
    ],
    [
      "Bash",
      "X=$(echo hunter2 secretword) && git push",
      "Bash: (assignment) && git push",
      ["hunter2", "secretword"],
    ],
    [
      "PowerShell",
      "New-Object PSCredential 'u', (ConvertTo-SecureString 'hunter2' -AsPlainText -Force)",
      "PowerShell: New-Object (+3 args)",
      ["hunter2", "PSCredential"],
    ],
    ["Bash", 'echo "a | hunter2 x"', "Bash: echo (+1 args)", ["hunter2"]],
    [
      "Bash",
      'git -c user.password=hunter2 commit -m "msg"',
      "Bash: git commit (+4 args)",
      ["hunter2", "msg"],
    ],
    [
      "Bash",
      "cat C:\\Users\\jeswi\\.aws\\credentials",
      "Bash: cat (+1 args)",
      ["jeswi", "credentials"],
    ],
    [
      "PowerShell",
      '[IO.File]::WriteAllText("C:\\Users\\jeswi\\k.txt", "hunter2")',
      "PowerShell: (expression)",
      ["hunter2", "jeswi", "WriteAllText"],
    ],
  ])("%s %s keeps no argument", (tool, command, expected, secrets) => {
    const out = one(tool, command);
    expect(out).toBe(expected);
    for (const secret of secrets) expect(out).not.toContain(secret);
  });

  it.each([
    ["git status", "Bash: git status"],
    ['git commit -m "x" -- a.ts', "Bash: git commit (+4 args)"],
    ["npm run check 2>&1 | tee check.log", "Bash: npm run check (+1 args) | tee (+1 args)"],
    ["npm install left-pad", "Bash: npm (+2 args)"],
    [
      'node dist/baton.mjs task close bt-vyr.2 --reason "done"',
      "Bash: baton task close bt-vyr.2 (+2 args)",
    ],
    ["baton verify bt-w2a", "Bash: baton verify bt-w2a"],
    ['node dist/baton.mjs decide "Title" --supersedes 15', "Bash: baton decide (+3 args)"],
    ["node script.js --token abc", "Bash: node (+3 args)"],
    ["C:\\tools\\rm.cmd x", "Bash: rm.cmd (+1 args)"],
    ["cd src; ls", "Bash: cd (+1 args); ls"],
    ["npm run build && node dist/baton.mjs task ready", "Bash: npm run build && baton task ready"],
  ])("summarises %s", (command, expected) => {
    expect(one("Bash", command)).toBe(expected);
  });

  it.each([
    // Escapes: Bash `\` outside single quotes and PowerShell's backtick escape the next character.
    ["Bash", 'echo "pass\\"; hunter2 x"', "Bash: echo (+1 args)"],
    ["PowerShell", 'Write-Host "a`"; hunter2 b"', "PowerShell: Write-Host (+1 args)"],
    ["Bash", "echo pass\\; hunter2 x", "Bash: echo (+3 args)"],
    ["PowerShell", "Write-Host a`; hunter2 b", "PowerShell: Write-Host (+3 args)"],
    ["Bash", "echo $'a\\'; hunter2 b'", "Bash: echo (+1 args)"],
    // The other shell's escape is not an escape: the summary of an unknown shell agrees or says nothing.
    ["run_shell_command", 'echo "pass\\"; hunter2 x"', "run_shell_command: (expression)"],
    // Groups: backtick substitution, $( ) inside double quotes, [[ ]].
    ["Bash", "echo `printf x; hunter2 y`", "Bash: echo (+1 args)"],
    ["Bash", 'echo "$(echo "; hunter2 x")"', "Bash: echo (+1 args)"],
    ["PowerShell", 'Write-Host "$(Get-Date "; hunter2 x")"', "PowerShell: Write-Host (+1 args)"],
    ["Bash", "[[ -n x && hunter2 == y ]]", "Bash: (expression)"],
    // Comments, PowerShell typographic quotes and the stop-parsing token.
    ["Bash", "echo hi # ; hunter2 x", "Bash: echo (+1 args)"],
    ["PowerShell", "Write-Host a <# ; hunter2 #> b", "PowerShell: Write-Host (+1 args)"],
    ["PowerShell", "Write-Host “a; hunter2 b”", "PowerShell: Write-Host (+1 args)"],
    ["PowerShell", "icacls x --% /grant hunter2; y", "PowerShell: icacls (+2 args)"],
    ["PowerShell", "icacls x --% /grant hunter2 | y", "PowerShell: icacls (+2 args)"],
    // git global options that take a separate value; unknown options hide the subcommand.
    ["Bash", "git --git-dir hunter commit", "Bash: git commit (+2 args)"],
    ["Bash", "git --namespace hunter push", "Bash: git push (+2 args)"],
    ["Bash", "git --work-tree hunter -C sub --no-pager status", "Bash: git status (+5 args)"],
    ["Bash", "git --frobnicate hunter push", "Bash: git (+3 args)"],
    // baton: known subcommands only, and a task id only where the command takes one.
    ["Bash", "baton remember api-key123abc", "Bash: baton remember (+1 args)"],
    ["Bash", "baton recall my-secret", "Bash: baton recall (+1 args)"],
    ["Bash", "baton task hunter", "Bash: baton task (+1 args)"],
    ["Bash", "baton hunter", "Bash: baton (+1 args)"],
    ["Bash", "baton task create my-task", "Bash: baton task create (+1 args)"],
    ["Bash", "baton verify api-key123abc", "Bash: baton verify (+1 args)"],
  ])("%s %s keeps the argument word out", (tool, command, expected) => {
    const out = one(tool, command);
    expect(out).toBe(expected);
    expect(out).not.toMatch(/hunter|api-key|secret|my-task/);
  });

  it.each([
    ["baton task show bt-a3f.1", "Bash: baton task show bt-a3f.1"],
    ["baton task comment bt-a3f hello there", "Bash: baton task comment bt-a3f (+2 args)"],
    ["baton hook session-start", "Bash: baton hook session-start"],
    ["baton hook frobnicate", "Bash: baton hook (+1 args)"],
  ])("summarises %s", (command, expected) => {
    expect(one("Bash", command)).toBe(expected);
  });

  it.each([
    ["time", "Bash: time"],
    ["sudo", "Bash: sudo"],
    ["FOO=1 BAR=2", "Bash: (assignment)"],
    ["FOO=1 time", "Bash: time"],
  ])("shows (assignment) only for environment assignments: %s", (command, expected) => {
    expect(one("Bash", command)).toBe(expected);
  });

  it("scans a bounded prefix of a huge line", () => {
    const line = Array(100_000).fill("a").join("|");
    expect(line.length).toBeGreaterThan(199_000);
    const out = summarizeShellCommand(line);
    // 1024 scanned characters; " | " between parts at most triples them.
    expect(out.length).toBeLessThanOrEqual(3 * 1024);
    expect(out.endsWith("…")).toBe(true);
  });

  // Fix round 1 (security review of bt-bk4).
  const bare = (name: string, command: string) =>
    recentToolCalls(
      parseTranscript(toJsonl([toolUse("s", name, { command })])).records,
      "c:\\work\\demo",
      1,
      "win32",
    )[0];

  it.each([
    // A task id shows only with the project's prefix (here bt).
    ["Bash", "baton verify my-secret", "Bash: baton verify (+1 args)"],
    ["Bash", "baton task show api-key123", "Bash: baton task show (+1 args)"],
    ["Bash", "baton task comment pass-word1 hi", "Bash: baton task comment (+2 args)"],
    ["Bash", "baton verify bt-my-secret", "Bash: baton verify (+1 args)"],
    [
      "Bash",
      "node dist/baton.mjs task update hunter-abc123 --claim",
      "Bash: baton task update (+2 args)",
    ],
    // `>|` and `<&` are redirections, not operators.
    ["Bash", "echo hi >| hunter2.txt", "Bash: echo (+3 args)"],
    ["Bash", "echo x >|hunter2.txt; ls", "Bash: echo (+2 args); ls"],
    ["Bash", "cat <&3 hunter2", "Bash: cat (+2 args)"],
    // PowerShell "${…}" is a brace group inside double quotes.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a PowerShell ${…} probe, not a template
    ["PowerShell", 'Write-Host "${a"; hunter2 b}"', "PowerShell: Write-Host (+1 args)"],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a PowerShell ${…} probe, not a template
    ["PowerShell", 'Write-Host "${a`}"; hunter2 b}"', "PowerShell: Write-Host (+1 args)"],
    // PowerShell has no `NAME=value cmd` prefix: the word is an expression.
    ["PowerShell", "API_KEY=x hunter2-token run", "PowerShell: (expression)"],
    ["PowerShell", "TOKEN=abc hunter2", "PowerShell: (expression)"],
    // A Bash `case` hides its patterns; inside $( ) it makes the group opaque.
    ["Bash", "case $x in a|hunter2 ) echo;; esac", "Bash: case (+1 args)"],
    ["Bash", "case $x in start) run ;; hunter2 ) x;; esac", "Bash: case (+1 args)"],
    ["Bash", 'x="$(case a in a) echo ";hunter2 y";; esac)"', "Bash: (assignment)"],
    ["Bash", "if x; then case $y in a|hunter2 ) ;; esac; fi", "Bash: if (+1 args); then (+2 args)"],
    ["Bash", "echo $(case a in a) x;; esac); hunter2 y", "Bash: echo (+1 args)"],
    // git subcommands and npm scripts come from fixed lists.
    ["Bash", "git mysecretword", "Bash: git (+1 args)"],
    ["Bash", "npm run my-api-key", "Bash: npm run (+1 args)"],
  ])("%s %s shows no argument word (review round 1)", (tool, command, expected) => {
    const out = one(tool, command);
    expect(out).toBe(expected);
    expect(out).not.toMatch(/hunter|api-key|secret|pass-word|mysecretword/);
  });

  it("shows a task id or script name only when handoff knows them", () => {
    expect(one("Bash", "baton verify bt-abc")).toBe("Bash: baton verify bt-abc");
    expect(bare("Bash", "baton verify bt-abc")).toBe("Bash: baton verify (+1 args)");
    expect(one("Bash", "npm run check")).toBe("Bash: npm run check");
    expect(bare("Bash", "npm run check")).toBe("Bash: npm run (+1 args)");
  });

  // Fix round 2 (re-review of bt-bk4).
  it.each([
    // An unquoted `case` word hides the rest of the line, whatever precedes it.
    ["Bash", "f() case $x in a|hunter2 ) echo;; esac", "Bash: (expression)"],
    ["Bash", "function f case $x in a|hunter2 ) echo;; esac", "Bash: function (+3 args)"],
    ["Bash", "coproc case $x in a|hunter2 ) echo;; esac", "Bash: coproc (+2 args)"],
    ["Bash", "time -p case $x in a|hunter2 ) echo;; esac", "Bash: (expression)"],
    ["Bash", "echo case; ls", "Bash: echo (+2 args)"],
    // A task id shows only when it is a task of the store, not just prefix-shaped.
    ["Bash", "baton verify bt-hunter2", "Bash: baton verify (+1 args)"],
    ["Bash", "baton verify bt-secret1", "Bash: baton verify (+1 args)"],
    ["Bash", "baton task close bt-hunter2 --reason x", "Bash: baton task close (+3 args)"],
  ])("%s %s shows no argument word (review round 2)", (tool, command, expected) => {
    const out = one(tool, command);
    expect(out).toBe(expected);
    expect(out).not.toMatch(/hunter|secret/);
  });

  it("shows a task id only from the known id set", () => {
    const prefixOnly = (command: string) =>
      recentToolCalls(
        parseTranscript(toJsonl([toolUse("s", "Bash", { command })])).records,
        "c:\\work\\demo",
        1,
        "win32",
        { taskPrefix: "bt" },
      )[0];
    expect(one("Bash", "baton verify bt-bk4")).toBe("Bash: baton verify bt-bk4");
    expect(prefixOnly("baton verify bt-bk4")).toBe("Bash: baton verify (+1 args)");
    expect(bare("Bash", "baton verify bt-bk4")).toBe("Bash: baton verify (+1 args)");
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
    ["java -jar t.jar -password hunter2", ["hunter2"]],
    ["tool -passwd hunter2", ["hunter2"]],
    ["openssl pkcs12 -in a.p12 -password pass:hunter2", ["hunter2"]],
    ["tool -passphrase hunter2", ["hunter2"]],
    ["keytool -storepass hunter2 -keypass hunter3", ["hunter2", "hunter3"]],
    ["tool -pwd hunter2", ["hunter2"]],
    ["tool -pw=hunter2", ["hunter2"]],
    ["openssl enc -pass hunter2", ["hunter2"]],
    ["openssl rsa -in k.pem -passin pass:hunter2", ["hunter2"]],
    ["openssl pkcs12 -export -passout pass:hunter2 -out a.p12", ["hunter2"]],
    ["openssl smime -sign -passin pass:hunter2 -in m", ["hunter2"]],
    ["openssl enc -aes256 -pass pass:hunter2 -in f", ["hunter2"]],
    ["openssl enc -aes256 -k hunter2 -in f", ["hunter2"]],
    ["mysql -pAssword hunter2", ["hunter2"]],
    ["mysql -pW@ter123 db", ["W@ter123", "ter123"]],
    ["mysql -pWd!x9z db", ["Wd!x9z", "x9z"]],
    ["mysql -pAss!123 db", ["Ass!123", "!123"]],
    ["mysql -pW.1234 db", ["W.1234", "1234"]],
    ["mysql -pW:1234 db", ["W:1234", "1234"]],
    ["mysql -pw@ter123 db", ["w@ter123", "ter123"]],
    ["mysql -pass!123 db", ["pass!123", "!123"]],
    ["openssl rsa -passin pass:'hunter2 bravo' -in k", ["hunter2", "bravo"]],
    ['openssl rsa -passin pass:"hunter2 bravo" -in k', ["hunter2", "bravo"]],
    ['echo pass:"hunter2 bravo', ["hunter2", "bravo"]],
    ["ConvertTo-SecureString -AsPlainText -Force -String 'hunter2'", ["hunter2"]],
    ["ConvertTo-SecureString -AsPlainText 'hunter2' -Force", ["hunter2"]],
    ['ConvertTo-SecureString "hunter2 bravo" -AsPlainText -Force', ["hunter2", "bravo"]],
    ["ConvertTo-SecureString -String hunter2 -AsPlainText -Force", ["hunter2"]],
    ["convertto-securestring hunter2 -AsPlainText -Force", ["hunter2"]],
    ["zip -r a.zip . -P hunter2 && grep -P x f", ["hunter2"]],
    ['mysql -p"alpha bravo charlie', ["alpha", "bravo", "charlie"]],
    ["mysql -p'alpha bravo charlie", ["alpha", "bravo", "charlie"]],
    ['tool --password "alpha bravo charlie', ["alpha", "bravo", "charlie"]],
    ["zip -r out.zip src -P hunter2", ["hunter2"]],
    ["unzip -P hunter2 out.zip", ["hunter2"]],
    ["7z a -P hunter2 out.7z src", ["hunter2"]],
    [
      "New-Object PSCredential 'u', (ConvertTo-SecureString 'hunter2' -AsPlainText -Force)",
      ["hunter2"],
    ],
    [
      "tool -Password (ConvertTo-SecureString 'hunter2' -AsPlainText -Force)",
      ["hunter2", "SecureString 'h"],
    ],
    ['mysql -p"my secret" db', ["my secret", "secret"]],
    ["mysql -p'my secret' db", ["my secret", "secret"]],
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
    expect(redactSecrets("git log -p")).toBe("git log -p");
    // The zip `-P` search stops at command separators, so a later `grep -P` keeps its pattern.
    expect(redactSecrets("zip a.zip f && grep -P foo\\d x")).toBe(
      "zip a.zip f && grep -P foo\\d x",
    );
    expect(redactSecrets("unzip a.zip | grep -P foo x")).toBe("unzip a.zip | grep -P foo x");
    expect(redactSecrets("scp -P 2222 f h:")).toBe("scp -P 2222 f h:");
    expect(redactSecrets("openssl enc -kfile k.bin -in f")).toBe("openssl enc -kfile k.bin -in f");
    expect(redactSecrets("openssl x509 -in c.pem -noout")).toBe("openssl x509 -in c.pem -noout");
    // Known gap, accepted: a password that starts with digits and then "/" reads as a port, the
    // same shape as the legitimate `localhost:5173/@vite/client`. Pinned so a change is noticed.
    expect(redactSecrets("https://u:1234/abcd@host")).toBe("https://u:1234/abcd@host");
    expect(redactSecrets("pwd")).toBe("pwd");
    expect(redactSecrets("cd src && pwd | cat")).toBe("cd src && pwd | cat");
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
      expect(performance.now() - t0).toBeLessThan(BLOWUP_MS);
      expect(out.length).toBeLessThanOrEqual(1100);
    }
  });

  it("drops, rather than leaks, a secret that sits past the scan limit", () => {
    const out = redactSecrets(`${"x ".repeat(600)}password=hunter2`);
    expect(out).not.toContain("hunter2");
    expect(out.endsWith("…")).toBe(true);
  });

  it("keeps the shape of single-dash password flags and quoted -p values", () => {
    expect(redactSecrets("java -jar t.jar -password hunter2")).toBe(
      "java -jar t.jar -password [redacted]",
    );
    expect(redactSecrets('mysql -p"my secret" db')).toBe("mysql -p[redacted] db");
    // An attached password that merely starts with "ass" is still a -p password.
    expect(redactSecrets("mysql -password123 db")).not.toContain("word123");
  });

  it("drops a token that the scan cap cut, so no fragment survives path shortening", () => {
    const cmd = `cat C:\\a\\${"x".repeat(1000)}\\f.txt ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`;
    const out = summarizeToolUse(
      { id: "1", name: "Grep", input: { pattern: cmd }, isError: false },
      "/w",
      "linux",
    );
    expect(out).not.toContain("ghp_");
    expect(out).toContain("f.txt");
    // A quote the cut leaves open still hides everything after it.
    const open = redactSecrets(
      `${"a ".repeat(500)}mysql -p"alpha bravo charlie delta echo foxtrot`,
    );
    for (const word of ["alpha", "bravo", "charlie", "delta"]) expect(open).not.toContain(word);
    // The token the cut lands in is dropped whole, with the space before it.
    expect(redactSecrets(`${"y".repeat(1023)} tail`)).toBe(`${"y".repeat(1023)}…`);
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
      expect(performance.now() - t0).toBeLessThan(BLOWUP_MS);
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

describe("absolute paths inside Glob, Grep and Task arguments", () => {
  const summary = (
    name: string,
    input: Record<string, unknown>,
    root: string,
    p: NodeJS.Platform,
  ) =>
    recentToolCalls(parseTranscript(toJsonl([toolUse("p", name, input)])).records, root, 1, p)[0];

  it("shortens out-of-repo Windows and POSIX paths", () => {
    const win = summary(
      "Task",
      { description: "cat C:\\Users\\jeswi\\.aws\\credentials" },
      "c:\\work\\demo",
      "win32",
    );
    expect(win).toBe("Task: cat …/credentials");
    expect(win).not.toContain("jeswi");
    expect(
      summary("Task", { description: "cat C:/Users/jeswi/.aws/credentials" }, "/w", "linux"),
    ).toBe("Task: cat …/credentials");
    expect(summary("Task", { description: "cat /home/alice/.ssh/id_rsa" }, "/w", "linux")).toBe(
      "Task: cat …/id_rsa",
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
  ])("shortens %s on both platforms", (description, expected) => {
    for (const platform of ["win32", "linux"] as const) {
      const out = summary("Task", { description }, "c:\\work\\demo", platform);
      expect(out).toBe(`Task: ${expected}`);
      expect(out).not.toMatch(/jeswi|alice|fileserver/);
    }
  });

  it("resolves Git Bash and WSL drive paths against the root on Windows", () => {
    expect(
      summary("Task", { description: "cat /c/work/demo/src/a.ts" }, "c:\\work\\demo", "win32"),
    ).toBe("Task: cat src/a.ts");
    expect(
      summary("Task", { description: "cat /mnt/c/work/demo/src/a.ts" }, "c:\\work\\demo", "win32"),
    ).toBe("Task: cat src/a.ts");
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
      summary("Task", { description: "cat C:\\Work\\Demo\\src\\a.ts" }, "c:\\work\\demo", "win32"),
    ).toBe("Task: cat src/a.ts");
    expect(
      summary("Task", { description: "ls /dev/null https://x.dev/home/y" }, "/w", "linux"),
    ).toBe("Task: ls /dev/null https://x.dev/home/y");
  });
});

/**
 * The security review's probe table for bt-bk4 (scratch probe-bk4.mjs and probe2.mjs), pinned
 * without known words. Where a row shows hunter2, the shell really runs it as a command.
 */
describe("shell summaries: review probe table stays pinned", () => {
  it.each([
    ["Bash", 'echo "pass\\"; hunter2 x"', "Bash: echo (+1 args)"],
    ["PowerShell", 'Write-Host "a`"; hunter2 b"', "PowerShell: Write-Host (+1 args)"],
    ["run_shell_command", 'echo "pass\\"; hunter2 x"', "run_shell_command: (expression)"],
    ["run_shell_command", 'Write-Host "a`"; hunter2 b"', "run_shell_command: Write-Host (+1 args)"],
    ["Bash", "git --git-dir hunter commit", "Bash: git commit (+2 args)"],
    ["Bash", "baton remember api-key123abc", "Bash: baton remember (+1 args)"],
    ["Bash", "baton recall my-secret", "Bash: baton recall (+1 args)"],
    ["Bash", "FOO=hunter2 cmd", "Bash: cmd"],
    ["PowerShell", '$env:TOKEN="x"; npm start', "PowerShell: (expression); npm (+1 args)"],
    ["Bash", "sudo mysql -phunter2", "Bash: mysql (+1 args)"],
    ["Bash", "env TOKEN=x node app.js", "Bash: node (+1 args)"],
    ["Bash", "mysql -pW@ter123 db", "Bash: mysql (+2 args)"],
    ["Bash", "curl -u user:pass https://x", "Bash: curl (+3 args)"],
    [
      "PowerShell",
      '"x" | ConvertTo-SecureString',
      "PowerShell: (expression) | ConvertTo-SecureString",
    ],
    ["Bash", "zip -r a.zip f -P secret", "Bash: zip (+5 args)"],
    ["Bash", 'echo "a\\\\"; hunter2 x', "Bash: echo (+1 args); hunter2 (+1 args)"],
    ["Bash", 'echo "a\\\\\\"; hunter2 x"', "Bash: echo (+1 args)"],
    ["Bash", 'echo "a\\\\\\\\"; hunter2 x', "Bash: echo (+1 args); hunter2 (+1 args)"],
    ["Bash", "echo $'a\\'b; hunter2'", "Bash: echo (+1 args)"],
    ["Bash", "echo $'a\\\\'; hunter2 x", "Bash: echo (+1 args); hunter2 (+1 args)"],
    ["Bash", "echo 'a\\'; hunter2 x", "Bash: echo (+1 args); hunter2 (+1 args)"],
    ["Bash", "cat <<EOF\nhunter2; secret\nEOF", "Bash: cat (+1 args)"],
    ["Bash", "cat <<'EOF'; hunter2 x\nbody\nEOF", "Bash: cat (+1 args); hunter2 (+1 args)"],
    ["Bash", 'cat <<< "a; hunter2"', "Bash: cat (+2 args)"],
    ["Bash", 'cmd /c "a & hunter2"', "Bash: cmd (+2 args)"],
    ["PowerShell", 'cmd /c "a & hunter2"', "PowerShell: cmd (+2 args)"],
    ["Bash", "echo `a; hunter2 x`", "Bash: echo (+1 args)"],
    ["Bash", 'echo "`a; hunter2 x`"', "Bash: echo (+1 args)"],
    ["Bash", "echo `a \\`b; hunter2\\` c`", "Bash: echo (+1 args)"],
    ["Bash", "echo a\r\nhunter2 x", "Bash: echo (+1 args)"],
    ["Bash", "echo a; ls\r\nhunter2 x", "Bash: echo (+1 args); ls"],
    ["PowerShell", "Write-Host a\rhunter2 x", "PowerShell: Write-Host (+3 args)"],
    ["Bash", "echo a\rhunter2 x", "Bash: echo (+3 args)"],
    ["Bash", 'echo "a; hunter2 \\\\\\" x', "Bash: echo (+1 args)"],
    ["Bash", 'echo "x; hunter2\\\\\\"; y', "Bash: echo (+1 args)"],
    ["Bash", 'echo "x; hunter2\\\\\\\\"; y', "Bash: echo (+1 args); y"],
    ["Bash", "echo “a; hunter2 b”", "Bash: echo (+1 args); hunter2 (+1 args)"],
    ["PowerShell", "Write-Host “a; hunter2 b”", "PowerShell: Write-Host (+1 args)"],
    ["PowerShell", "Write-Host ‘a; hunter2 b’", "PowerShell: Write-Host (+1 args)"],
    ["PowerShell", "Write-Host 'it’s'; hunter2 b'", "PowerShell: Write-Host (+1 args)"],
    ["run_shell_command", "echo “a; hunter2 b”", "run_shell_command: (expression)"],
    ["Bash", "echo hi >| hunter2.txt", "Bash: echo (+3 args)"],
    ["Bash", "cat <&3 hunter2", "Bash: cat (+2 args)"],
    ["Bash", "case $x in a|hunter2 ) echo;; esac", "Bash: case (+1 args)"],
    ["Bash", "case $x in start) run ;; hunter2 ) x;; esac", "Bash: case (+1 args)"],
    ["Bash", 'x="$(case a in a) echo ";hunter2 y";; esac)"', "Bash: (assignment)"],
    ["PowerShell", "TOKEN=abc hunter2", "PowerShell: (expression)"],
    ["Bash", "git hunter2", "Bash: git (+1 args)"],
    ["Bash", "npm run hunter2-secret", "Bash: npm run (+1 args)"],
    ["Bash", "baton verify my-secret", "Bash: baton verify (+1 args)"],
    ["Bash", "baton task show api-key123", "Bash: baton task show (+1 args)"],
    ["Bash", "baton task comment pass-word1 hello", "Bash: baton task comment (+2 args)"],
    [
      "Bash",
      "node dist/baton.mjs task update hunter-abc123 --claim",
      "Bash: baton task update (+2 args)",
    ],
    ["Bash", "baton task close bt-vyr.2 --reason x", "Bash: baton task close (+3 args)"],
    ["Bash", "git -C hunter2 status", "Bash: git status (+2 args)"],
    ["Bash", "git -c user.password=hunter2 commit -m x", "Bash: git commit (+4 args)"],
    ["Bash", "time", "Bash: time"],
    ["Bash", "FOO=1", "Bash: (assignment)"],
    ["Bash", "[[ -n x && hunter2 == y ]]", "Bash: (expression)"],
    ["Bash", "if [[ a ]]; then echo; fi", "Bash: if (+1 args); then (+1 args); fi"],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell ${…} probe, not a template
    ["Bash", "echo ${x//a;hunter2/b}", "Bash: echo (+1 args)"],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell ${…} probe, not a template
    ["PowerShell", 'Write-Host "${a"; hunter2 b}"', "PowerShell: Write-Host (+1 args)"],
    ["PowerShell", "Write-Host @'", "PowerShell: Write-Host (+1 args)"],
    ["PowerShell", "icacls x --% /grant hunter2; y", "PowerShell: icacls (+2 args)"],
    ["Bash", "echo a\\;hunter2", "Bash: echo (+1 args)"],
    ["Bash", "echo $(echo ')'; hunter2 x)", "Bash: echo (+1 args)"],
    ["Bash", "echo $( (a); hunter2 x)", "Bash: echo (+1 args)"],
    ["Bash", "a=(x; hunter2) cmd", "Bash: cmd"],
    ["Bash", "echo a |& hunter2", "Bash: echo (+1 args) | hunter2"],
    ["Bash", "echo a\u00A0;\u00A0hunter2", "Bash: echo (+1 args); hunter2"],
    ["PowerShell", "Write-Host a\u2028hunter2 x", "PowerShell: Write-Host (+3 args)"],
    ["Bash", "echo {a,b}; hunter2", "Bash: echo (+1 args); hunter2"],
    ["Bash", "echo a#b; ls", "Bash: echo (+1 args); ls"],
    ["Bash", "echo $((1|2)); ls", "Bash: echo (+1 args); ls"],
    ["Bash", "export TOKEN=hunter2", "Bash: export (+1 args)"],
    ["PowerShell", "& 'C:\\x\\hunter2.exe' a", "PowerShell: (expression)"],
    ["PowerShell", "& hunter2 a", "PowerShell: hunter2 (+1 args)"],
    ["Bash", "sudo -u hunter2 cmd", "Bash: (expression)"],
    ["Bash", "C:\\Users\\me\\secret-dir\\tool.exe arg", "Bash: tool.exe (+1 args)"],
    ["Bash", "sk-abcdefghijklmnopqrstuvwxyz arg", "Bash: [redacted] (+1 args)"],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell ${…} probe, not a template
    ["PowerShell", 'Write-Host "${a`}"; hunter2 b}"', "PowerShell: Write-Host (+1 args)"],
    [
      "run_shell_command",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell ${…} probe, not a template
      'Write-Host "${a"; hunter2 b}"',
      "run_shell_command: Write-Host (+1 args)",
    ],
    ["PowerShell", "API_KEY=x hunter2-token run", "PowerShell: (expression)"],
    ["Bash", "git mysecretword", "Bash: git (+1 args)"],
    ["Bash", "git --frobnicate hunter push", "Bash: git (+3 args)"],
    ["Bash", "npm run my-api-key", "Bash: npm run (+1 args)"],
    ["Bash", "echo $[1; hunter2]", "Bash: echo (+1 args); (expression)"],
    ["Bash", "echo x >|hunter2.txt; ls", "Bash: echo (+2 args); ls"],
    ["Bash", "baton task show bt-abc", "Bash: baton task show (+1 args)"],
    ["Bash", "baton verify bt-bk4", "Bash: baton verify (+1 args)"],
  ])("%s %j", (tool, command, expected) => {
    expect(
      summarizeToolUse(
        { id: "p", name: tool, input: { command }, isError: false },
        "c:\\work\\demo",
        "win32",
      ),
    ).toBe(expected);
  });

  it("bounds the review's long lines", () => {
    const sum = (name: string, command: string) =>
      summarizeToolUse(
        { id: "p", name, input: { command }, isError: false },
        "c:\\work\\demo",
        "win32",
      );
    expect(sum("Bash", `echo ${"x".repeat(1020)}; hunter2 b`)).toBe("Bash: echo …");
    expect(sum("Bash", `echo "${"x ".repeat(600)}"; hunter2 b`)).toBe("Bash: echo (+1 args) …");
    const big = Array(100_000).fill("a").join("|");
    expect(sum("run_shell_command", big).length).toBeLessThanOrEqual(100);
  });
});
