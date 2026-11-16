#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  editTargets,
  toRepoTarget
} from "./chunk-CRMTXFK4.mjs";
import {
  matchesAny
} from "./chunk-POYJG6UX.mjs";
import "./chunk-5VA3OZXQ.mjs";
import "./chunk-YXJRO53B.mjs";
import {
  contextPath
} from "./chunk-HVIRJWHJ.mjs";
import "./chunk-UC4Y6CAD.mjs";

// src/hooks/post-tool-use.ts
import { existsSync } from "fs";
import { appendFile, mkdir, open } from "fs/promises";
import { join } from "path";
var TOUCHED_LOG = "touched.jsonl";
var TOUCHED_TAIL_BYTES = 262144;
var MAX_LISTED = 5;
var IGNORED_GLOBS = [".context/**"];
function noticedIds(logText, session) {
  const seen = /* @__PURE__ */ new Set();
  for (const line of logText.split("\n")) {
    if (line === "") continue;
    try {
      const e = JSON.parse(line);
      if (e.v !== 1 || e.session !== session || !Array.isArray(e.ids)) continue;
      for (const id of e.ids) if (typeof id === "string") seen.add(id);
    } catch {
    }
  }
  return seen;
}
function noticeText(paths, sections) {
  const shown = sections.slice(0, MAX_LISTED).map((s) => `${s.id} ("${s.title}", ${s.file}:${s.line})`);
  let list = shown.join("; ");
  if (sections.length > MAX_LISTED) list += `; and ${sections.length - MAX_LISTED} more`;
  return `baton: ${paths.join(", ")} ${paths.length === 1 ? "is" : "are"} in the source_paths of ${list}. Those sections count as aging until they are re-verified: commit the change, then baton verify-doc <id> records a section as verified at HEAD after review.`;
}
async function readTail(file) {
  let handle;
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
async function postToolUse(input, ctx, platform = process.platform) {
  if (!existsSync(contextPath(ctx.root))) return { kind: "noop" };
  const tool = typeof input.tool_name === "string" ? input.tool_name : "";
  const raw = input.tool_input;
  const toolInput = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
  const cwd = typeof input.cwd === "string" ? input.cwd : ctx.root;
  const targets = [
    ...new Set(
      editTargets(tool, toolInput).map((p) => toRepoTarget(p, ctx.root, cwd, platform)).filter((p) => p !== null && !matchesAny(p, IGNORED_GLOBS))
    )
  ];
  if (targets.length === 0) return { kind: "noop" };
  const { loadSectionIndex } = await import("./sections-K7TRQASF.mjs");
  const index = await loadSectionIndex(ctx.root, { lenient: true });
  const matched = index.sections.filter(
    (s) => s.meta.verifiedAt !== null && !s.meta.supersededBy && s.meta.sourcePaths.length > 0 && targets.some((t) => matchesAny(t, s.meta.sourcePaths))
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
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      session,
      paths: targets,
      ids: fresh.map((s) => s.meta.id)
    });
    await appendFile(join(dir, TOUCHED_LOG), `${line}
`);
  } catch {
  }
  return {
    kind: "context",
    text: noticeText(
      targets,
      fresh.map((s) => ({ id: s.meta.id, title: s.title, file: s.file, line: s.line }))
    )
  };
}
export {
  TOUCHED_LOG,
  TOUCHED_TAIL_BYTES,
  noticeText,
  noticedIds,
  postToolUse
};
//# sourceMappingURL=post-tool-use-EU4FX5IB.mjs.map