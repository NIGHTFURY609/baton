// Validate plugin/skills/*/SKILL.md against the Agent Skills spec
// (agentskills.io/specification): name 1-64 chars [a-z0-9-], no leading,
// trailing or doubled hyphen, equal to the folder name; description 1-1024
// chars; only spec keys, so the same skills load in Codex and Gemini CLI.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const SPEC_KEYS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "plugin", "skills");
let failures = 0;
const fail = (skill, msg) => {
  failures++;
  console.error(`✗ ${skill}: ${msg}`);
};

for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const text = readFileSync(join(root, dir.name, "SKILL.md"), "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) {
    fail(dir.name, "missing frontmatter");
    continue;
  }
  const fm = parse(m[1]);
  const { name, description } = fm;
  if (typeof name !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64)
    fail(dir.name, `invalid name ${JSON.stringify(name)}`);
  if (name !== dir.name) fail(dir.name, `name "${name}" must match folder "${dir.name}"`);
  if (typeof description !== "string" || description.length < 1 || description.length > 1024)
    fail(dir.name, "description must be 1-1024 chars");
  for (const k of Object.keys(fm)) if (!SPEC_KEYS.has(k)) fail(dir.name, `non-spec key "${k}"`);
  const lines = text.split("\n").length;
  if (lines > 500) fail(dir.name, `body is ${lines} lines (spec recommends < 500)`);
  if (failures === 0) console.log(`✓ ${dir.name}`);
}
process.exit(failures ? 1 : 0);
