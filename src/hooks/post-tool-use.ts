import { existsSync } from "node:fs";
import { appendFile, mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { matchesAny } from "../core/glob.js";
import { contextPath } from "../core/paths.js";
import type { HookContext } from "./dispatch.js";
import { editTargets, toRepoTarget } from "./guards.js";
import type { HookInput, HookResult } from "./io.js";

/** Notice log under .context/.cache/. */
export const TOUCHED_LOG = "touched.jsonl";
export const TOUCHED_TAIL_BYTES = 262_144;

const MAX_LISTED = 5;

// Same value as FRESHNESS_IGNORED_GLOBS in src/core/drift.ts, duplicated to keep drift.ts
// (and its imports) out of this hook's static import graph.
const IGNORED_GLOBS = [".context/**"];

/** Ids already noticed in `session`, over the parseable v1 lines of the log. */
export function noticedIds(logText: string, session: string): Set<string> {
  const seen = new Set<string>();
  for (const line of logText.split("\n")) {
    if (line === "") continue;
    try {
      const e = JSON.parse(line) as { v?: unknown; session?: unknown; ids?: unknown };
      if (e.v !== 1 || e.session !== session || !Array.isArray(e.ids)) continue;
      for (const id of e.ids) if (typeof id === "string") seen.add(id);
    } catch {
      // A torn or foreign line.
    }
  }
  return seen;
}

export function noticeText(
  paths: string[],
  sections: { id: string; title: string; file: string; line: number }[],
): string {
  const shown = sections
    .slice(0, MAX_LISTED)
    .map((s) => `${s.id} ("${s.title}", ${s.file}:${s.line})`);
  let list = shown.join("; ");
  if (sections.length > MAX_LISTED) list += `; and ${sections.length - MAX_LISTED} more`;
  return `baton: ${paths.join(", ")} ${paths.length === 1 ? "is" : "are"} in the source_paths of ${list}. Those sections count as aging until they are re-verified: commit the change, then baton verify-doc <id> records a section as verified at HEAD after review.`;
}

async function readTail(file: string): Promise<string> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(file, "r");
  } catch {
    return "";
  }
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - TOUCHED_TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    await handle.read(buf, 0, buf.length, start);
    const text = buf.toString("utf8");
    if (start === 0) return text;
    const nl = text.indexOf("\n");
    return nl === -1 ? "" : text.slice(nl + 1);
  } finally {
    await handle.close();
  }
}

export async function postToolUse(
  input: HookInput,
  ctx: HookContext,
  platform: NodeJS.Platform = process.platform,
): Promise<HookResult> {
  if (!existsSync(contextPath(ctx.root))) return { kind: "noop" };
  const tool = typeof input.tool_name === "string" ? input.tool_name : "";
  const raw = input.tool_input;
  const toolInput: Record<string, unknown> =
    typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
  const cwd = typeof input.cwd === "string" ? input.cwd : ctx.root;

  const targets = [
    ...new Set(
      editTargets(tool, toolInput)
        .map((p) => toRepoTarget(p, ctx.root, cwd, platform))
        .filter((p): p is string => p !== null && !matchesAny(p, IGNORED_GLOBS)),
    ),
  ];
  if (targets.length === 0) return { kind: "noop" };

  const { loadSectionIndex } = await import("../core/sections.js");
  const index = await loadSectionIndex(ctx.root, { lenient: true });
  const matched = index.sections.filter(
    (s) =>
      s.meta.verifiedAt !== null &&
      !s.meta.supersededBy &&
      s.meta.sourcePaths.length > 0 &&
      targets.some((t) => matchesAny(t, s.meta.sourcePaths)),
  );
  if (matched.length === 0) return { kind: "noop" };

  const session = typeof input.session_id === "string" ? input.session_id : "";
  const dir = contextPath(ctx.root, ".cache");
  const seen = noticedIds(await readTail(join(dir, TOUCHED_LOG)), session);
  const fresh = matched.filter((s) => !seen.has(s.meta.id));
  if (fresh.length === 0) return { kind: "noop" };

  try {
    await mkdir(dir, { recursive: true });
    const line = JSON.stringify({
      v: 1,
      ts: new Date().toISOString(),
      session,
      paths: targets,
      ids: fresh.map((s) => s.meta.id),
    });
    await appendFile(join(dir, TOUCHED_LOG), `${line}\n`);
  } catch {
    // The log is best effort.
  }
  return {
    kind: "context",
    text: noticeText(
      targets,
      fresh.map((s) => ({ id: s.meta.id, title: s.title, file: s.file, line: s.line })),
    ),
  };
}
