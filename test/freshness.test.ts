import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/core/config.js";
import { classifyFreshness, isInjectable } from "../src/core/freshness.js";
import type { SectionMeta } from "../src/core/types.js";

const staleAfter = defaultConfig().freshness.staleAfter;
const meta = (over: Partial<SectionMeta> = {}): SectionMeta => ({
  id: "auth",
  kind: "intent",
  verifiedAt: "3f2a1c9d0000",
  sourcePaths: ["src/auth/**"],
  ...over,
});

describe("classifyFreshness", () => {
  it("is fresh when no commits touched the sources", () => {
    expect(classifyFreshness({ meta: meta(), commitsSince: 0 }, staleAfter).level).toBe("fresh");
  });

  it("ages below the per-kind threshold and goes stale at it", () => {
    expect(classifyFreshness({ meta: meta(), commitsSince: 3 }, staleAfter).level).toBe("aging");
    expect(classifyFreshness({ meta: meta(), commitsSince: 20 }, staleAfter).level).toBe("stale");
    // rules age faster than intent
    const rule = meta({ kind: "rule" });
    expect(classifyFreshness({ meta: rule, commitsSince: 5 }, staleAfter).level).toBe("stale");
  });

  it("never goes stale by commits for decisions (null threshold)", () => {
    const adr = meta({ kind: "decision" });
    expect(classifyFreshness({ meta: adr, commitsSince: 500 }, staleAfter).level).toBe("aging");
  });

  it("orders superseded > unverified > dead refs > commits", () => {
    expect(
      classifyFreshness({ meta: meta({ supersededBy: "0007" }), commitsSince: 0 }, staleAfter)
        .level,
    ).toBe("superseded");
    expect(
      classifyFreshness({ meta: meta({ verifiedAt: null }), commitsSince: 0 }, staleAfter).level,
    ).toBe("unverified");
    const dead = classifyFreshness(
      { meta: meta(), commitsSince: 0, deadRefs: ["src/auth/old.ts"] },
      staleAfter,
    );
    expect(dead.level).toBe("stale");
    expect(dead.reason).toContain("src/auth/old.ts");
  });

  it("only injects fresh and aging sections", () => {
    expect(
      ["fresh", "aging", "stale", "superseded", "unverified"].map((l) => isInjectable(l as never)),
    ).toEqual([true, true, false, false, false]);
  });
});
