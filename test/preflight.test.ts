import { describe, expect, it } from "vitest";
import {
  isLoadBearing,
  type PreflightQuery,
  preflight,
  preflightMoreInformation,
  renderPreflight,
  titleTokens,
} from "../src/core/preflight.js";
import { loadSectionIndex } from "../src/core/sections.js";
import { CONTEXT_FIXTURE, makeRepo } from "./helpers/repo.js";

const Q: PreflightQuery = {
  title: "Use WebAuthn for login",
  paths: ["src/auth/**"],
  specIds: ["auth"],
};

const fixtureIndex = (extra: Record<string, string> = {}) =>
  loadSectionIndex(makeRepo({ ...CONTEXT_FIXTURE, ...extra }, { git: false }));

const withBilling = (body: string) => ({
  ".context/spec.md": CONTEXT_FIXTURE[".context/spec.md"].replace("Stripe, monthly only.", body),
});

describe("preflight", () => {
  it("renders the fixture query exactly", async () => {
    const index = await fixtureIndex();
    expect(renderPreflight(preflight(index, Q))).toBe(
      [
        "preflight: 1 constraining, 2 related, 0 possibly related",
        'CONSTRAINS  ADR 0001 (accepted) "Use passkeys for sign-in"  .context/decisions/0001-use-passkeys.md:1  spec: auth',
        'RELATED     spec auth "Authentication"  .context/spec.md:3  path: src/auth/**; spec: auth',
        'RELATED     knowledge knowledge-windows "Windows gotchas"  .context/knowledge/windows.md:1  path: src/auth/**',
      ].join("\n"),
    );
  });

  it("skips superseded and state sections", async () => {
    const r = preflight(await fixtureIndex(), {
      paths: ["src/auth/**"],
      specIds: ["auth", "state"],
    });
    const ids = r.hits.map((h) => h.section.meta.id);
    expect(ids).not.toContain("adr-0002");
    expect(ids).not.toContain("state");
  });

  it("supersedes downgrades the constraint", async () => {
    const r = preflight(await fixtureIndex(), { ...Q, supersedes: 1 });
    expect(r.counts.constrains).toBe(0);
    const hit = r.hits.find((h) => h.section.meta.id === "adr-0001");
    expect(hit?.category).toBe("related");
    expect(hit?.why).toBe("spec: auth; replaced by this decision");
  });

  it("load-bearing sections constrain", async () => {
    const index = await fixtureIndex(withBilling("Stripe, monthly only (load-bearing)."));
    const r = preflight(index, { paths: [], specIds: ["billing"] });
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]?.category).toBe("constrains");
    expect(renderPreflight(r)).toContain('spec billing "Billing" (load-bearing)');
  });

  it("a mention is not a marker", async () => {
    const index = await fixtureIndex(
      withBilling("Stripe, monthly only. This section is not load-bearing."),
    );
    const r = preflight(index, { paths: [], specIds: ["billing"] });
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]?.category).toBe("related");
    const billing = index.byId.get("billing");
    expect(billing && isLoadBearing(billing)).toBe(false);
  });

  it("keywords are only possible", async () => {
    const r = preflight(await fixtureIndex(), {
      title: "Rotate passkeys yearly",
      paths: [],
      specIds: [],
    });
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]?.section.meta.id).toBe("adr-0001");
    expect(r.hits[0]?.category).toBe("possibly");
    expect(r.hits[0]?.keywords).toEqual(["passkeys"]);
  });

  it("possibly keeps 5", async () => {
    const extra: Record<string, string> = {};
    for (let i = 1; i <= 7; i++) {
      extra[`.context/knowledge/k${i}.md`] =
        `---\nid: k${i}\nkind: knowledge\nverified_at: null\nsource_paths: []\n---\n# Passkey storage k${i}\n`;
    }
    const r = preflight(await fixtureIndex(extra), {
      title: "passkey storage",
      paths: [],
      specIds: [],
    });
    expect(r.counts.possibly).toBe(5);
    expect(r.hits).toHaveLength(5);
  });

  it("paths match in either direction", async () => {
    const index = await fixtureIndex();
    const idsFor = (paths: string[]) =>
      preflight(index, { paths, specIds: [] }).hits.map((h) => h.section.meta.id);
    expect(idsFor(["package.json"])).toContain("rules-project");
    expect(idsFor(["src/**"])).toContain("auth");
    expect(idsFor(["docs/x.md"])).toEqual([]);
  });

  it("normalises Windows query paths", async () => {
    const r = preflight(await fixtureIndex(), { paths: [".\\src\\auth\\login.ts"], specIds: [] });
    const auth = r.hits.find((h) => h.section.meta.id === "auth");
    expect(auth).toBeDefined();
    expect(auth?.matchedPath).toBe("src/auth/login.ts");
  });

  it("lists unknown spec ids", async () => {
    const r = preflight(await fixtureIndex(), {
      paths: [],
      specIds: ["ghost", "adr-0001", "state", "auth"],
    });
    expect(r.unknownSpecIds).toEqual(["ghost", "adr-0001", "state"]);
    expect(renderPreflight(r).endsWith("unknown spec ids: ghost, adr-0001, state")).toBe(true);
  });

  it("tokenises titles", () => {
    expect(titleTokens("Use the zod schema for config-validation")).toEqual([
      "zod",
      "schema",
      "config",
      "validation",
    ]);
  });

  it("builds the More Information block", async () => {
    const info = preflightMoreInformation(preflight(await fixtureIndex(), Q));
    expect(info.summary).toBe(
      "Preflight at creation (baton decide): 1 constraining, 2 related, 0 possibly related.",
    );
    expect(info.items[0]).toBe(
      'constrains: ADR 0001 (accepted) "Use passkeys for sign-in" (spec: auth)',
    );
  });
});
