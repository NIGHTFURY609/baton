import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Git-spawning fixtures are slow on Windows; the 5 s default made the suite nondeterministic.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
