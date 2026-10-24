import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { defaultConfig, loadConfig, PREFLIGHT_DEFAULTS } from "../src/core/config.js";
import { TEMPLATES } from "../src/core/templates.generated.js";
import { runHook } from "../src/hooks/dispatch.js";
import { renderPreflightContext } from "../src/hooks/pre-tool-use.js";
import { CONTEXT_FIXTURE, makeRepo, makeTempDir, REPO_ROOT, runGit } from "./helpers/repo.js";

const stdin = (o: unknown) => Readable.from([JSON.stringify(o)]);
const json = (out: { stdout: string }) => JSON.parse(out.stdout);

function call(
  root: string,
  tool_name: string,
  tool_input: unknown,
  harness: "claude" | "gemini" = "claude",
) {
  return runHook(
    "pre-tool-use",
    harness,
    stdin({
      hook_event_name: harness === "gemini" ? "BeforeTool" : "PreToolUse",
      cwd: root,
      session_id: "s1",
      tool_name,
      tool_input,
    }),
  );
}

const STATE = (root: string) => join(root, ".context", "STATE.md");
const logOf = (root: string) => join(root, ".context", ".cache", "guard.jsonl");

describe("pre-tool-use denies", () => {
  it("denies an absolute STATE.md path", async () => {
    const root = makeRepo();
    const out = await call(root, "Edit", { file_path: STATE(root) });
    expect(json(out).hookSpecificOutput.permissionDecision).toBe("deny");
    expect(json(out).hookSpecificOutput.permissionDecisionReason).toContain("baton handoff");
    expect(out.exitCode).toBe(0);
    const lines = readFileSync(logOf(root), "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] as string);
    expect(typeof entry.ts).toBe("string");
    delete entry.ts;
    expect(entry).toEqual({
      v: 1,
      event: "deny",
      session: "s1",
      tool: "Edit",
      rule: "state",
      path: ".context/STATE.md",
    });
  });

  it("denies forward-slash and Windows-case variants", async () => {
    const root = makeRepo();
    const fwd = await call(root, "Edit", { file_path: STATE(root).replace(/\\/g, "/") });
    expect(json(fwd).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it.runIf(process.platform === "win32")("denies an upper-cased root on win32", async () => {
    const root = makeRepo();
    const out = await call(root, "Edit", {
      file_path: join(root.toUpperCase(), ".context", "state.md"),
    });
    expect(json(out).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("denies shell writes", async () => {
    const root = makeRepo();
    const a = await call(root, "Bash", { command: "echo x > .context/tasks.jsonl" });
    expect(json(a).hookSpecificOutput.permissionDecisionReason).toContain("baton task");
    const b = await call(root, "PowerShell", { command: "Set-Content .context\\STATE.md x" });
    expect(json(b).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("allows ordinary edits and reads", async () => {
    const root = makeRepo();
    for (const [tool, input] of [
      ["Edit", { file_path: join(root, ".context", "spec.md") }],
      ["Edit", { file_path: join(root, "src", "auth", "login.ts") }],
      ["Bash", { command: "git add .context/tasks.jsonl" }],
      ["Read", { file_path: STATE(root) }],
    ] as const) {
      expect((await call(root, tool, input)).stdout).toBe("");
    }
  });

  it("guards decision records", async () => {
    const root = makeRepo({
      ...CONTEXT_FIXTURE,
      ".context/decisions/0003-draft.md":
        "---\nid: adr-0003\nkind: decision\nstatus: proposed\n---\n# Draft\n\nDraft.\n",
    });
    const dec = (n: string) => join(root, ".context", "decisions", n);
    const old = await call(root, "Edit", { file_path: dec("0001-use-passkeys.md") });
    expect(json(old).hookSpecificOutput.permissionDecisionReason).toContain("--supersedes 0001");
    const fresh = await call(root, "Write", { file_path: dec("0009-new.md"), content: "x" });
    expect(json(fresh).hookSpecificOutput.permissionDecisionReason).toContain("baton decide");
    const draft = dec("0003-draft.md");
    const body = await call(root, "Edit", {
      file_path: draft,
      old_string: "Draft.",
      new_string: "Better.",
    });
    expect(body.stdout).toBe("");
    for (const old_string of ["status: proposed", "proposed"]) {
      const out = await call(root, "Edit", {
        file_path: draft,
        old_string,
        new_string: old_string.replace("proposed", "accepted"),
      });
      expect(json(out).hookSpecificOutput.permissionDecision).toBe("deny");
    }
  });

  it("denies a MultiEdit of STATE.md", async () => {
    const root = makeRepo();
    const out = await call(root, "MultiEdit", {
      file_path: STATE(root),
      edits: [{ old_string: "Nothing", new_string: "Something" }],
    });
    expect(json(out).hookSpecificOutput.permissionDecisionReason).toContain("baton handoff");
  });

  it("protectState false allows", async () => {
    const root = makeRepo({
      ...CONTEXT_FIXTURE,
      ".context/config.yaml": "version: 1\nguards:\n  protectState: false\n",
    });
    const out = await call(root, "Edit", { file_path: STATE(root) });
    expect(out.stdout).toBe("");
    expect(existsSync(logOf(root))).toBe(false);
  });

  it("renders a Gemini deny", async () => {
    const root = makeRepo();
    const out = await call(root, "write_file", { file_path: STATE(root) }, "gemini");
    const parsed = json(out);
    expect(parsed.decision).toBe("deny");
    expect(typeof parsed.reason).toBe("string");
  });
});

describe("pre-tool-use preflight", () => {
  it("preflight context on a dependency file", async () => {
    const root = makeRepo();
    const out = await call(root, "Edit", { file_path: join(root, "package.json") });
    const h = json(out).hookSpecificOutput;
    expect(h.additionalContext).toMatch(
      /^baton preflight: Edit on package\.json touches a dependency or migration file/,
    );
    expect(h.additionalContext).toContain(
      'Recorded: rule rules-project "Project rules" lists package.json in source_paths.',
    );
    expect(h.permissionDecision).toBeUndefined();
  });

  it("preflight context on a dependency command", async () => {
    const root = makeRepo();
    const out = await call(root, "Bash", { command: "npm install zod" });
    expect(json(out).hookSpecificOutput.additionalContext).toMatch(
      /^baton preflight: this command adds a dependency, which changes package\.json\./,
    );
    expect((await call(root, "Bash", { command: "npm install" })).stdout).toBe("");
  });

  it("no preflight path, no context", async () => {
    const root = makeRepo({
      ...CONTEXT_FIXTURE,
      ".context/config.yaml": 'version: 1\nguards:\n  preflightPaths: ["**/migrations/**"]\n',
    });
    expect((await call(root, "Edit", { file_path: join(root, "package.json") })).stdout).toBe("");
    const m = await call(root, "Edit", { file_path: join(root, "db", "migrations", "001.sql") });
    expect(json(m).hookSpecificOutput.additionalContext).toContain("baton preflight:");
  });

  it("the template config covers migrations", async () => {
    const root = makeRepo({
      ...CONTEXT_FIXTURE,
      ".context/config.yaml": TEMPLATES["context/config.yaml"] as string,
    });
    const out = await call(root, "Edit", { file_path: join(root, "db", "migrations", "001.sql") });
    expect(json(out).hookSpecificOutput.additionalContext).toMatch(
      /^baton preflight: Edit on db\/migrations\/001\.sql/,
    );
  });

  it("defaults cover every manifest", async () => {
    const root = makeRepo({
      ...CONTEXT_FIXTURE,
      ".context/config.yaml": TEMPLATES["context/config.yaml"] as string,
    });
    const want = [...PREFLIGHT_DEFAULTS];
    for (const m of [
      "package.json",
      "requirements.txt",
      "pyproject.toml",
      "Cargo.toml",
      "go.mod",
    ]) {
      expect(want).toContain(m);
    }
    expect(defaultConfig().guards.preflightPaths).toEqual(want);
    expect((await loadConfig(root)).guards.preflightPaths).toEqual(want);
    expect((await loadConfig(REPO_ROOT)).guards.preflightPaths).toEqual(want);
  });

  it("renderPreflightContext is exact", () => {
    expect(
      renderPreflightContext({ kind: "edit", tool: "Edit", paths: ["package.json"], hits: [] }),
    ).toBe(
      [
        "baton preflight: Edit on package.json touches a dependency or migration file (guards.preflightPaths in .context/config.yaml).",
        'A new dependency or schema change is a load-bearing choice and gets a decision record first: baton decide "<title>" --preflight --paths package.json.',
        "No decision or spec section lists package.json in source_paths.",
      ].join("\n"),
    );
  });
});

describe("pre-tool-use fails open and quiet", () => {
  it("no .context/, no guard", async () => {
    const emptyTmp = makeTempDir();
    runGit(emptyTmp, "init", "-q");
    const out = await call(emptyTmp, "Edit", { file_path: join(emptyTmp, ".context", "STATE.md") });
    expect(out).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });

  it("fails open on a broken config", async () => {
    const root = makeRepo({ ...CONTEXT_FIXTURE, ".context/config.yaml": "guards: [\n" });
    const out = await call(root, "Edit", { file_path: STATE(root) });
    expect(out.stdout).toBe("");
    expect(out.exitCode).toBe(0);
    expect(out.stderr).toMatch(/^baton hook pre-tool-use:/);
  });

  it("ordinary shell commands load no config", async () => {
    const root = makeRepo({ ...CONTEXT_FIXTURE, ".context/config.yaml": "guards: [\n" });
    expect(await call(root, "Bash", { command: "ls" })).toEqual({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
  });

  it("ignores malformed input", async () => {
    const root = makeRepo();
    expect(await call(root, "Bash", { command: 42 })).toEqual({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const out = await runHook(
      "pre-tool-use",
      "claude",
      stdin({ hook_event_name: "PreToolUse", cwd: root, tool_input: {} }),
    );
    expect(out).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });
});
