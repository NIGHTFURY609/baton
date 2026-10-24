import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BatonError } from "./errors.js";
import { parseSections } from "./frontmatter.js";
import { writeFileAtomic } from "./tasks/native/jsonl.js";
import { TEMPLATES } from "./templates.generated.js";
import type { Harness } from "./types.js";

export const RULES_PLACEHOLDER = "{rules from .context/rules.md}";
export const GITATTRIBUTES_LINES: readonly string[] = [
  ".context/tasks.jsonl merge=union",
  ".context/memories.jsonl merge=union",
];
export const GITIGNORE_LINES: readonly string[] = [".context/.cache/"];

const ALL_HARNESSES: readonly Harness[] = ["claude", "codex", "gemini"];

export interface InitAction {
  path: string;
  action: "create" | "overwrite" | "skip" | "append";
  note?: string;
}

const toLf = (text: string): string => text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

/** The AGENTS.md template with the rules.md sections rendered where the placeholder line sits. */
export function renderAgentsMd(template: string, rulesMd: string): string {
  const sections = parseSections(toLf(rulesMd), ".context/rules.md");
  const rendered =
    sections.length > 0
      ? sections.map((s) => `## ${s.title}\n\n${s.body}`).join("\n\n")
      : "_No rules yet: edit .context/rules.md._";
  return template
    .split("\n")
    .map((line) => (line.trim() === RULES_PLACEHOLDER ? rendered : line))
    .join("\n");
}

/** Append the lines `existing` lacks; never removes or rewrites anything. */
export function ensureLines(
  existing: string | null,
  lines: readonly string[],
): { text: string; added: string[] } {
  if (existing === null) return { text: `${lines.join("\n")}\n`, added: [...lines] };
  const eol = existing.includes("\r\n") ? "\r\n" : "\n";
  const have = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const added = lines.filter((l) => !have.has(l));
  if (added.length === 0) return { text: existing, added };
  const gap = existing && !existing.endsWith("\n") ? eol : "";
  return { text: existing + gap + added.join(eol) + eol, added };
}

export function parseHarnesses(value: string): Harness[] {
  const out: Harness[] = [];
  for (const raw of value.split(",")) {
    const name = raw.trim().toLowerCase();
    const picked = name === "all" ? ALL_HARNESSES : ALL_HARNESSES.filter((h) => h === name);
    if (picked.length === 0) {
      throw new BatonError(`unknown harness "${name}" (claude, codex, gemini or all)`);
    }
    for (const h of picked) if (!out.includes(h)) out.push(h);
  }
  return out;
}

const TEMPLATE_FILES: readonly (readonly [path: string, key: string])[] = [
  [".context/config.yaml", "context/config.yaml"],
  [".context/rules.md", "context/rules.md"],
  [".context/spec.md", "context/spec.md"],
  [".context/STATE.md", "context/STATE.md"],
  [".context/decisions/0000-template.md", "context/decisions/0000-template.md"],
  [".context/knowledge/README.md", "context/knowledge/README.md"],
  ["AGENTS.md", "AGENTS.md"],
  ["CLAUDE.md", "CLAUDE.md"],
];

function template(key: string): string {
  const text = TEMPLATES[key];
  if (text === undefined) throw new BatonError(`missing embedded template "${key}"`);
  return text;
}

function writeTemplate(root: string, path: string, content: string, force: boolean): InitAction {
  const abs = join(root, path);
  if (!existsSync(abs)) {
    writeFileAtomic(abs, content);
    return { path, action: "create" };
  }
  if (force) {
    writeFileAtomic(abs, content);
    return { path, action: "overwrite" };
  }
  if (path === "CLAUDE.md" && !/^@AGENTS\.md[ \t]*$/m.test(toLf(readFileSync(abs, "utf8")))) {
    return {
      path,
      action: "skip",
      note: "exists without @AGENTS.md; add that line so Claude Code loads AGENTS.md (ADR 0006)",
    };
  }
  return { path, action: "skip", note: "exists; --force overwrites" };
}

function addLines(root: string, path: string, lines: readonly string[]): InitAction {
  const abs = join(root, path);
  const existing = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  const { text, added } = ensureLines(existing, lines);
  if (added.length === 0) return { path, action: "skip", note: "already present" };
  writeFileAtomic(abs, text);
  return {
    path,
    action: existing === null ? "create" : "append",
    note: `${added.length} line(s)`,
  };
}

const RULES_FILE = ".context/rules.md";

/**
 * The AGENTS.md text this run will write, or null when AGENTS.md is left alone.
 * Rendering parses rules.md (the existing one, unless --force replaces it), so it
 * runs before the first write: a malformed user rules.md must stop init cleanly.
 */
function plannedAgentsMd(root: string, force: boolean): string | null {
  if (!force && existsSync(join(root, "AGENTS.md"))) return null;
  const rulesPath = join(root, RULES_FILE);
  const rules =
    !force && existsSync(rulesPath)
      ? readFileSync(rulesPath, "utf8")
      : template("context/rules.md");
  try {
    return renderAgentsMd(template("AGENTS.md"), rules);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new BatonError(message.startsWith(RULES_FILE) ? message : `${RULES_FILE}: ${message}`);
  }
}

/** Write the .context/ scaffold, AGENTS.md, CLAUDE.md and the additive git files under `root`. */
export async function scaffold(root: string, opts: { force: boolean }): Promise<InitAction[]> {
  const agentsMd = plannedAgentsMd(root, opts.force);
  const actions: InitAction[] = [];
  for (const [path, key] of TEMPLATE_FILES) {
    const content = path === "AGENTS.md" && agentsMd !== null ? agentsMd : template(key);
    actions.push(writeTemplate(root, path, content, opts.force));
  }
  actions.push(addLines(root, ".gitattributes", GITATTRIBUTES_LINES));
  actions.push(addLines(root, ".gitignore", GITIGNORE_LINES));
  return actions;
}
