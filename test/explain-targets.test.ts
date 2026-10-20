import { describe, expect, it } from "vitest";
import { buildIndex, type Target } from "../src/core/explain/targets.js";
import { makeFixture, makeTempDir, writeFiles } from "./helpers/explain-fixture.js";

function find<K extends Target["kind"]>(
  targets: Target[],
  kind: K,
  name: string,
): Extract<Target, { kind: K }> | undefined {
  return targets.find((t) => t.kind === kind && t.name === name) as
    | Extract<Target, { kind: K }>
    | undefined;
}

describe("buildIndex", () => {
  it("indexes dependencies with dev flag", async () => {
    const { targets } = await buildIndex(await makeFixture());
    expect(find(targets, "dependency", "supabase")?.dev).toBe(false);
    expect(find(targets, "dependency", "vitest")?.dev).toBe(true);
    expect(find(targets, "dependency", "vitest")?.version).toBe("^5.0.0");
  });

  it("points a dependency at its line in package.json", async () => {
    const { targets } = await buildIndex(await makeFixture());
    const dep = find(targets, "dependency", "supabase");
    expect(dep?.source).toBe("package.json");
    // { / "name" / "dependencies": { / "supabase" -> line 4
    expect(dep?.line).toBe(4);
  });

  it("indexes a scoped package exactly", async () => {
    const { targets } = await buildIndex(await makeFixture());
    const dep = find(targets, "dependency", "@modelcontextprotocol/server");
    expect(dep?.keys).toContain("modelcontextprotocol-server");
  });

  it("indexes sections and decisions", async () => {
    const index = await buildIndex(await makeFixture());
    expect(index.contextSections.map((s) => s.meta.id)).toContain("auth");
    expect(index.decisions[0]?.specSections).toEqual(["auth"]);
    expect(index.decisions[0]?.section.meta.id).toBe("adr-0001");
    const auth = index.targets.find((t) => t.kind === "section" && t.keys.includes("auth"));
    expect(auth?.keys).toEqual(expect.arrayContaining(["auth", "authentication"]));
    expect(auth?.source).toBe(".context/spec.md");
    expect(index.targets.some((t) => t.kind === "section" && t.keys.includes("adr-0001"))).toBe(
      true,
    );
  });

  it("CRLF headings have clean names", async () => {
    const { targets } = await buildIndex(await makeFixture());
    const hooks = targets.find((t) => t.kind === "heading");
    expect(hooks?.name).toBe("Hooks");
    expect(hooks?.keys).toEqual(["hooks"]);
    expect(hooks?.source).toBe("docs/arch.md");
    expect(hooks?.line).toBe(3);
    if (hooks?.kind === "heading") {
      expect(hooks.level).toBe(2);
      expect(hooks.body).not.toContain("\r");
      expect(hooks.body).toContain("Hooks fail open.");
    }
  });

  it("parses mermaid nodes and edges", async () => {
    const { targets } = await buildIndex(await makeFixture());
    const nodes = targets.filter((t) => t.kind === "mermaid");
    const b = nodes.find((t) => t.kind === "mermaid" && t.nodeId === "B");
    expect(b?.name).toBe("Mission packet");
    expect(b?.keys).toEqual(["mission-packet", "b"]);
    expect(b?.source).toBe("docs/arch.md");
    if (b?.kind === "mermaid") {
      expect(b.edgesIn).toEqual(["Session start"]);
      expect(b.edgesOut).toEqual(["STATE.md"]);
    }
    const c = nodes.find((t) => t.kind === "mermaid" && t.nodeId === "C");
    expect(c?.name).toBe("STATE.md");
    expect(nodes.some((t) => t.name === "flowchart")).toBe(false);
    expect(nodes).toHaveLength(3);
  });

  it("adds directory targets", async () => {
    const { targets } = await buildIndex(await makeFixture());
    expect(targets).toContainEqual(
      expect.objectContaining({ kind: "file", name: "src/a", isDir: true }),
    );
    expect(targets).toContainEqual(
      expect.objectContaining({ kind: "file", name: "src/a/index.ts", isDir: false }),
    );
    const dir = targets.find((t) => t.name === "src/a");
    expect(dir?.keys).toEqual(["src-a", "a"]);
  });

  it("lists files as POSIX repo paths without directories", async () => {
    const { files } = await buildIndex(await makeFixture());
    expect(files).toEqual(
      expect.arrayContaining(["package.json", "docs/arch.md", "src/a/index.ts", "src/b/index.ts"]),
    );
    expect(files.some((f) => f === "src" || f.includes("\\"))).toBe(false);
  });

  it("works without git, package.json or .context", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "notes.txt": "hello\n" });
    const index = await buildIndex(root);
    expect(index.targets).toHaveLength(1);
    expect(index.targets[0]).toMatchObject({ kind: "file", name: "notes.txt", isDir: false });
    expect(index.contextSections).toEqual([]);
    expect(index.decisions).toEqual([]);
  });

  it("walks outside git with POSIX paths and skips junk folders", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "src/deep/x.ts": "x\n",
      "node_modules/pkg/index.js": "x\n",
      "dist/out.js": "x\n",
      ".git/config": "x\n",
      ".context/.cache/last.json": "{}\n",
    });
    const { files } = await buildIndex(root);
    expect(files).toEqual(["src/deep/x.ts"]);
  });

  it("skips a broken spec", async () => {
    const root = await makeTempDir();
    const marker = (id: string) =>
      `<!-- baton: {id: ${id}, kind: intent, verified_at: null, source_paths: []} -->`;
    await writeFiles(root, {
      ".context/spec.md": `# Spec\n\n## One\n${marker("dup")}\n\n## Two\n${marker("dup")}\n`,
      ".context/rules.md": `# Rules\n\n## Style\n${marker("style")}\n\nKeep it small.\n`,
      ".context/knowledge/bad.md": "---\nid: Not Kebab\nkind: knowledge\n---\n# Bad\n",
    });
    const index = await buildIndex(root);
    expect(index.contextSections.map((s) => s.meta.id)).toEqual(["style"]);
  });

  it("indexes knowledge notes but not STATE.md", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      ".context/STATE.md": "---\nid: state\nkind: state\nverified_at: null\n---\n# State\n",
      ".context/knowledge/gotcha.md":
        "---\nid: gotcha\nkind: knowledge\nverified_at: null\n---\n# A gotcha\r\n\r\nBody.\r\n",
    });
    const { contextSections } = await buildIndex(root);
    expect(contextSections.map((s) => s.meta.id)).toEqual(["gotcha"]);
    expect(contextSections[0]?.body).not.toContain("\r");
    expect(contextSections[0]?.file).toBe(".context/knowledge/gotcha.md");
  });

  it("ignores headings inside code fences and bounds bodies by level", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "docs/g.md": [
        "# Top",
        "intro",
        "## Child",
        "```sh",
        "# not a heading",
        "```",
        "tail",
        "## Sibling",
        "last",
        "",
      ].join("\n"),
    });
    const { targets } = await buildIndex(root);
    const headings = targets.flatMap((t) => (t.kind === "heading" ? [t] : []));
    expect(headings.map((h) => h.name)).toEqual(["Top", "Child", "Sibling"]);
    expect(headings[0]?.body).toContain("tail");
    expect(headings[1]?.body).toBe("```sh\n# not a heading\n```\ntail");
    expect(headings[2]?.body).toBe("last");
  });

  it("reads mermaid shapes, quotes, chains and ignores directives", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "README.md": [
        "```mermaid",
        "graph TD",
        "  %% a comment",
        "  classDef hot fill:#f00",
        "  subgraph Group",
        '    X["Quoted [label]"] -.-> Y((Round))',
        "  end",
        "  Y ==> Z>Flag]",
        "  Z --- Lonely",
        "```",
        "",
      ].join("\n"),
    });
    const { targets } = await buildIndex(root);
    const nodes = targets.flatMap((t) => (t.kind === "mermaid" ? [t] : []));
    expect(nodes.map((n) => [n.nodeId, n.name])).toEqual([
      ["X", "Quoted [label]"],
      ["Y", "Round"],
      ["Z", "Flag"],
      ["Lonely", "Lonely"],
    ]);
    expect(nodes.find((n) => n.nodeId === "Y")).toMatchObject({
      edgesIn: ["Quoted [label]"],
      edgesOut: ["Flag"],
    });
    expect(nodes.find((n) => n.nodeId === "Z")?.edgesOut).toEqual(["Lonely"]);
    expect(nodes.find((n) => n.nodeId === "X")?.line).toBe(6);
  });
});
