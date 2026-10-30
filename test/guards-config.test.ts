import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigSchema, loadConfig } from "../src/core/config.js";
import { loadGuardsConfig } from "../src/core/guards-config.js";
import { makeTempDir } from "./helpers/repo.js";

function rootWith(yaml: string | null): string {
  const root = makeTempDir("baton-guards-config-");
  mkdirSync(join(root, ".context"), { recursive: true });
  if (yaml !== null) writeFileSync(join(root, ".context", "config.yaml"), yaml);
  return root;
}

describe("loadGuardsConfig", () => {
  // Parity with the full schema: same values for valid guards, an error for invalid guards.
  const valid = [
    "",
    "version: 1\n",
    "guards: {}\n",
    "guards:\n  protectState: false\n",
    'guards:\n  preflightPaths: ["**/migrations/**"]\n',
    "guards:\n  preflightPaths: []\n",
    "guards:\n  protectState: true\n  preflightPaths: [a, b]\n",
  ];
  it.each(valid)("matches the schema for %j", async (yaml) => {
    const root = rootWith(yaml);
    expect(await loadGuardsConfig(root)).toEqual((await loadConfig(root)).guards);
  });

  const invalid = [
    "guards: [\n",
    "- a\n",
    "just text\n",
    "guards: null\n",
    "guards: []\n",
    "guards: 1\n",
    "guards:\n  protectState: 'no'\n",
    "guards:\n  protectState: null\n",
    "guards:\n  preflightPaths: a\n",
    "guards:\n  preflightPaths: null\n",
    "guards:\n  preflightPaths: [1]\n",
  ];
  it.each(invalid)("rejects %j as the schema does", async (yaml) => {
    const root = rootWith(yaml);
    await expect(loadConfig(root)).rejects.toThrow();
    await expect(loadGuardsConfig(root)).rejects.toThrow();
  });

  it("gives the defaults when the file is missing", async () => {
    expect(await loadGuardsConfig(rootWith(null))).toEqual(ConfigSchema.parse({}).guards);
  });

  it("does not read keys outside guards", async () => {
    const root = rootWith("packet:\n  maxChars: -1\nguards:\n  protectState: false\n");
    await expect(loadConfig(root)).rejects.toThrow();
    expect((await loadGuardsConfig(root)).protectState).toBe(false);
  });
});
