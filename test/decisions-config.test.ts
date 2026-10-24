import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigSchema, defaultConfig } from "../src/core/config.js";
import { adrFileName, nextAdrNumber, slugify } from "../src/core/decisions.js";
import { makeTempDir } from "./helpers/repo.js";

describe("decisions", () => {
  it("slugifies titles into MADR file names", () => {
    expect(slugify("Use Beads (not markdown TODOs) as the task store!")).toBe(
      "use-beads-not-markdown-todos-as-the-task-store",
    );
    expect(adrFileName(7, "Packet budget")).toBe("0007-packet-budget.md");
  });

  it("finds the next free number", async () => {
    const dir = makeTempDir("baton-adr-");
    expect(await nextAdrNumber(dir)).toBe(1);
    writeFileSync(join(dir, "0000-template.md"), "");
    writeFileSync(join(dir, "0003-x.md"), "");
    expect(await nextAdrNumber(dir)).toBe(4);
    expect(await nextAdrNumber(join(dir, "missing"))).toBe(1);
  });
});

describe("config", () => {
  it("has defaults that respect the 10k SessionStart cap", () => {
    const c = defaultConfig();
    expect(c.packet.maxChars).toBe(9000);
    expect(c.tasks.backend).toBe("native");
    expect(c.freshness.staleAfter.decision).toBeNull();
    expect(c.verify.onStop).toBe(false);
  });

  it("rejects a packet budget above the harness cap", () => {
    expect(() => ConfigSchema.parse({ packet: { maxChars: 20000 } })).toThrow();
  });
});
