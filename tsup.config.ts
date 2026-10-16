import { defineConfig } from "tsup";

// Self-contained ESM output (entry + lazy chunks). Hooks run on every session start and every
// guarded tool call, so cold-start time matters: everything is bundled, nothing
// is resolved from node_modules at runtime.
export default defineConfig({
  entry: { baton: "src/cli.ts" },
  format: ["esm"],
  outExtension: () => ({ js: ".mjs" }),
  platform: "node",
  target: "node22",
  bundle: true,
  noExternal: [/.*/],
  splitting: true, // keeps the MCP SDK in a lazy chunk (see commands/mcp.ts)
  sourcemap: true,
  clean: true,
  minify: false,
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __batonCreateRequire } from "node:module";',
      "const require = __batonCreateRequire(import.meta.url);",
    ].join("\n"),
  },
});
