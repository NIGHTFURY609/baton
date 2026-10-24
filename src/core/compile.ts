import { existsSync } from "node:fs";
import { join } from "node:path";
import { BatonError, ExitCode } from "./errors.js";
import { ensureLines, renderAgentsMd } from "./init.js";
import { contextPath } from "./paths.js";
import { readTextOrEmpty, writeFileAtomic } from "./tasks/native/jsonl.js";
import { TEMPLATES } from "./templates.generated.js";

export const AGENTS_FILE = "AGENTS.md";
export const CLAUDE_FILE = "CLAUDE.md";
export const CLAUDE_IMPORT = "@AGENTS.md";
export const AGENTS_MAX_LINES = 60;

/** Strip one leading BOM and turn CRLF into LF. */
export function normalizeText(t: string): string {
  return t.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/** The AGENTS.md text for `rulesMd`; exit 2 over the line cap, exit 1 on a bad marker. */
export function compileAgentsMd(rulesMd: string): string {
  let text: string;
  try {
    text = renderAgentsMd(TEMPLATES["AGENTS.md"] as string, normalizeText(rulesMd));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const first = message.split("\n")[0] ?? message;
    throw new BatonError(
      first.startsWith(".context/rules.md") ? first : `.context/rules.md: ${first}`,
    );
  }
  const lines = text.replace(/\n$/, "").split("\n").length;
  if (lines > AGENTS_MAX_LINES) {
    throw new BatonError(
      `AGENTS.md would be ${lines} lines (max ${AGENTS_MAX_LINES}, ADR 0006); shorten .context/rules.md`,
      ExitCode.Blocked,
    );
  }
  return text;
}

/** Level-2 headings of rules.md whose next line is not a baton marker. */
export function unmarkedHeadings(rulesMd: string): { line: number; title: string }[] {
  const lines = normalizeText(rulesMd).split("\n");
  const out: { line: number; title: string }[] = [];
  lines.forEach((text, i) => {
    if (!text.startsWith("## ")) return;
    if (/^<!--\s*baton:/.test(lines[i + 1] ?? "")) return;
    out.push({ line: i + 1, title: text.slice(3).trim() });
  });
  return out;
}

/** 1-based first differing line of the normalised texts, or null when equal. */
export function firstDifference(a: string, b: string): number | null {
  const x = normalizeText(a).split("\n");
  const y = normalizeText(b).split("\n");
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return i + 1;
  return x.length === y.length ? null : n + 1;
}

export interface CompileFile {
  path: "AGENTS.md" | "CLAUDE.md";
  current: string | null;
  next: string;
  action: "create" | "update" | "append" | "unchanged";
  firstDiff: number | null;
}

function readIfExists(path: string): string | null {
  return existsSync(path) ? readTextOrEmpty(path) : null;
}

export async function planCompile(
  root: string,
): Promise<{ files: CompileFile[]; warnings: string[] }> {
  const rulesFile = contextPath(root, "rules.md");
  if (!existsSync(rulesFile)) throw new BatonError("no .context/rules.md");
  const rules = readTextOrEmpty(rulesFile);
  const nextAgents = compileAgentsMd(rules);

  const agentsCurrent = readIfExists(join(root, AGENTS_FILE));
  let agents: CompileFile;
  if (agentsCurrent === null) {
    agents = {
      path: AGENTS_FILE,
      current: null,
      next: nextAgents,
      action: "create",
      firstDiff: null,
    };
  } else if (normalizeText(agentsCurrent) === nextAgents) {
    agents = {
      path: AGENTS_FILE,
      current: agentsCurrent,
      next: nextAgents,
      action: "unchanged",
      firstDiff: null,
    };
  } else {
    agents = {
      path: AGENTS_FILE,
      current: agentsCurrent,
      next: nextAgents,
      action: "update",
      firstDiff: firstDifference(agentsCurrent, nextAgents),
    };
  }

  const claudeCurrent = readIfExists(join(root, CLAUDE_FILE));
  let claude: CompileFile;
  if (claudeCurrent === null) {
    claude = {
      path: CLAUDE_FILE,
      current: null,
      next: `${CLAUDE_IMPORT}\n`,
      action: "create",
      firstDiff: null,
    };
  } else {
    const ensured = ensureLines(claudeCurrent, [CLAUDE_IMPORT]);
    claude = {
      path: CLAUDE_FILE,
      current: claudeCurrent,
      next: ensured.text,
      action: ensured.added.length > 0 ? "append" : "unchanged",
      firstDiff: null,
    };
  }

  const warnings = unmarkedHeadings(rules).map(
    (h) =>
      `.context/rules.md:${h.line}: heading "${h.title}" has no baton marker; it is not compiled into AGENTS.md`,
  );
  return { files: [agents, claude], warnings };
}

export function applyCompile(root: string, files: CompileFile[]): void {
  for (const f of files) {
    if (f.action !== "unchanged") writeFileAtomic(join(root, f.path), f.next);
  }
}
