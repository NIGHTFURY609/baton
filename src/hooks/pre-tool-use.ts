import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { statusOf } from "../core/decisions.js";
import { matchesAny } from "../core/glob.js";
import { contextPath } from "../core/paths.js";
import type { HookContext } from "./dispatch.js";
import {
  checkToolCall,
  dependencyManifests,
  editTargets,
  SHELL_TOOLS,
  shellCommandOf,
  toRepoTarget,
} from "./guards.js";
import type { HookInput, HookResult } from "./io.js";

/** Deny log under .context/.cache/. */
export const GUARD_LOG = "guard.jsonl";

const MAX_LISTED_HITS = 5;

export function readAdrState(absPath: string): { exists: boolean; status: string | null } {
  const exists = existsSync(absPath);
  if (!exists) return { exists, status: null };
  try {
    return { exists, status: statusOf(readFileSync(absPath, "utf8")) };
  } catch {
    return { exists, status: null };
  }
}

export function matchesPreflight(
  repoPath: string,
  globs: readonly string[],
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform === "win32") {
    return matchesAny(
      repoPath.toLowerCase(),
      globs.map((g) => g.toLowerCase()),
    );
  }
  return matchesAny(repoPath, globs);
}

export function renderPreflightContext(opts: {
  kind: "edit" | "shell";
  tool: string;
  paths: string[];
  hits: { label: string; path: string }[];
}): string {
  const list = opts.paths.join(", ");
  const lines = [
    opts.kind === "edit"
      ? `baton preflight: ${opts.tool} on ${list} touches a dependency or migration file (guards.preflightPaths in .context/config.yaml).`
      : `baton preflight: this command adds a dependency, which changes ${list}.`,
    `A new dependency or schema change is a load-bearing choice and gets a decision record first: baton decide "<title>" --preflight --paths ${opts.paths.join(",")}.`,
  ];
  if (opts.hits.length === 0) {
    lines.push(`No decision or spec section lists ${list} in source_paths.`);
  } else {
    for (const h of opts.hits.slice(0, MAX_LISTED_HITS)) {
      lines.push(`Recorded: ${h.label} lists ${h.path} in source_paths.`);
    }
    if (opts.hits.length > MAX_LISTED_HITS) {
      lines.push(
        `Recorded: ${opts.hits.length - MAX_LISTED_HITS} more; baton decide --preflight lists them.`,
      );
    }
  }
  return lines.join("\n");
}

function readText(root: string, rp: string): string | null {
  try {
    return readFileSync(join(root, rp), "utf8");
  } catch {
    return null;
  }
}

type Config = Awaited<ReturnType<typeof import("../core/config.js").loadConfig>>;

export async function preToolUse(
  input: HookInput,
  ctx: HookContext,
  platform: NodeJS.Platform = process.platform,
): Promise<HookResult> {
  if (!existsSync(contextPath(ctx.root))) return { kind: "noop" };
  const tool = typeof input.tool_name === "string" ? input.tool_name : "";
  if (tool === "") return { kind: "noop" };
  const raw = input.tool_input;
  const toolInput: Record<string, unknown> =
    typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
  const cwd = typeof input.cwd === "string" ? input.cwd : ctx.root;

  const denial = checkToolCall(tool, toolInput, {
    root: ctx.root,
    cwd,
    platform,
    adrState: (rp) => readAdrState(join(ctx.root, rp)),
    readText: (rp) => readText(ctx.root, rp),
  });

  let config: Config | undefined;
  const getConfig = async (): Promise<Config> => {
    config ??= await (await import("../core/config.js")).loadConfig(ctx.root);
    return config;
  };

  if (denial && (await getConfig()).guards.protectState) {
    try {
      const dir = contextPath(ctx.root, ".cache");
      await mkdir(dir, { recursive: true });
      const line = JSON.stringify({
        v: 1,
        ts: new Date().toISOString(),
        event: "deny",
        session: typeof input.session_id === "string" ? input.session_id : "",
        tool,
        rule: denial.rule,
        path: denial.path,
      });
      await appendFile(join(dir, GUARD_LOG), `${line}\n`);
    } catch {
      // The log is best effort.
    }
    return { kind: "deny", reason: denial.reason };
  }

  const shell = SHELL_TOOLS.includes(tool);
  const candidates = shell
    ? dependencyManifests(shellCommandOf(tool, toolInput) ?? "")
    : editTargets(tool, toolInput)
        .map((p) => toRepoTarget(p, ctx.root, cwd, platform))
        .filter((p): p is string => p !== null);
  if (candidates.length === 0) return { kind: "noop" };

  const cfg = await getConfig();
  const paths = candidates.filter((p) => matchesPreflight(p, cfg.guards.preflightPaths, platform));
  if (paths.length === 0) return { kind: "noop" };

  const { loadSectionIndex } = await import("../core/sections.js");
  const { preflight, hitLabel } = await import("../core/preflight.js");
  const index = await loadSectionIndex(ctx.root, { lenient: true });
  const report = preflight(index, { paths, specIds: [] });
  const hits = report.hits.flatMap((h) =>
    h.relations.includes("path") && h.matchedPath !== undefined
      ? [{ label: hitLabel(h), path: h.matchedPath }]
      : [],
  );
  return {
    kind: "context",
    text: renderPreflightContext({ kind: shell ? "shell" : "edit", tool, paths, hits }),
  };
}
