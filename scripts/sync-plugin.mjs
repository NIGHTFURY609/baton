// Copy the bundled CLI (entry + lazy chunks) into the Claude Code plugin so
// hooks can run `node "${CLAUDE_PLUGIN_ROOT}/dist/baton.mjs"` without a global
// install.
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "dist");
const out = join(root, "plugin", "dist");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const files = readdirSync(src).filter((f) => f.endsWith(".mjs"));
for (const f of files) cpSync(join(src, f), join(out, f));
console.log(`synced ${files.length} file(s) dist/ -> plugin/dist/`);
