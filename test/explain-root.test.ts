import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveExplainRoot } from "../src/core/explain/root.js";
import { samePath } from "../src/core/paths.js";
import { gitInit, makeTempDir, writeFiles } from "./helpers/explain-fixture.js";

// Same directory, not same spelling: git prints the long form of an 8.3 temp path.
const same = (a: string, b: string) => expect(samePath(a, b), `${a} vs ${b}`).toBe(true);

describe("resolveExplainRoot", () => {
  it("uses cwd when the only repo above it is the home folder", async () => {
    const home = await makeTempDir("baton-home-");
    await gitInit(home);
    const cwd = join(home, "scratch", "deep");
    await writeFiles(cwd, { "notes.txt": "hi\n" });
    same(await resolveExplainRoot(cwd, home), cwd);
  });

  it("ignores a stray .context in the home folder", async () => {
    const home = await makeTempDir("baton-home-");
    await writeFiles(home, { ".context/spec.md": "# Spec\n", "scratch/notes.txt": "hi\n" });
    const cwd = join(home, "scratch");
    same(await resolveExplainRoot(cwd, home), cwd);
  });

  it("ignores a git repo that sits above the home folder", async () => {
    const outer = await makeTempDir("baton-outer-");
    await gitInit(outer);
    const home = join(outer, "home");
    const cwd = join(home, "scratch");
    await writeFiles(cwd, { "notes.txt": "hi\n" });
    same(await resolveExplainRoot(cwd, home), cwd);
  });

  it("prefers the nearest ancestor with .context/", async () => {
    const home = await makeTempDir("baton-home-");
    const proj = await makeTempDir("baton-proj-");
    await writeFiles(proj, { ".context/spec.md": "# Spec\n", "a/b/x.ts": "x\n" });
    same(await resolveExplainRoot(join(proj, "a", "b"), home), proj);
    same(await resolveExplainRoot(proj, home), proj);
  });

  it("prefers .context/ over a git toplevel above it", async () => {
    const home = await makeTempDir("baton-home-");
    const repo = await makeTempDir("baton-repo-");
    await gitInit(repo);
    await writeFiles(repo, { "pkg/.context/spec.md": "# Spec\n", "pkg/src/x.ts": "x\n" });
    same(await resolveExplainRoot(join(repo, "pkg", "src"), home), join(repo, "pkg"));
  });

  it("uses the git toplevel when it is not the home folder", async () => {
    const home = await makeTempDir("baton-home-");
    const repo = await makeTempDir("baton-repo-");
    await gitInit(repo);
    await writeFiles(repo, { "src/x.ts": "x\n" });
    same(await resolveExplainRoot(join(repo, "src"), home), repo);
  });

  it("falls back to cwd outside any repo or .context", async () => {
    const home = await makeTempDir("baton-home-");
    const cwd = await makeTempDir();
    same(await resolveExplainRoot(cwd, home), cwd);
  });
});
