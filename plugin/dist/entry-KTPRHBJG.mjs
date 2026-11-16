#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  runHook
} from "./chunk-5ORYQIKS.mjs";
import "./chunk-Z3Y3YQIP.mjs";
import "./chunk-HVIRJWHJ.mjs";
import "./chunk-UC4Y6CAD.mjs";

// src/hooks/entry.ts
var HARNESS_NAMES = ["claude", "codex", "gemini"];
function harnessArg(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--harness") return args[i + 1] ?? "";
    if (arg.startsWith("--harness=")) return arg.slice("--harness=".length);
  }
  return null;
}
async function runHookFromArgv(args, io = { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr }) {
  const event = args[0];
  const harness = harnessArg(args.slice(1)) ?? "claude";
  if (!HARNESS_NAMES.includes(harness)) {
    io.stderr.write(`baton hook: unknown harness "${harness}"
`);
    return 0;
  }
  const out = await runHook(event, harness, io.stdin);
  if (out.stdout) io.stdout.write(out.stdout);
  if (out.stderr) io.stderr.write(out.stderr);
  return out.exitCode;
}
export {
  runHookFromArgv
};
//# sourceMappingURL=entry-KTPRHBJG.mjs.map