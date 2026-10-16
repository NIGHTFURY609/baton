import { describe, expect, it } from "vitest";
import { estimateTokens, fitToBudget } from "../src/core/budget.js";

describe("fitToBudget", () => {
  const blocks = [
    { key: "spec:auth", priority: 2, text: "a".repeat(50) },
    { key: "state", priority: 0, text: "s".repeat(30) },
    { key: "task:1", priority: 1, text: "t".repeat(40) },
    { key: "knowledge", priority: 3, text: "k".repeat(5) },
  ];

  it("keeps blocks in priority order within the cap, counting separators", () => {
    const r = fitToBudget(blocks, 100);
    expect(r.kept.map((b) => b.key)).toEqual(["state", "task:1", "knowledge"]);
    expect(r.dropped.map((b) => b.key)).toEqual(["spec:auth"]);
    expect(r.chars).toBe(30 + 2 + 40 + 2 + 5);
    expect(r.chars).toBeLessThanOrEqual(100);
  });

  it("never truncates a block", () => {
    const r = fitToBudget([{ key: "big", priority: 0, text: "x".repeat(200) }], 100);
    expect(r.kept).toEqual([]);
  });

  it("estimates tokens at ~4 chars each", () => {
    expect(estimateTokens("x".repeat(9000))).toBe(2250);
  });
});
