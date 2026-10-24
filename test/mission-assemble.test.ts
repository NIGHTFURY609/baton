import { describe, expect, it } from "vitest";
import type { SectionFreshness } from "../src/core/drift.js";
import { BatonError } from "../src/core/errors.js";
import { assemblePacket, type PacketInputs, stateHead } from "../src/core/mission.js";
import type { ContextDoc, IndexedSection } from "../src/core/sections.js";
import type { FreshnessLevel, Task } from "../src/core/types.js";

const sf = (
  id: string,
  doc: ContextDoc,
  level: FreshnessLevel,
  over: Partial<IndexedSection> = {},
  reason?: string,
  commitsOutsideContext: number | null = 0,
): SectionFreshness => ({
  section: {
    meta: {
      id,
      kind: "intent",
      verifiedAt: level === "unverified" ? null : "abc1234def56",
      sourcePaths: [],
    },
    title: id,
    body: `${id} body`,
    file: ".context/spec.md",
    line: 3,
    doc,
    ...over,
  },
  result: {
    level,
    commitsSince: level === "aging" ? 1 : 0,
    reason:
      reason ??
      (level === "aging"
        ? "1 commit touched sources since abc1234"
        : level === "unverified"
          ? "never verified"
          : "sources unchanged since verification"),
  },
  deadRefs: [],
  commitsOutsideContext,
});

const STATE_BODY =
  "# State\n\nLast handoff: 2026-10-20T00:00:00.000Z (manual).\n\n## Summary\n\n- Open epics: none\n\n## In progress\n\n- bt-1";

const sections = (): SectionFreshness[] => [
  sf("state", "state", "fresh", { title: "State", body: STATE_BODY, file: ".context/STATE.md" }),
  sf("auth", "spec", "fresh", { title: "Authentication", body: "Users sign in with passkeys." }),
  sf("hooks", "spec", "aging", { title: "Hooks", body: "Hooks fail open." }),
  sf("billing", "spec", "unverified", { title: "Billing", body: "Stripe, monthly only." }),
  sf("adr-0001", "decision", "fresh", {
    title: "Use passkeys",
    file: ".context/decisions/0001-use-passkeys.md",
    adr: { number: 1, status: "accepted", specSections: ["auth"] },
  }),
  sf(
    "adr-0002",
    "decision",
    "superseded",
    {
      title: "Use passwords",
      file: ".context/decisions/0002-use-passwords.md",
      meta: {
        id: "adr-0002",
        kind: "decision",
        verifiedAt: "abc1234def56",
        sourcePaths: [],
        supersededBy: "adr-0001",
      },
      adr: { number: 2, status: "superseded by ADR-0001", specSections: ["auth"] },
    },
    "superseded by adr-0001",
  ),
  sf("adr-0003", "decision", "fresh", {
    title: "Maybe magic links",
    file: ".context/decisions/0003-magic-links.md",
    adr: { number: 3, status: "proposed", specSections: ["auth"] },
  }),
  sf("knowledge-windows", "knowledge", "fresh", { file: ".context/knowledge/windows.md" }),
];

const tasks = (): Task[] => [
  {
    id: "bt-1",
    title: "Add login",
    status: "in_progress",
    priority: 1,
    assignee: "alice",
    specSections: ["auth", "billing", "hooks", "ghost"],
    checkCommand: "npm test",
    description: "First line.\nSecond line.",
  },
  { id: "bt-2", title: "Docs", status: "open", priority: 2, specSections: [] },
];

const makeInputs = (): PacketInputs => ({
  project: "demo",
  head: "0123456789abcdef",
  generatedAt: "2026-10-20T00:00:00.000Z",
  sections: sections(),
  problems: [],
  tasks: tasks(),
  memories: [{ key: "node", value: "Node 22 is required" }],
});

describe("assemblePacket", () => {
  it("assembles the pinned packet", () => {
    const result = assemblePacket(makeInputs(), 9000);
    const t = result.text;

    expect(
      t.startsWith(
        "# baton mission brief\nProject demo at commit 0123456789ab, generated 2026-10-20T00:00:00.000Z. Facts below come from .context/, the task store and git.\n\n",
      ),
    ).toBe(true);
    expect(t).toContain(
      "State (from .context/STATE.md):\nLast handoff: 2026-10-20T00:00:00.000Z (manual).\n\n## Summary\n\n- Open epics: none",
    );
    expect(t).not.toContain("## In progress");
    expect(t).toContain(
      "Task bt-1 (P1, in progress, @alice): Add login\n  spec sections: auth, billing, hooks, ghost\n  check: npm test\n  description: First line.",
    );
    expect(t).toContain("Task bt-2 (P2, open): Docs");
    expect(t).toContain(
      'Spec section "Authentication" (auth, .context/spec.md:3, fresh):\nUsers sign in with passkeys.',
    );
    expect(t).toContain(
      'Spec section "Hooks" (hooks, .context/spec.md:3, aging: 1 commit touched sources since abc1234):\nHooks fail open.',
    );
    expect(t).not.toContain("Stripe, monthly only.");
    for (const s of [
      "Freshness of .context/: 5 fresh, 1 aging, 0 stale, 1 unverified, 1 superseded.",
      "Aging: hooks (1 commit touched sources since abc1234).",
      "Withheld as unverified: billing.",
      "Superseded: adr-0002 (by adr-0001).",
      "Task labels name unknown sections: ghost.",
      "baton verify-doc <id> records a section as verified at HEAD after review.",
    ]) {
      expect(t).toContain(s);
    }
    expect(t).toContain(
      "Decision ADR 0001 (accepted): Use passkeys (.context/decisions/0001-use-passkeys.md)",
    );
    expect(t).not.toContain("ADR 0002");
    expect(t).not.toContain("ADR 0003");
    expect(t).toContain("Memory node: Node 22 is required");
    expect(t).toContain("(topics: knowledge-windows)");

    expect(result.chars).toBe(t.length);
    expect(result.chars).toBeLessThanOrEqual(9000);
    expect(t).not.toContain("Left out for space");

    const order = [
      "State (from",
      "Task bt-1",
      "Freshness of",
      'Spec section "Authentication"',
      "Decision ADR 0001",
      "Memory node",
      "More context on demand",
    ].map((s) => t.indexOf(s));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    expect(result.withheld).toEqual([
      { id: "billing", level: "unverified", reason: "never verified" },
      { id: "adr-0002", level: "superseded", reason: "superseded by adr-0001" },
    ]);
    expect(result.taskIds).toEqual(["bt-1", "bt-2"]);

    for (const line of t.split("\n")) {
      expect(line).not.toMatch(
        /^(?:Do|Don't|Never|Always|Run|Use|Please|Make sure|Ensure|You (?:must|should))\b/,
      );
    }

    expect(assemblePacket(makeInputs(), 9000)).toEqual(result);
  });

  it("tight budget drops whole blocks", () => {
    const I2 = makeInputs();
    I2.sections = I2.sections.map((s) =>
      s.section.meta.id === "auth"
        ? { ...s, section: { ...s.section, body: "x".repeat(3000) } }
        : s,
    );
    const result = assemblePacket(I2, 2000);
    expect(result.blocks.find((b) => b.key === "spec:auth")?.kept).toBe(false);
    expect(result.text).toContain(
      "Left out for space: 1 block(s); baton mission --format json lists them.",
    );
    expect(result.text.length).toBeLessThanOrEqual(2000);
    expect(result.blocks.find((b) => b.key === "task:bt-1")?.kept).toBe(true);
    expect(result.blocks.find((b) => b.key === "freshness")?.kept).toBe(true);
  });

  it("rejects a budget below the minimum", () => {
    let err: unknown;
    try {
      assemblePacket(makeInputs(), 100);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BatonError);
    expect((err as BatonError).exitCode).toBe(1);
  });

  it("withholds an unverified STATE", () => {
    const I = makeInputs();
    I.sections = I.sections.map((s) =>
      s.section.doc === "state"
        ? { ...s, result: { ...s.result, level: "unverified" as const, reason: "never verified" } }
        : s,
    );
    const { text } = assemblePacket(I, 9000);
    expect(text).not.toContain("State (from");
    expect(text).toContain("Withheld as unverified: state, billing.");
  });

  it("reports commits since STATE", () => {
    const I = makeInputs();
    I.sections = I.sections.map((s) =>
      s.section.doc === "state" ? { ...s, commitsOutsideContext: 2 } : s,
    );
    expect(assemblePacket(I, 9000).text).toContain(
      "State (from .context/STATE.md; 2 commit(s) outside .context/ since it was generated):",
    );
  });

  it("says so when there are no tasks", () => {
    const I = { ...makeInputs(), tasks: [] };
    expect(assemblePacket(I, 9000).text).toContain(
      "No tasks are in progress or ready in the task store.",
    );
  });
});

describe("stateHead", () => {
  it("keeps the title-less text up to the second ## heading", () => {
    expect(stateHead("# State\n\nA.\n\n## Summary\n\n- x\n\n## In progress\n\n- y")).toBe(
      "A.\n\n## Summary\n\n- x",
    );
    expect(stateHead("# State\n\nOnly text.")).toBe("Only text.");
  });
});
