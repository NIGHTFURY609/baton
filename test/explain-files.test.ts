import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex, MAX_INDEXED_FILES } from "../src/core/explain/targets.js";
import { gitInit, makeFixture, makeTempDir, writeFiles } from "./helpers/explain-fixture.js";

describe("buildIndex file listing", () => {
  it("walks thousands of files without spreading them into push", async () => {
    const root = await makeTempDir();
    await Promise.all(
      Array.from({ length: 50 }, async (_, d) => {
        const dir = join(root, `d${d}`);
        await mkdir(dir, { recursive: true });
        await Promise.all(
          Array.from({ length: 100 }, (_, f) => writeFile(join(dir, `f${f}.txt`), "x\n")),
        );
      }),
    );
    const { files, skipped } = await buildIndex(root);
    expect(files).toHaveLength(5000);
    expect(files[0]).toBe("d0/f0.txt");
    expect(skipped).toEqual([]);
  }, 30_000);

  it("walks folders nested deeply", async () => {
    const root = await makeTempDir();
    const deep = Array.from({ length: 30 }, (_, i) => `n${i}`).join("/");
    await writeFiles(root, { [`${deep}/leaf.txt`]: "x\n" });
    const { files } = await buildIndex(root);
    expect(files).toEqual([`${deep}/leaf.txt`]);
  });

  it("caps the file count and reports the truncation", async () => {
    const root = await makeTempDir();
    await writeFiles(
      root,
      Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`f${i}.txt`, "x\n"])),
    );
    const index = await buildIndex(root, { maxFiles: 4 });
    expect(index.files).toHaveLength(4);
    expect(index.skipped).toEqual([{ file: "<root>", error: "file list truncated at 4 files" }]);
  });

  it("caps a repo listing too, and reports nothing for a tree under the cap", async () => {
    const root = await makeFixture();
    const capped = await buildIndex(root, { maxFiles: 2 });
    expect(capped.files).toHaveLength(2);
    expect(capped.skipped.map((s) => s.error)).toContain("file list truncated at 2 files");
    expect((await buildIndex(root)).skipped).toEqual([]);
    expect(MAX_INDEXED_FILES).toBe(50_000);
  });

  it("reports a failed repo listing instead of walking the whole folder", async () => {
    const root = await makeFixture();
    // A corrupt index: rev-parse still says "inside a work tree", but ls-files fails.
    await writeFile(join(root, ".git", "index"), "not an index");
    const index = await buildIndex(root);
    expect(index.files).toEqual([]);
    expect(index.skipped).toHaveLength(1);
    expect(index.skipped[0]?.file).toBe("<root>");
    expect(index.skipped[0]?.error).toMatch(/^git ls-files failed: .+/);
    expect(index.skipped[0]?.error).not.toContain("\n");
  });

  it("drops files deleted from the work tree", async () => {
    const root = await makeFixture();
    await rm(join(root, "src", "b", "index.ts"));
    const { files } = await buildIndex(root);
    expect(files).not.toContain("src/b/index.ts");
    expect(files).toContain("src/a/index.ts");
  });

  it("lists untracked files and respects .gitignore", async () => {
    const root = await makeTempDir();
    await gitInit(root);
    await writeFiles(root, { ".gitignore": "secret/\n", "a.txt": "x\n", "secret/b.txt": "x\n" });
    const { files } = await buildIndex(root);
    expect(files).toEqual([".gitignore", "a.txt"]);
  });

  it("walks a folder that an ancestor repo ignores", async () => {
    const outer = await makeTempDir();
    await gitInit(outer);
    await writeFiles(outer, { ".gitignore": "scratch/\n", "scratch/notes.txt": "x\n" });
    const { files, skipped } = await buildIndex(join(outer, "scratch"));
    expect(files).toEqual(["notes.txt"]);
    expect(skipped).toEqual([]);
  });
});
