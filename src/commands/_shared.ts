import { BatonError, ExitCode } from "../core/errors.js";

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
