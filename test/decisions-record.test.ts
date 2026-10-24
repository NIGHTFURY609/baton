import { describe, expect, it } from "vitest";
import {
  type AdrDraft,
  adrId,
  adrNumberFrom,
  frontmatterBlock,
  localDate,
  numberTaken,
  pad4,
  parseAdrRef,
  placeholdersIn,
  renderAdr,
  setFrontmatterField,
  statusKind,
  statusOf,
  supersededStatus,
} from "../src/core/decisions.js";
import { BatonError } from "../src/core/errors.js";
import { parseFileSection, parseFrontmatter } from "../src/core/frontmatter.js";

const BOM = String.fromCharCode(0xfeff);

const MINIMAL: AdrDraft = {
  number: 3,
  title: "Use WebAuthn for login",
  status: "proposed",
  date: "2026-10-21",
  deciders: ["tester"],
  verifiedAt: null,
  sourcePaths: [],
  specSections: [],
  considered: [],
  consequences: [],
  moreInformation: {
    summary: "Preflight at creation (baton decide): 0 constraining, 0 related, 0 possibly related.",
    items: [],
  },
};

const FULL: AdrDraft = {
  number: 4,
  title: "Store sessions in SQLite",
  status: "accepted",
  date: "2026-10-21",
  deciders: ["maintainer", "Jane Doe"],
  verifiedAt: "0123456789ab",
  sourcePaths: ["src/db/**", "package.json"],
  specSections: ["auth", "billing"],
  supersedes: 1,
  context: "Sessions must survive restarts.",
  considered: ["SQLite file", "In-memory map"],
  outcome: 'Chosen option: "SQLite file", because it survives restarts.',
  consequences: [
    "Good, because restarts keep sessions.",
    "Bad, because the file must be backed up.",
  ],
  moreInformation: {
    summary: "Preflight at creation (baton decide): 1 constraining, 0 related, 0 possibly related.",
    items: ['constrains: ADR 0001 (accepted) "Use passkeys for sign-in" (spec: auth)'],
  },
};

const MINIMAL_TEXT = `---
id: adr-0003
kind: decision
status: proposed
date: 2026-10-21
decision-makers: [tester]
verified_at: null
source_paths: []
spec_sections: []
---
# Use WebAuthn for login

## Context and Problem Statement

{Context: the problem, and why a decision is needed now.}

## Considered Options

* {Considered option}
* {Considered option}

## Decision Outcome

{Chosen option and why.}

### Consequences

* Good, because {…}
* Bad, because {…}

## More Information

Preflight at creation (baton decide): 0 constraining, 0 related, 0 possibly related.
`;

const FULL_TEXT = `---
id: adr-0004
kind: decision
status: accepted
date: 2026-10-21
decision-makers: [maintainer, Jane Doe]
verified_at: "0123456789ab"
source_paths: ["src/db/**", "package.json"]
supersedes: "0001"
spec_sections: [auth, billing]
---
# Store sessions in SQLite

## Context and Problem Statement

Sessions must survive restarts.

## Considered Options

* SQLite file
* In-memory map

## Decision Outcome

Chosen option: "SQLite file", because it survives restarts.

### Consequences

* Good, because restarts keep sessions.
* Bad, because the file must be backed up.

## More Information

Preflight at creation (baton decide): 1 constraining, 0 related, 0 possibly related.

* constrains: ADR 0001 (accepted) "Use passkeys for sign-in" (spec: auth)
`;

describe("renderAdr", () => {
  it("renders a minimal proposed record exactly", () => {
    expect(renderAdr(MINIMAL)).toBe(MINIMAL_TEXT);
  });

  it("renders a full accepted record exactly", () => {
    const text = renderAdr(FULL);
    expect(text).toBe(FULL_TEXT);
    const { data } = parseFrontmatter(text);
    expect(data["decision-makers"]).toEqual(["maintainer", "Jane Doe"]);
    expect(data.supersedes).toBe("0001");
    expect(data.source_paths).toEqual(["src/db/**", "package.json"]);
    const section = parseFileSection(text, "x.md");
    expect(section?.meta.id).toBe("adr-0004");
    expect(section?.meta.verifiedAt).toBe("0123456789ab");
  });

  it("omits empty optional sections when accepted", () => {
    const text = renderAdr({ ...FULL, considered: [], consequences: [] });
    expect(text).not.toContain("## Considered Options");
    expect(text).not.toContain("### Consequences");
    expect(placeholdersIn(text)).toEqual([]);
  });

  it("quotes decision-makers that are not plain words", () => {
    const text = renderAdr({ ...MINIMAL, deciders: ["a@b.c", "ok"] });
    expect(text).toContain('decision-makers: ["a@b.c", ok]');
    expect(parseFrontmatter(text).data["decision-makers"]).toEqual(["a@b.c", "ok"]);
  });

  it("round-trips decision-makers that YAML would otherwise reinterpret", () => {
    const names = ["null", "609", "- x", "1e3", ".inf", "Jane ", "Jane Doe", "x"];
    const text = renderAdr({ ...MINIMAL, deciders: names });
    expect(parseFrontmatter(text).data["decision-makers"]).toEqual(names);
    expect(text).toContain('["null", "609", "- x", "1e3", ".inf", "Jane ", Jane Doe, x]');
  });

  it("rejects multi-line titles", () => {
    expect(() => renderAdr({ ...MINIMAL, title: "a\nb" })).toThrow(BatonError);
    try {
      renderAdr({ ...MINIMAL, title: "a\nb" });
      expect.unreachable();
    } catch (err) {
      expect((err as BatonError).exitCode).toBe(1);
    }
  });

  it("rejects multi-line items", () => {
    expect(() => renderAdr({ ...FULL, considered: ["a\nb"] })).toThrow(BatonError);
    expect(() => renderAdr({ ...FULL, consequences: ["a\nb"] })).toThrow(BatonError);
    expect(() =>
      renderAdr({ ...FULL, moreInformation: { summary: "s", items: ["a\nb"] } }),
    ).toThrow(BatonError);
  });
});

describe("placeholdersIn", () => {
  it("lists placeholder keys in order", () => {
    expect(placeholdersIn(MINIMAL_TEXT)).toEqual(["context", "option", "outcome", "good", "bad"]);
    expect(placeholdersIn(MINIMAL_TEXT.replaceAll("{Considered option}", "X"))).toEqual([
      "context",
      "outcome",
      "good",
      "bad",
    ]);
  });
});

describe("statusOf", () => {
  it("reads the status line", () => {
    expect(statusOf("---\nstatus: accepted\n---\n")).toBe("accepted");
    expect(
      statusOf(`${BOM}---\r\nid: a\r\nstatus: "superseded by ADR-0009"\r\n---\r\n# A\r\n`),
    ).toBe("superseded by ADR-0009");
    expect(statusOf("---\nstatus: 'proposed'\n---\n")).toBe("proposed");
  });

  it("returns null without frontmatter or status", () => {
    expect(statusOf("# no frontmatter")).toBeNull();
    expect(statusOf("---\nid: a\n---\n")).toBeNull();
  });
});

describe("frontmatterBlock", () => {
  it("normalises BOM and CRLF", () => {
    expect(frontmatterBlock(`${BOM}---\r\nid: a\r\nstatus: proposed\r\n---\r\n# A\r\n`)).toBe(
      "---\nid: a\nstatus: proposed\n---",
    );
  });

  it("handles a block without a trailing newline", () => {
    expect(frontmatterBlock("---\nid: a\n---")).toBe("---\nid: a\n---");
  });

  it("returns null without frontmatter", () => {
    expect(frontmatterBlock("# A")).toBeNull();
  });
});

describe("statusKind", () => {
  it.each([
    ["accepted", "accepted"],
    [" Accepted ", "accepted"],
    ["superseded by ADR-0009", "superseded"],
    ["proposed", "proposed"],
    ["rejected", "rejected"],
    ["deprecated", "deprecated"],
    ["", "other"],
    ["draft", "other"],
  ])("%j is %s", (input, kind) => {
    expect(statusKind(input)).toBe(kind);
  });
});

describe("references and numbers", () => {
  it.each([
    ["7", 7],
    ["0007", 7],
    ["ADR-0007", 7],
    ["adr-7", 7],
    ["adr 12", 12],
  ])("parseAdrRef(%j) is %d", (input, n) => {
    expect(parseAdrRef(input)).toBe(n);
  });

  it.each(["x", "0", "10000", ""])("parseAdrRef(%j) throws exit 1", (input) => {
    try {
      parseAdrRef(input);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(BatonError);
      expect((err as BatonError).exitCode).toBe(1);
    }
  });

  it("adrNumberFrom is loose", () => {
    expect(adrNumberFrom("0007")).toBe(7);
    expect(adrNumberFrom("ADR-0009")).toBe(9);
    expect(adrNumberFrom("none")).toBeNull();
    expect(adrNumberFrom("0000")).toBeNull();
  });

  it("formats ids and statuses", () => {
    expect(adrId(7)).toBe("adr-0007");
    expect(pad4(12)).toBe("0012");
    expect(supersededStatus(18)).toBe("superseded by ADR-0018");
  });

  it("localDate uses local calendar fields", () => {
    expect(localDate(new Date(2026, 9, 1, 12))).toBe("2026-10-01");
  });
});

describe("setFrontmatterField", () => {
  it("replaces the first matching frontmatter line only", () => {
    expect(
      setFrontmatterField(
        "---\nid: a\nstatus: proposed\n---\n# A\nstatus: body line\n",
        "status",
        "accepted",
      ),
    ).toBe("---\nid: a\nstatus: accepted\n---\n# A\nstatus: body line\n");
  });

  it("inserts a missing field before the closing fence", () => {
    expect(setFrontmatterField("---\nid: a\n---\n# A\n", "verified_at", '"0123456789ab"')).toBe(
      '---\nid: a\nverified_at: "0123456789ab"\n---\n# A\n',
    );
  });

  it("throws without frontmatter", () => {
    expect(() => setFrontmatterField("# A\n", "status", "x")).toThrow("no frontmatter");
  });
});

describe("numberTaken", () => {
  it("ignores the record's own file", () => {
    expect(numberTaken(["0003-a.md", "0003-b.md", "0004-c.md"], 3, "0003-a.md")).toBe(true);
    expect(numberTaken(["0003-a.md"], 3, "0003-a.md")).toBe(false);
  });
});
