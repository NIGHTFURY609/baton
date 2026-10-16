import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { z } from "zod";
import { ContextPaths, contextPath } from "./paths.js";

/**
 * Commits touching a section's source_paths before it moves to `stale`.
 * `null` disables commit-based staleness for that kind (ADRs only go stale
 * by being superseded). Defaults are a starting point; tuning them is an
 * open question for the dogfood phase (see docs/roadmap.md).
 */
const staleAfter = z.object({
  rule: z.number().int().positive().nullable().default(5),
  intent: z.number().int().positive().nullable().default(20),
  decision: z.number().int().positive().nullable().default(null),
  state: z.number().int().positive().nullable().default(3),
  knowledge: z.number().int().positive().nullable().default(10),
});

export const ConfigSchema = z.object({
  version: z.literal(1).default(1),
  packet: z
    .object({
      /**
       * Hard cap in characters. Claude Code spills SessionStart context over
       * 10,000 chars to a file and shows only a 2,000-char preview, so the
       * default leaves headroom under that cap (ADR 0004).
       */
      maxChars: z.number().int().positive().max(10_000).default(9_000),
      /** How many ready tasks to include. */
      maxTasks: z.number().int().positive().default(3),
    })
    .prefault({}),
  freshness: z.object({ staleAfter: staleAfter.prefault({}) }).prefault({}),
  tasks: z
    .object({
      backend: z.enum(["native", "beads", "claude-tasks", "none"]).default("native"),
      /** Id prefix for native tasks (bt-a3f). Default: project folder name. */
      prefix: z
        .string()
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "prefix must be lowercase kebab-case")
        .max(16)
        .optional(),
    })
    .prefault({}),
  verify: z
    .object({
      /** Require a non-empty diff before a task can be marked done (open question). */
      requireDiff: z.boolean().default(true),
    })
    .prefault({}),
  guards: z
    .object({
      /** PreToolUse denies on direct edits to generated/append-only state (Phase 2). */
      protectState: z.boolean().default(true),
      /** Paths whose edits trigger `decide --preflight` (Phase 2). */
      preflightPaths: z
        .array(z.string())
        .default([
          "package.json",
          "package-lock.json",
          "pnpm-lock.yaml",
          "yarn.lock",
          "**/migrations/**",
        ]),
    })
    .prefault({}),
});

export type Config = z.infer<typeof ConfigSchema>;

export function defaultConfig(): Config {
  return ConfigSchema.parse({});
}

/** Load .context/config.yaml, applying defaults. A missing file yields the defaults. */
export async function loadConfig(root: string): Promise<Config> {
  let raw: string;
  try {
    raw = await readFile(contextPath(root, ContextPaths.config), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return defaultConfig();
    throw err;
  }
  return ConfigSchema.parse(parse(raw) ?? {});
}
