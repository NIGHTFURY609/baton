import type { Command } from "commander";
import {
  applyCompile,
  type CompileFile,
  HAND_WRITTEN_MESSAGE,
  planCompile,
} from "../core/compile.js";
import { BatonError, ExitCode } from "../core/errors.js";
import { action, projectRoot, requireContext } from "./_shared.js";

/**
 * Regenerate AGENTS.md from the marked sections of .context/rules.md with the
 * embedded router template (at most 60 lines, ADR 0006), and ensure CLAUDE.md
 * imports it with `@AGENTS.md` (ADR 0022). It writes no other rule files.
 * --check writes nothing and exits 2 on drift (CI). A hand-written AGENTS.md (no
 * generated header) is never replaced without --force.
 */
export function registerCompile(program: Command): void {
  program
    .command("compile")
    .description(
      "regenerate AGENTS.md from .context/rules.md and make CLAUDE.md import it (@AGENTS.md)",
    )
    .option("--check", "exit 2 if AGENTS.md or CLAUDE.md is out of date; write nothing")
    .option("--force", "replace a hand-written AGENTS.md")
    .action(
      action(async (opts: { check?: boolean; force?: boolean }) => {
        const root = await projectRoot();
        requireContext(root);
        const { files, warnings } = await planCompile(root);
        for (const w of warnings) process.stderr.write(`note: ${w}\n`);
        if (opts.check) {
          const stale = files.filter((f) => f.action !== "unchanged");
          for (const f of stale) process.stderr.write(`${driftMessage(f)}\n`);
          if (stale.length > 0) {
            throw new BatonError(
              `compile --check: ${stale.length} file(s) out of date; run baton compile`,
              ExitCode.Blocked,
            );
          }
          process.stdout.write("AGENTS.md and CLAUDE.md are up to date\n");
          return;
        }
        applyCompile(root, files, { force: opts.force === true });
        for (const f of files) process.stdout.write(`${doneMessage(f)}\n`);
      }),
    );
}

function driftMessage(f: CompileFile): string {
  if (f.path === "AGENTS.md") {
    if (f.handWritten) return HAND_WRITTEN_MESSAGE;
    return f.action === "create"
      ? "AGENTS.md is missing"
      : `AGENTS.md is out of date with .context/rules.md (first difference at line ${f.firstDiff})`;
  }
  return "CLAUDE.md does not import AGENTS.md (@AGENTS.md)";
}

function doneMessage(f: CompileFile): string {
  if (f.path === "AGENTS.md") {
    return f.action === "unchanged" ? "AGENTS.md unchanged" : "wrote AGENTS.md";
  }
  if (f.action === "create") return "created CLAUDE.md";
  return f.action === "unchanged" ? "CLAUDE.md unchanged" : "added @AGENTS.md to CLAUDE.md";
}
