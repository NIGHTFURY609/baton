import type { Command } from "commander";

export function registerMcp(program: Command): void {
  program
    .command("mcp")
    .description("serve the optional four-tool MCP adapter over stdio")
    .action(async () => {
      // Loaded lazily: the MCP SDK is most of the bundle, and hooks (which run
      // on every session start and guarded tool call) should not pay for it.
      const { startMcpServer } = await import("../mcp/server.js");
      await startMcpServer();
    });
}
