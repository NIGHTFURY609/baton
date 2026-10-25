// Smoke-test the plugin's exec-form hooks the way Claude Code would run them:
// `node <CLAUDE_PLUGIN_ROOT>/dist/baton.mjs hook <event>`, with the variable
// expanded to a real path (mixed separators on Windows) and to a path that
// contains a space. Runs in a throwaway temp project, never against this repo's
// .context/STATE.md. No `claude` session is started.
//
//   npm run smoke:hooks [-- --runs N] [-- --strict-timing] [-- --keep]
//   node scripts/hook-smoke.mjs --inspect-transcript <file.jsonl>
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const HANDOFF_MARKER = "generated_by: baton handoff";
const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function flagValue(name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

function inspectTranscript(file) {
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const a = rec?.attachment;
    if (rec?.type !== "attachment" || !a) continue;
    const name = typeof a.hookName === "string" ? a.hookName : "";
    if (a.hookEvent !== "SessionStart" && !name.startsWith("SessionStart")) continue;
    const body = a.content ?? a.stdout;
    out.push({
      type: a.type,
      hookName: a.hookName,
      command: a.command,
      exitCode: a.exitCode,
      durationMs: a.durationMs,
      output:
        typeof body === "string"
          ? body.slice(0, 80)
          : body === undefined
            ? undefined
            : JSON.stringify(body).slice(0, 80),
    });
  }
  console.log(JSON.stringify(out, null, 2));
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function git(cwd, ...a) {
  const r = spawnSync("git", a, { cwd, encoding: "utf8", shell: false });
  if (r.status !== 0) throw new Error(`git ${a.join(" ")} failed: ${r.stderr}`);
}

function main() {
  const transcript = flagValue("--inspect-transcript");
  if (transcript) {
    inspectTranscript(transcript);
    return 0;
  }
  if (!existsSync(join(repo, "plugin", "dist", "baton.mjs"))) {
    console.error("run npm run build first");
    return 1;
  }
  const runsArg = flagValue("--runs");
  const runs = runsArg === undefined ? 5 : Number.parseInt(runsArg, 10);
  if (!Number.isInteger(runs) || runs < 1) {
    console.error("--runs needs a positive integer");
    return 1;
  }
  const strict = args.includes("--strict-timing");
  const keep = args.includes("--keep");

  const tmp = mkdtempSync(join(tmpdir(), "baton smoke "));
  let failed = false;
  const rows = [];
  const fail = (msg) => {
    failed = true;
    console.error(`FAIL ${msg}`);
  };
  try {
    const cli = join(repo, "dist", "baton.mjs");
    const project = join(tmp, "project");
    mkdirSync(project);
    git(project, "-c", "init.defaultBranch=main", "init", "-q");
    const init = spawnSync(process.execPath, [cli, "init", "--no-hooks"], {
      cwd: project,
      encoding: "utf8",
      shell: false,
    });
    if (init.status !== 0) throw new Error(`baton init --no-hooks failed: ${init.stderr}`);
    const stateFile = join(project, ".context", "STATE.md");
    const initState = readFileSync(stateFile, "utf8");
    if (initState.includes(HANDOFF_MARKER)) {
      throw new Error(
        "STATE.md has the handoff marker after init; the write check would prove nothing",
      );
    }
    mkdirSync(join(project, "src"));
    writeFileSync(join(project, "src", "a.ts"), "export const a = 1;\n");
    writeFileSync(join(project, "package.json"), '{ "name": "smoke" }\n');
    mkdirSync(join(project, "lib"));
    writeFileSync(join(project, "lib", "b.ts"), "export const b = 1;\n");
    appendFileSync(
      join(project, ".context", "spec.md"),
      '\n## Lib\n<!-- baton: {id: smoke-lib, kind: intent, verified_at: "0123456789ab", source_paths: ["lib/**"]} -->\n\nThe lib folder.\n',
    );
    git(project, "add", "-A");
    git(
      project,
      "-c",
      "user.name=smoke",
      "-c",
      "user.email=smoke@example.invalid",
      "commit",
      "-qm",
      "init",
    );

    const pluginCopy = join(tmp, "plugin root");
    cpSync(join(repo, "plugin"), pluginCopy, { recursive: true });
    const roots = [resolve(repo, "plugin"), pluginCopy];
    const claudeConfig = join(tmp, "claude-config");
    mkdirSync(claudeConfig);

    const manifest = JSON.parse(readFileSync(join(repo, "plugin", "hooks", "hooks.json"), "utf8"));
    const extra = {
      SessionStart: { source: "startup" },
      PreCompact: { trigger: "manual" },
      SessionEnd: { reason: "other" },
      Stop: { stop_hook_active: false, last_assistant_message: "done" },
      PreToolUse: { tool_name: "Edit", tool_input: { file_path: join(project, "src", "a.ts") } },
      PostToolUse: { tool_name: "Edit", tool_input: { file_path: join(project, "src", "a.ts") } },
    };
    const budgetFor = (event) => (event === "PreToolUse" || event === "PostToolUse" ? 150 : 1000);
    const hooks = [];
    for (const [event, groups] of Object.entries(manifest.hooks)) {
      for (const group of groups) {
        for (const hook of group.hooks) hooks.push({ event, hook });
      }
    }

    const header = [`${process.platform} ${release()} node ${process.version}`];
    for (const root of roots) {
      const s = hooks.find((h) => h.event === "SessionStart");
      if (s) header.push(`SessionStart argv: ${JSON.stringify(expand(s.hook, root))}`);
    }
    console.log(header.join("\n"));

    function expand(hook, root) {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal variable Claude Code expands
      return [hook.command, ...hook.args.map((a) => a.replaceAll("${CLAUDE_PLUGIN_ROOT}", root))];
    }

    for (const root of roots) {
      for (const { event, hook } of hooks) {
        const argv = expand(hook, root);
        const input = JSON.stringify({
          hook_event_name: event,
          session_id: "smoke",
          cwd: project,
          ...extra[event],
        });
        const times = [];
        const label = `${event} (${argv[argv.length - 1]})`;
        let last;
        const writes = event === "PreCompact" || event === "SessionEnd";
        for (let i = 0; i < runs; i++) {
          // Put the post-init STATE.md back so each run must write it itself.
          if (writes) writeFileSync(stateFile, initState);
          const t0 = performance.now();
          last = spawnSync(argv[0], argv.slice(1), {
            cwd: project,
            input,
            encoding: "utf8",
            shell: false,
            env: {
              ...process.env,
              CLAUDE_PROJECT_DIR: project,
              CLAUDE_PLUGIN_ROOT: root,
              CLAUDE_CONFIG_DIR: claudeConfig,
            },
          });
          times.push(performance.now() - t0);
          if (last.status !== 0)
            fail(`${label} [${root}] run ${i + 1}: status ${last.status} ${last.error ?? ""}`);
          if (last.stderr !== "")
            fail(`${label} [${root}] run ${i + 1}: stderr ${JSON.stringify(last.stderr)}`);
          if (writes && !readFileSync(stateFile, "utf8").includes(HANDOFF_MARKER)) {
            fail(`${label} [${root}] run ${i + 1}: STATE.md lacks "${HANDOFF_MARKER}"`);
          }
        }
        const out = last.stdout ?? "";
        if (event === "SessionStart") {
          try {
            const ctx = JSON.parse(out)?.hookSpecificOutput?.additionalContext;
            if (
              typeof ctx !== "string" ||
              !ctx.startsWith("# baton mission brief") ||
              ctx.length > 10000
            ) {
              fail(
                `${label} [${root}]: additionalContext missing, wrong header or over 10000 chars`,
              );
            }
          } catch (e) {
            fail(`${label} [${root}]: stdout is not JSON (${e.message})`);
          }
        } else {
          if (out !== "")
            fail(
              `${label} [${root}]: expected empty stdout, got ${JSON.stringify(out.slice(0, 80))}`,
            );
        }
        rows.push({ check: event, root, ms: median(times), budget: budgetFor(event) });
      }
    }

    // Phase 2 cases: guard denies, preflight, notice, and a plain Bash command.
    const argvOf = (event, root) => {
      const h = hooks.find((x) => x.event === event);
      return expand(h.hook, root);
    };
    const jsonOf = (out) => {
      try {
        return JSON.parse(out)?.hookSpecificOutput ?? {};
      } catch {
        return {};
      }
    };
    const isDeny = (out) => jsonOf(out).permissionDecision === "deny";
    const cases = [
      {
        name: "deny Edit",
        event: "PreToolUse",
        tool: "Edit",
        input: { file_path: join(project, ".context", "STATE.md") },
        ok: isDeny,
      },
      {
        name: "deny Bash",
        event: "PreToolUse",
        tool: "Bash",
        input: { command: "echo x > .context/tasks.jsonl" },
        ok: isDeny,
      },
      {
        name: "deny PowerShell",
        event: "PreToolUse",
        tool: "PowerShell",
        input: { command: "Set-Content -Path .context\\STATE.md -Value x" },
        ok: isDeny,
      },
      {
        name: "preflight",
        event: "PreToolUse",
        tool: "Edit",
        input: { file_path: join(project, "package.json") },
        ok: (out) => {
          const o = jsonOf(out);
          return (
            typeof o.additionalContext === "string" &&
            o.additionalContext.startsWith("baton preflight:") &&
            o.permissionDecision === undefined
          );
        },
      },
      {
        name: "notice",
        event: "PostToolUse",
        tool: "Edit",
        input: { file_path: join(project, "lib", "b.ts") },
        ok: (out) => String(jsonOf(out).additionalContext ?? "").includes("smoke-lib"),
      },
      {
        name: "pre ordinary edit",
        event: "PreToolUse",
        tool: "Edit",
        input: { file_path: join(project, "src", "x.ts") },
        ok: (out) => out === "",
      },
      {
        name: "pre ordinary bash",
        event: "PreToolUse",
        tool: "Bash",
        input: { command: "git status" },
        ok: (out) => out === "",
      },
    ];
    for (const [rootIdx, root] of roots.entries()) {
      for (const c of cases) {
        const argv = argvOf(c.event, root);
        const times = [];
        let last;
        for (let i = 0; i < runs; i++) {
          const input = JSON.stringify({
            hook_event_name: c.event,
            // Both plugin roots share one project, and a notice fires once per session id,
            // so the id carries the root index.
            session_id: `smoke-${rootIdx}-${i}`,
            cwd: project,
            tool_name: c.tool,
            tool_input: c.input,
          });
          const t0 = performance.now();
          last = spawnSync(argv[0], argv.slice(1), {
            cwd: project,
            input,
            encoding: "utf8",
            shell: false,
            env: {
              ...process.env,
              CLAUDE_PROJECT_DIR: project,
              CLAUDE_PLUGIN_ROOT: root,
              CLAUDE_CONFIG_DIR: claudeConfig,
            },
          });
          times.push(performance.now() - t0);
          if (last.status !== 0 || last.stderr !== "") {
            fail(
              `${c.name} [${root}] run ${i + 1}: status ${last.status} stderr ${JSON.stringify(last.stderr)}`,
            );
          }
          if (!c.ok(last.stdout ?? "")) {
            fail(
              `${c.name} [${root}] run ${i + 1}: unexpected stdout ${JSON.stringify((last.stdout ?? "").slice(0, 200))}`,
            );
          }
        }
        rows.push({ check: c.name, root, ms: median(times), budget: 150 });
      }
    }

    // Real budgets on this repo (read-only apart from the git-ignored packet cache).
    for (const [name, cliArgs] of [
      ["mission", ["mission"]],
      ["handoff --dry-run", ["handoff", "--dry-run"]],
    ]) {
      const times = [];
      for (let i = 0; i < runs; i++) {
        const t0 = performance.now();
        const r = spawnSync(process.execPath, [cli, ...cliArgs], {
          cwd: repo,
          encoding: "utf8",
          shell: false,
          env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfig },
        });
        times.push(performance.now() - t0);
        if (r.status !== 0 || r.stdout.trim() === "") {
          fail(
            `${name} on repo run ${i + 1}: status ${r.status}, stdout ${r.stdout.length} chars, stderr ${r.stderr.slice(0, 200)}`,
          );
        }
      }
      rows.push({ check: name, root: "-", ms: median(times), budget: 1000 });
    }

    // Same hooks against this repo's real .context/ (full section index, real config).
    for (const [name, event, ok] of [
      ["post-tool-use on repo", "PostToolUse", () => true],
      ["pre-tool-use on repo", "PreToolUse", (out) => out === ""],
    ]) {
      const argv = argvOf(event, roots[0]);
      const times = [];
      for (let i = 0; i < runs; i++) {
        const input = JSON.stringify({
          hook_event_name: event,
          // touched.jsonl in this repo persists between invocations: a fresh id per run keeps
          // the notice path measured.
          session_id: `smoke-${process.pid}-${Date.now()}-${i}`,
          cwd: repo,
          tool_name: "Edit",
          tool_input: { file_path: join(repo, "src", "core", "drift.ts") },
        });
        const t0 = performance.now();
        const r = spawnSync(argv[0], argv.slice(1), {
          cwd: repo,
          input,
          encoding: "utf8",
          shell: false,
          env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfig },
        });
        times.push(performance.now() - t0);
        if (r.status !== 0 || r.stderr !== "" || !ok(r.stdout ?? "")) {
          fail(
            `${name} run ${i + 1}: status ${r.status}, stdout ${JSON.stringify((r.stdout ?? "").slice(0, 120))}, stderr ${JSON.stringify(r.stderr.slice(0, 200))}`,
          );
        }
      }
      rows.push({ check: name, root: "-", ms: median(times), budget: 150 });
    }

    console.log("");
    console.log("| check | plugin root | median ms | budget ms | result |");
    console.log("|---|---|---|---|---|");
    let over = false;
    for (const r of rows) {
      const isOver = r.ms > r.budget;
      if (isOver) over = true;
      console.log(
        `| ${r.check} | ${r.root} | ${r.ms.toFixed(0)} | ${r.budget} | ${isOver ? "WARN" : "ok"} |`,
      );
    }
    if (over) {
      console.error(
        strict
          ? "FAIL timing budget exceeded (--strict-timing)"
          : "WARN timing budget exceeded (warn-only)",
      );
      if (strict) failed = true;
    }
    if (keep) console.log(`kept ${tmp}`);
  } catch (e) {
    console.error(`FAIL ${e.message}`);
    failed = true;
  } finally {
    if (!keep) rmSync(tmp, { recursive: true, force: true });
  }
  return failed ? 1 : 0;
}

process.exitCode = main();
