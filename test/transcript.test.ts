import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  encodeProjectDir,
  firstTurnContextTokens,
  parseTranscript,
  sumUsage,
} from "../src/core/transcript.js";

const jsonl = readFileSync(new URL("./fixtures/transcript.jsonl", import.meta.url), "utf8");

describe("transcript", () => {
  const { records, malformedLines } = parseTranscript(jsonl);

  it("parses leniently", () => {
    expect(records).toHaveLength(5);
    expect(malformedLines).toBe(1);
  });

  it("de-duplicates usage repeated across content-block lines", () => {
    expect(sumUsage(records)).toEqual({
      inputTokens: 7,
      cacheCreationInputTokens: 1000,
      cacheReadInputTokens: 2000,
      outputTokens: 50,
    });
  });

  it("reports context size at the first assistant turn", () => {
    expect(firstTurnContextTokens(records)).toBe(1502);
  });

  it("encodes project dirs like Claude Code", () => {
    expect(encodeProjectDir("/home/user/work/my-repo")).toBe("-home-user-work-my-repo");
  });
});
