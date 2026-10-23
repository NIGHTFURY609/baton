import type { Command } from "commander";
import {
  acceptDecision,
  type CreateDecisionInput,
  createDecision,
  listDecisions,
  repoQueryPaths,
  runPreflight,
  type Superseded,
} from "../core/decide.js";
import { pad4, parseAdrRef } from "../core/decisions.js";
import { BatonError, ExitCode } from "../core/errors.js";
import { type PreflightQuery, renderPreflight } from "../core/preflight.js";
import { resolveActor } from "../core/tasks/native/store.js";
import { action, projectRoot, requireContext } from "./_shared.js";

/**
 * Decision records (MADR 4.0 in .context/decisions/, ADR 0018). The CLI is the only
 * write path: `decide "<title>"` creates the next record (proposed, or accepted with
 * --status accepted), `--accept <adr>` moves a proposed record to accepted, and
 * `--supersedes <adr>` links a successor. Accepting or superseding rewrites only an
 * existing record's status line (and verified_at on accept), never its body.
 * `--preflight` lists accepted ADRs and load-bearing spec sections a change may
 * conflict with, writes nothing, and exits 2 when something constrains it. With no
 * arguments at all it lists the records.
 */

interface DecideOptions {
  preflight?: boolean;
  supersedes?: string;
  status?: string;
  accept?: string;
  spec?: string;
  paths?: string;
  context?: string;
  considered: string[];
  outcome?: string;
  consequence: string[];
  deciders?: string;
}

const collect = (v: string, prev: string[]): string[] => [...prev, v];

const csv = (v: string | undefined): string[] =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

function supersededLine(n: number, s: Superseded | undefined): string[] {
  return s ? [`marked ADR ${pad4(s.number)} superseded by ADR ${pad4(n)}`] : [];
}

function out(lines: string[]): void {
  process.stdout.write(`${lines.join("\n")}\n`);
}

export function registerDecide(program: Command): void {
  program
    .command("decide")
    .description("create, accept, supersede, list or preflight-check decision records")
    .argument("[title]", "decision title")
    .option("--preflight", "check for conflicts only; write nothing (exit 2 when constrained)")
    .option("--supersedes <adr>", "ADR number this decision replaces")
    .option("--status <status>", "proposed (default) or accepted")
    .option("--accept <adr>", "mark an existing proposed ADR as accepted")
    .option("--spec <ids>", "comma-separated spec section ids this decision constrains")
    .option("--paths <globs>", "comma-separated source paths or globs this decision covers")
    .option("--context <text>", "context and problem statement (one line)")
    .option("--considered <text>", "a considered option (repeatable)", collect, [])
    .option("--outcome <text>", "the chosen option and why (one line)")
    .option("--consequence <text>", "a consequence (repeatable)", collect, [])
    .option("--deciders <names>", "comma-separated decision-makers (default: you)")
    .action(
      action(async (title: string | undefined, o: DecideOptions) => {
        const root = await projectRoot();
        requireContext(root);

        if (o.status !== undefined && o.status !== "proposed" && o.status !== "accepted") {
          throw new BatonError(`--status must be proposed or accepted, got "${o.status}"`);
        }
        const status = o.status === "accepted" ? "accepted" : "proposed";
        const supersedes = o.supersedes === undefined ? undefined : parseAdrRef(o.supersedes);
        const specIds = csv(o.spec);
        const paths = repoQueryPaths(root, csv(o.paths));

        if (o.accept !== undefined) {
          if (title !== undefined || o.preflight || o.supersedes !== undefined) {
            throw new BatonError("--accept takes no title and no other mode");
          }
          const n = parseAdrRef(o.accept);
          const r = await acceptDecision(root, n);
          out([
            `accepted ADR ${pad4(r.number)}: ${r.file}`,
            ...supersededLine(r.number, r.superseded),
          ]);
          return;
        }

        if (o.preflight) {
          if (title === undefined && paths.length === 0 && specIds.length === 0) {
            throw new BatonError("preflight needs a title, --paths or --spec");
          }
          const q: PreflightQuery = { paths, specIds };
          if (title !== undefined) q.title = title;
          if (supersedes !== undefined) q.supersedes = supersedes;
          const report = await runPreflight(root, q);
          out([renderPreflight(report)]);
          const c = report.counts.constrains;
          if (c > 0) {
            throw new BatonError(
              `${c} accepted decision(s) or load-bearing section(s) constrain this change; read them before deciding (supersede with --supersedes when it replaces one)`,
              ExitCode.Blocked,
            );
          }
          return;
        }

        if (title !== undefined) {
          const input: CreateDecisionInput = {
            title,
            status,
            specIds,
            paths,
            considered: o.considered,
            consequences: o.consequence,
            deciders: csv(o.deciders).length > 0 ? csv(o.deciders) : [resolveActor(root)],
          };
          if (supersedes !== undefined) input.supersedes = supersedes;
          if (o.context !== undefined) input.context = o.context;
          if (o.outcome !== undefined) input.outcome = o.outcome;
          const r = await createDecision(root, input);
          out([
            `created ADR ${pad4(r.number)} (${r.status}): ${r.file}`,
            renderPreflight(r.report),
            ...r.notes.map((note) => `note: ${note}`),
            ...supersededLine(r.number, r.superseded),
            ...(r.placeholders
              ? [
                  `next: replace the {…} placeholders in the body, then run baton decide --accept ${pad4(r.number)}`,
                ]
              : []),
          ]);
          return;
        }

        const given =
          o.supersedes !== undefined ||
          o.status !== undefined ||
          o.spec !== undefined ||
          o.paths !== undefined ||
          o.context !== undefined ||
          o.outcome !== undefined ||
          o.deciders !== undefined ||
          o.considered.length > 0 ||
          o.consequence.length > 0;
        if (given) throw new BatonError("a decision needs a title");

        const rows = await listDecisions(root);
        if (rows.length === 0) {
          out(["no decisions yet"]);
          return;
        }
        out(
          rows.map(
            (r) =>
              `${pad4(r.number)}  ${r.status}  ${r.title}${r.supersedes === undefined ? "" : `  (supersedes ${pad4(r.supersedes)})`}`,
          ),
        );
      }),
    );
}
