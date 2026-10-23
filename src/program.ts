import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { registerCompile } from "./commands/compile.js";
import { registerDecide } from "./commands/decide.js";
import { registerDrift } from "./commands/drift.js";
import { registerExplain } from "./commands/explain.js";
import { registerHandoff } from "./commands/handoff.js";
import { registerHook } from "./commands/hook.js";
import { registerInit } from "./commands/init.js";
import { registerMcp } from "./commands/mcp.js";
import { registerMission } from "./commands/mission.js";
import { registerStats } from "./commands/stats.js";
import { registerMemory, registerTask } from "./commands/task.js";
import { registerVerify } from "./commands/verify.js";

/**
 * baton: the only write path to continuity state. Skills, hooks and the MCP
 * adapter are three entry points into these commands.
 */
export function buildProgram(): Command {
  const program = new Command()
    .name("baton")
    .description(
      "Continuity layer for coding agents: the smallest fresh brief at session start, nothing stale reaches the model.",
    )
    .version(pkg.version)
    .showHelpAfterError();

  registerInit(program);
  registerMission(program);
  registerHandoff(program);
  registerDrift(program);
  registerDecide(program);
  registerVerify(program);
  registerExplain(program);
  registerCompile(program);
  registerStats(program);
  registerTask(program);
  registerMemory(program);
  registerHook(program);
  registerMcp(program);
  return program;
}
