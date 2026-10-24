import type { Harness } from "../core/types.js";
import { runHook } from "./dispatch.js";
import type { HookEvent } from "./io.js";

export interface HookIo {
  stdin: NodeJS.ReadableStream;
  stdout: { write(s: string): unknown };
  stderr: { write(s: string): unknown };
}

const HARNESS_NAMES: readonly string[] = ["claude", "codex", "gemini"];

/** `--harness <h>` or `--harness=<h>`; null when absent. */
function harnessArg(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--harness") return args[i + 1] ?? "";
    if (arg.startsWith("--harness=")) return arg.slice("--harness=".length);
  }
  return null;
}

/**
 * The `baton hook <event>` fast path: no commander, no program. `args` are the
 * arguments after `hook`, and `args[0]` is a known event (see isFastHookArgv).
 * Fails open: an unknown harness is reported on stderr and exits 0.
 */
export async function runHookFromArgv(
  args: string[],
  io: HookIo = { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
): Promise<number> {
  const event = args[0] as HookEvent;
  const harness = harnessArg(args.slice(1)) ?? "claude";
  if (!HARNESS_NAMES.includes(harness)) {
    io.stderr.write(`baton hook: unknown harness "${harness}"\n`);
    return 0;
  }
  const out = await runHook(event, harness as Harness, io.stdin);
  if (out.stdout) io.stdout.write(out.stdout);
  if (out.stderr) io.stderr.write(out.stderr);
  return out.exitCode;
}
