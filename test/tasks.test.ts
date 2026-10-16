import { describe, expect, it } from "vitest";
import { issueToTask, parseReadyJson } from "../src/core/tasks/beads.js";

describe("beads adapter", () => {
  it("maps issues and reads spec:/check: labels", () => {
    const t = issueToTask({
      id: "bd-a1b2",
      title: "Wire SessionStart",
      status: "open",
      priority: 1,
      issue_type: "task",
      labels: ["phase-1", "spec:spec-hooks", "check:npm test"],
    });
    expect(t).toEqual({
      id: "bd-a1b2",
      title: "Wire SessionStart",
      status: "open",
      priority: 1,
      specSections: ["spec-hooks"],
      checkCommand: "npm test",
    });
  });

  it("accepts a bare array or an {issues} wrapper and skips junk", () => {
    const issue = { id: "bd-1", title: "x", status: "weird" };
    expect(parseReadyJson(JSON.stringify([issue, 42]))[0]?.status).toBe("open");
    expect(parseReadyJson(JSON.stringify({ issues: [issue] }))).toHaveLength(1);
  });
});
