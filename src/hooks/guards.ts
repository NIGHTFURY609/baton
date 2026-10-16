import { matchesAny } from "../core/glob.js";

/**
 * Paths agents must not edit directly; changes go through the baton CLI.
 * STATE.md is regenerated, decisions are append-only, tasks and memories are
 * changed with `baton task` / `baton remember` (validation, cycle checks and
 * the SQLite cache all depend on it).
 */
export const PROTECTED_GLOBS = [
  ".context/STATE.md",
  ".context/decisions/**",
  ".context/tasks.jsonl",
  ".context/memories.jsonl",
  ".context/.cache/**",
  ".beads/**",
] as const;

/** Edit-like tools per harness and the input field holding the target path. */
const EDIT_TOOLS: Record<string, string[]> = {
  // Claude Code
  Edit: ["file_path"],
  Write: ["file_path"],
  MultiEdit: ["file_path"],
  NotebookEdit: ["notebook_path"],
  // Gemini CLI
  write_file: ["file_path", "absolute_path", "path"],
  replace: ["file_path", "absolute_path", "path"],
};

export function isProtectedPath(repoPath: string): boolean {
  return matchesAny(repoPath, PROTECTED_GLOBS);
}

/** Target paths of an edit-like tool call, as given (absolute or relative). */
export function editTargets(toolName: string, toolInput: Record<string, unknown>): string[] {
  const fields = EDIT_TOOLS[toolName];
  if (fields) {
    return fields.map((f) => toolInput[f]).filter((v): v is string => typeof v === "string");
  }
  // Codex apply_patch: paths appear in "*** Update File: <path>" style headers.
  if (toolName === "apply_patch") {
    const patch = typeof toolInput.input === "string" ? toolInput.input : "";
    return [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) =>
      (m[1] ?? "").trim(),
    );
  }
  return [];
}

const SHELL_WRITE_RE = /(>>?|\bsed\s+-i\b|\btee\b|\bmv\b|\bcp\b|\brm\b|\btruncate\b|\bperl\s+-p?i)/;

/**
 * Heuristic for shell tools (Bash, run_shell_command): flags commands that both
 * mention a protected path and contain a write-ish operator. An edit-only guard
 * is trivially bypassed with `sed -i` or `>`, so the shell must be covered too.
 * False positives are acceptable here: the deny message tells the agent which
 * CLI command to use instead.
 */
export function shellMayWriteProtected(command: string): boolean {
  const mentions =
    /\.context[/\\](STATE\.md|decisions[/\\]|tasks\.jsonl|memories\.jsonl|\.cache[/\\])|\.beads[/\\]/.test(
      command,
    );
  return mentions && SHELL_WRITE_RE.test(command);
}
