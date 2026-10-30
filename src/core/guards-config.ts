import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { ContextPaths, contextPath } from "./paths.js";

/** Every manifest `dependencyManifests` (hooks/guards.ts) can return, plus migrations. */
export const PREFLIGHT_DEFAULTS: readonly string[] = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "requirements.txt",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "**/migrations/**",
];

export interface GuardsConfig {
  /** PreToolUse denies on direct edits to generated/append-only state (Phase 2). */
  protectState: boolean;
  /** Paths whose edits trigger `decide --preflight` (Phase 2). */
  preflightPaths: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The `guards` section of .context/config.yaml, for PreToolUse. It checks these keys as
 * ConfigSchema does but does not import zod, the largest cost of a full config load, so an
 * edit stays inside the hook budget (ADR 0027). Keys outside `guards` are not read.
 */
export async function loadGuardsConfig(root: string): Promise<GuardsConfig> {
  let raw: string;
  try {
    raw = await readFile(contextPath(root, ContextPaths.config), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return guardsFrom({});
    throw err;
  }
  const doc: unknown = parse(raw) ?? {};
  if (!isRecord(doc)) throw new Error("config.yaml: expected a mapping");
  return guardsFrom(doc);
}

function guardsFrom(doc: Record<string, unknown>): GuardsConfig {
  const guards = doc.guards === undefined ? {} : doc.guards;
  if (!isRecord(guards)) throw new Error("config.yaml: guards must be a mapping");
  const { protectState = true, preflightPaths = [...PREFLIGHT_DEFAULTS] } = guards;
  if (typeof protectState !== "boolean") {
    throw new Error("config.yaml: guards.protectState must be a boolean");
  }
  if (!Array.isArray(preflightPaths) || !preflightPaths.every((p) => typeof p === "string")) {
    throw new Error("config.yaml: guards.preflightPaths must be a list of strings");
  }
  return { protectState, preflightPaths };
}
