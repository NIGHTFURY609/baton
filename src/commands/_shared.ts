import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { BatonError, ExitCode } from "../core/errors.js";
import { contextPath, resolveProjectRoot } from "../core/paths.js";

/** The home folder baton must never treat as a project. `BATON_HOME` stands in for it in tests. */
export function homeDir(): string {
  return process.env.BATON_HOME ?? homedir();
}

/** The project root for the current directory (core/paths.ts `resolveProjectRoot`). */
export function projectRoot(): Promise<string> {
  return resolveProjectRoot(process.cwd(), homeDir());
}

/** Commands that read .context/ need it to exist; exit 1 with a pointer to `baton init`. */
export function requireContext(root: string): void {
  if (!existsSync(contextPath(root))) {
    throw new BatonError(`no .context/ in ${root}; run \`baton init\` first`);
  }
}

/**
 * Wrap a command action: map BatonError to its exit code and a one-line
 * message on stderr; anything else is an unexpected crash (exit 1 + stack).
 */
export function action<A extends unknown[]>(fn: (...args: A) => Promise<void> | void) {
  return async (...args: A): Promise<void> => {
    try {
      await fn(...args);
    } catch (err) {
      if (err instanceof BatonError) {
        process.stderr.write(`baton: ${err.message}\n`);
        process.exitCode = err.exitCode;
        return;
      }
      process.stderr.write(`baton: unexpected error\n${(err as Error)?.stack ?? String(err)}\n`);
      process.exitCode = ExitCode.Error;
    }
  };
}

export const HARNESSES = ["claude", "codex", "gemini"] as const;
