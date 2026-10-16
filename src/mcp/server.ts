import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod";
import pkg from "../../package.json" with { type: "json" };

/**
 * Optional MCP adapter (Phase 3). Exactly four tools with one-line
 * descriptions: every tool definition costs input tokens in every session, so
 * the surface stays this small. Each tool shells into the same core as the
 * CLI; the MCP never writes state on its own.
 */
const notYet = (tool: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: `baton ${tool}: not implemented yet (Phase 3).` }],
});

export function createServer(): McpServer {
  const server = new McpServer({ name: "baton", version: pkg.version });

  server.registerTool(
    "mission",
    {
      description: "Budgeted brief for the current task: state, ready tasks, fresh spec sections.",
      inputSchema: z.object({ budget: z.number().int().positive().max(10_000).optional() }),
    },
    async () => notYet("mission"),
  );

  server.registerTool(
    "decide",
    {
      description: "Check a proposed choice against accepted decisions, or record a new one.",
      inputSchema: z.object({
        title: z.string().min(3),
        preflight: z.boolean().default(true),
      }),
    },
    async () => notYet("decide"),
  );

  server.registerTool(
    "verify",
    {
      description: "Run a task's check command and close it only if the check passes.",
      inputSchema: z.object({ taskId: z.string().min(1) }),
    },
    async () => notYet("verify"),
  );

  server.registerTool(
    "search",
    {
      description: "Full-text search over .context/ (spec, decisions, knowledge).",
      inputSchema: z.object({
        query: z.string().min(2),
        limit: z.number().int().positive().max(20).optional(),
      }),
    },
    async () => notYet("search"),
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  serveStdio(createServer);
}
