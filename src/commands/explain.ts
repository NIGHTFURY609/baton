import { homedir } from "node:os";
import nodePath, { type PlatformPath } from "node:path";
import type { Command } from "commander";
import { BatonError, ExitCode } from "../core/errors.js";
import { explain, renderText } from "../core/explain/index.js";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  type Scope,
  templateDirs,
} from "../core/explain/templates.js";
import { findProjectRoot } from "../core/paths.js";
import { action } from "./_shared.js";

interface ExplainOptions {
  as?: string;
  format: string;
  create?: string;
  prompt?: string;
  scope: string;
  force?: boolean;
  delete?: string;
  templates?: boolean;
}

const MODES = "use one of: explain <thing>, --create, --delete, --templates";
const SCOPES: readonly Scope[] = ["both", "project", "personal"];

const slashes = (p: string): string => p.replace(/\\/g, "/");

/** True when `rel` (a `relative()` result) points strictly inside its base. */
function inside(rel: string, pathMod: PlatformPath): boolean {
  return rel !== "" && rel.split(pathMod.sep)[0] !== ".." && !pathMod.isAbsolute(rel);
}

/**
 * Show a template path for the user: `~/...` when it is inside the personal
 * template dir, relative to the project root when it is inside the root, else
 * the full path (forward slashes). The personal dir is checked first, so a home
 * folder that contains the project does not turn project paths into `~/proj/...`,
 * and a personal dir nested in the project still prints as `~`. Containment is
 * a real test, so a path on another Windows drive (where `relative` returns an
 * absolute path) is never mistaken for a relative one.
 */
export function displayPath(
  path: string,
  where: { root: string; home: string; personalDir: string },
  pathMod: PlatformPath = nodePath,
): string {
  if (inside(pathMod.relative(where.personalDir, path), pathMod)) {
    return `~/${slashes(pathMod.relative(where.home, path))}`;
  }
  const inProject = pathMod.relative(where.root, path);
  if (inside(inProject, pathMod)) return slashes(inProject);
  return slashes(path);
}

export function registerExplain(program: Command): void {
  program
    .command("explain")
    .description("Explain a repo concept, file, or dependency in plain language")
    .argument("[thing...]", "what to explain; several words are joined with a space")
    .option("--as <template>", "template to write the explanation in")
    .option("--format <format>", "text or json", "text")
    .option("-c, --create <name>", "create a custom template")
    .option("-p, --prompt <text>", "the template prompt (with --create)")
    .option("-s, --scope <scope>", "both, project or personal", "both")
    .option("--force", "overwrite an existing template")
    .option("--delete <name>", "delete a custom template")
    .option("--templates", "list available templates")
    .action(
      action(async (words: string[], opts: ExplainOptions) => {
        const query = words.join(" ").trim();
        const modes = [
          opts.templates === true,
          opts.create !== undefined,
          opts.delete !== undefined,
          query !== "",
        ].filter(Boolean).length;
        if (modes !== 1) throw new BatonError(MODES);
        if (opts.format !== "text" && opts.format !== "json") {
          throw new BatonError(`--format must be text or json, got "${opts.format}"`);
        }
        if (!SCOPES.includes(opts.scope as Scope)) {
          throw new BatonError(`--scope must be one of ${SCOPES.join(", ")}, got "${opts.scope}"`);
        }
        const scope = opts.scope as Scope;

        const root = findProjectRoot();
        const home = process.env.BATON_HOME ?? homedir();
        const dirs = templateDirs(root, home);
        const where = { root, home, personalDir: dirs.personal };

        if (opts.templates) {
          for (const t of await listTemplates(dirs)) {
            process.stdout.write(`${t.name}  ${t.source}  ${t.description}\n`);
          }
          return;
        }

        if (opts.create !== undefined) {
          if (opts.prompt === undefined) throw new BatonError("--create needs --prompt <text>");
          const paths = await createTemplate(dirs, opts.create, opts.prompt, {
            scope,
            force: opts.force === true,
          });
          for (const p of paths) process.stdout.write(`created ${displayPath(p, where)}\n`);
          return;
        }

        if (opts.delete !== undefined) {
          for (const p of await deleteTemplate(dirs, opts.delete, scope)) {
            process.stdout.write(`removed ${displayPath(p, where)}\n`);
          }
          return;
        }

        const outcome = await explain(root, query, {
          dirs,
          ...(opts.as !== undefined ? { template: opts.as } : {}),
        });
        const text =
          opts.format === "json" ? JSON.stringify(outcome, null, 2) : renderText(outcome);
        process.stdout.write(`${text}\n`);
        if (outcome.status === "tie") process.exitCode = ExitCode.Blocked;
        else if (outcome.status === "none") process.exitCode = ExitCode.Error;
      }),
    );
}
