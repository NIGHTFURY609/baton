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
    mkdirSync(join(project, "src"));
    writeFileSync(join(project, "src", "a.ts"), "export const a = 1;\n");
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
        for (let i = 0; i < runs; i++) {
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
          if (event === "PreCompact" || event === "SessionEnd") {
            const state = join(project, ".context", "STATE.md");
            const text = existsSync(state) ? readFileSync(state, "utf8") : "";
            if (!text.includes("generated_by: baton handoff")) {
              fail(`${label} [${root}]: STATE.md lacks "generated_by: baton handoff"`);
            }
          }
        }
        rows.push({ check: event, root, ms: median(times), budget: budgetFor(event) });
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
