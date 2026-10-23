import { isFastHookArgv } from "./hooks/io.js";

const args = process.argv.slice(2);
if (args[0] === "hook" && isFastHookArgv(args.slice(1))) {
  // Hooks run on every tool call: skip building the full CLI program.
  const { runHookFromArgv } = await import("./hooks/entry.js");
  process.exitCode = await runHookFromArgv(args.slice(1));
} else {
  const { buildProgram } = await import("./program.js");
  await buildProgram().parseAsync(process.argv);
}
