import { type Command, Option } from "commander";
import type { Harness } from "../core/types.js";
import { runHook } from "../hooks/dispatch.js";
import { HOOK_EVENTS, type HookEvent } from "../hooks/io.js";
import { HARNESSES } from "./_shared.js";

/** Entry point the harness calls: `baton hook <event> [--harness ...]`, JSON on stdin. */
export function registerHook(program: Command): void {
  program
    .command("hook")
    .description("run a harness hook (reads hook JSON on stdin)")
    .addArgument(program.createArgument("<event>", "hook event").choices(HOOK_EVENTS as string[]))
    .addOption(
      new Option("--harness <name>", "calling harness").choices(HARNESSES).default("claude"),
    )
    .action(async (event: HookEvent, opts: { harness: Harness }) => {
      const out = await runHook(event, opts.harness);
      if (out.stdout) process.stdout.write(out.stdout);
      if (out.stderr) process.stderr.write(out.stderr);
      process.exitCode = out.exitCode;
    });
}
