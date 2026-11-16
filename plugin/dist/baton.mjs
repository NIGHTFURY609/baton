#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  isFastHookArgv
} from "./chunk-Z3Y3YQIP.mjs";
import "./chunk-UC4Y6CAD.mjs";

// src/cli.ts
var args = process.argv.slice(2);
if (args[0] === "hook" && isFastHookArgv(args.slice(1))) {
  const { runHookFromArgv } = await import("./entry-KTPRHBJG.mjs");
  process.exitCode = await runHookFromArgv(args.slice(1));
} else {
  const { buildProgram } = await import("./program-OYVNK3UP.mjs");
  await buildProgram().parseAsync(process.argv);
}
//# sourceMappingURL=baton.mjs.map