import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Hang guards, not speed claims: git-spawning fixtures are slow on Windows and slower under load.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
