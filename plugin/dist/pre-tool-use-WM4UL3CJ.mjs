#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  SHELL_TOOLS,
  checkToolCall,
  dependencyManifests,
  editTargets,
  shellCommandOf,
  toRepoTarget
} from "./chunk-CRMTXFK4.mjs";
import {
  matchesAny
} from "./chunk-POYJG6UX.mjs";
import {
  statusOf
} from "./chunk-5VA3OZXQ.mjs";
import "./chunk-YXJRO53B.mjs";
import {
  contextPath
} from "./chunk-HVIRJWHJ.mjs";
import "./chunk-UC4Y6CAD.mjs";

// src/hooks/pre-tool-use.ts
import { existsSync, readFileSync } from "fs";
import { appendFile, mkdir } from "fs/promises";
import { join } from "path";
var GUARD_LOG = "guard.jsonl";
var MAX_LISTED_HITS = 5;
function readAdrState(absPath) {
  const exists = existsSync(absPath);
  if (!exists) return { exists, status: null };
  try {
    return { exists, status: statusOf(readFileSync(absPath, "utf8")) };
  } catch {
    return { exists, status: null };
  }
}
function matchesPreflight(repoPath, globs, platform = process.platform) {
  if (platform === "win32") {
    return matchesAny(
      repoPath.toLowerCase(),
      globs.map((g) => g.toLowerCase())
    );
  }
  return matchesAny(repoPath, globs);
}
function renderPreflightContext(opts) {
  const list = opts.paths.join(", ");
  const lines = [
    opts.kind === "edit" ? `baton preflight: ${opts.tool} on ${list} touches a dependency or migration file (guards.preflightPaths in .context/config.yaml).` : `baton preflight: this command adds a dependency, which changes ${list}.`,
    `A new dependency or schema change is a load-bearing choice and gets a decision record first: baton decide "<title>" --preflight --paths ${opts.paths.join(",")}.`
  ];
  if (opts.hits.length === 0) {
    lines.push(`No decision or spec section lists ${list} in source_paths.`);
  } else {
    for (const h of opts.hits.slice(0, MAX_LISTED_HITS)) {
      lines.push(`Recorded: ${h.label} lists ${h.path} in source_paths.`);
    }
    if (opts.hits.length > MAX_LISTED_HITS) {
      lines.push(
        `Recorded: ${opts.hits.length - MAX_LISTED_HITS} more; baton decide --preflight lists them.`
      );
    }
  }
  return lines.join("\n");
}
function readText(root, rp) {
  try {
    return readFileSync(join(root, rp), "utf8");
  } catch {
    return null;
  }
}
async function preToolUse(input, ctx, platform = process.platform) {
  if (!existsSync(contextPath(ctx.root))) return { kind: "noop" };
  const tool = typeof input.tool_name === "string" ? input.tool_name : "";
  if (tool === "") return { kind: "noop" };
  const raw = input.tool_input;
  const toolInput = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
  const cwd = typeof input.cwd === "string" ? input.cwd : ctx.root;
  const denial = checkToolCall(tool, toolInput, {
    root: ctx.root,
    cwd,
    platform,
    adrState: (rp) => readAdrState(join(ctx.root, rp)),
    readText: (rp) => readText(ctx.root, rp)
  });
  let config;
  const getConfig = async () => {
    config ??= await (await import("./guards-config-2NSUP7YJ.mjs")).loadGuardsConfig(ctx.root);
    return config;
  };
  if (denial && (await getConfig()).protectState) {
    try {
      const dir = contextPath(ctx.root, ".cache");
      await mkdir(dir, { recursive: true });
      const line = JSON.stringify({
        v: 1,
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        event: "deny",
        session: typeof input.session_id === "string" ? input.session_id : "",
        tool,
        rule: denial.rule,
        path: denial.path
      });
      await appendFile(join(dir, GUARD_LOG), `${line}
`);
    } catch {
    }
    return { kind: "deny", reason: denial.reason };
  }
  const shell = SHELL_TOOLS.includes(tool);
  const candidates = shell ? dependencyManifests(shellCommandOf(tool, toolInput) ?? "") : editTargets(tool, toolInput).map((p) => toRepoTarget(p, ctx.root, cwd, platform)).filter((p) => p !== null);
  if (candidates.length === 0) return { kind: "noop" };
  const cfg = await getConfig();
  const paths = candidates.filter((p) => matchesPreflight(p, cfg.preflightPaths, platform));
  if (paths.length === 0) return { kind: "noop" };
  const { loadSectionIndex } = await import("./sections-K7TRQASF.mjs");
  const { preflight, hitLabel } = await import("./preflight-SVXLGW2O.mjs");
  const index = await loadSectionIndex(ctx.root, { lenient: true });
  const report = preflight(index, { paths, specIds: [] });
  const hits = report.hits.flatMap(
    (h) => h.relations.includes("path") && h.matchedPath !== void 0 ? [{ label: hitLabel(h), path: h.matchedPath }] : []
  );
  return {
    kind: "context",
    text: renderPreflightContext({ kind: shell ? "shell" : "edit", tool, paths, hits })
  };
}
export {
  GUARD_LOG,
  matchesPreflight,
  preToolUse,
  readAdrState,
  renderPreflightContext
};
//# sourceMappingURL=pre-tool-use-WM4UL3CJ.mjs.map