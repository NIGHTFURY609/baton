#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  external_exports
} from "./chunk-SF6UCQ5U.mjs";
import {
  PREFLIGHT_DEFAULTS
} from "./chunk-QNOEYN3Z.mjs";
import {
  require_dist
} from "./chunk-HAV7IRWM.mjs";
import {
  ContextPaths,
  contextPath
} from "./chunk-HVIRJWHJ.mjs";
import {
  __toESM
} from "./chunk-UC4Y6CAD.mjs";

// src/core/config.ts
var import_yaml = __toESM(require_dist(), 1);
import { readFile } from "fs/promises";
var staleAfter = external_exports.object({
  rule: external_exports.number().int().positive().nullable().default(5),
  intent: external_exports.number().int().positive().nullable().default(20),
  decision: external_exports.number().int().positive().nullable().default(null),
  state: external_exports.number().int().positive().nullable().default(3),
  knowledge: external_exports.number().int().positive().nullable().default(10)
});
var ConfigSchema = external_exports.object({
  version: external_exports.literal(1).default(1),
  packet: external_exports.object({
    /**
     * Hard cap in characters. Claude Code spills SessionStart context over
     * 10,000 chars to a file and shows only a 2,000-char preview, so the
     * default leaves headroom under that cap (ADR 0004).
     */
    maxChars: external_exports.number().int().positive().max(1e4).default(9e3),
    /** How many ready tasks to include. */
    maxTasks: external_exports.number().int().positive().default(3)
  }).prefault({}),
  freshness: external_exports.object({ staleAfter: staleAfter.prefault({}) }).prefault({}),
  tasks: external_exports.object({
    backend: external_exports.enum(["native", "beads", "claude-tasks", "none"]).default("native"),
    /** Id prefix for native tasks (bt-a3f). Default: project folder name. */
    prefix: external_exports.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "prefix must be lowercase kebab-case").max(16).optional()
  }).prefault({}),
  verify: external_exports.object({
    /** Require a non-empty diff before a task can be marked done (open question). */
    requireDiff: external_exports.boolean().default(true),
    /** Stop hook runs the active task's check and blocks on failure (ADR 0019). */
    onStop: external_exports.boolean().default(false)
  }).prefault({}),
  guards: external_exports.object({
    /** PreToolUse denies on direct edits to generated/append-only state (Phase 2). */
    protectState: external_exports.boolean().default(true),
    /** Paths whose edits trigger `decide --preflight` (Phase 2). */
    preflightPaths: external_exports.array(external_exports.string()).default([...PREFLIGHT_DEFAULTS])
  }).prefault({})
});
function defaultConfig() {
  return ConfigSchema.parse({});
}
async function loadConfig(root) {
  let raw;
  try {
    raw = await readFile(contextPath(root, ContextPaths.config), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return defaultConfig();
    throw err;
  }
  return ConfigSchema.parse((0, import_yaml.parse)(raw) ?? {});
}

export {
  ConfigSchema,
  defaultConfig,
  loadConfig
};
//# sourceMappingURL=chunk-BW2ZAPTV.mjs.map