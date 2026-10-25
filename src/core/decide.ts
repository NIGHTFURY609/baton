import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  adrFileName,
  adrNumberFrom,
  localDate,
  nextAdrNumber,
  numberTaken,
  pad4,
  placeholdersIn,
  renderAdr,
  setFrontmatterField,
  statusKind,
  statusOf,
  supersededStatus,
} from "./decisions.js";
import { BatonError, ExitCode } from "./errors.js";
import { parseFrontmatter } from "./frontmatter.js";
import { headSha } from "./git.js";
import { contextPath, toRepoPath } from "./paths.js";
import {
  isLoadBearing,
  normalizeQueryPath,
  type PreflightQuery,
  type PreflightReport,
  preflight,
  preflightMoreInformation,
} from "./preflight.js";
import { loadSectionIndex } from "./sections.js";
import { writeFileAtomic } from "./tasks/native/jsonl.js";

/**
 * Writing decision records (ADR 0018). New records are created with exclusive
 * create; an existing record is rewritten only on its `status:` and `verified_at:`
 * lines, never its body, and keeps its BOM and line endings.
 */

export interface CreateDecisionInput {
  title: string;
  status: "proposed" | "accepted";
  specIds: string[];
  paths: string[];
  supersedes?: number;
  context?: string;
  considered: string[];
  outcome?: string;
  consequences: string[];
  deciders: string[];
  now?: Date;
}

export interface Superseded {
  number: number;
  file: string;
}

export interface CreateDecisionResult {
  number: number;
  file: string;
  status: "proposed" | "accepted";
  report: PreflightReport;
  notes: string[];
  placeholders: boolean;
  superseded?: Superseded;
}

export interface DecisionListing {
  number: number;
  status: string;
  title: string;
  file: string;
  supersedes?: number;
}

/**
 * Query paths as POSIX repo-relative paths: an absolute path (either separator) becomes
 * relative to `root`, and one outside the root is dropped. Relative paths pass through.
 */
export function repoQueryPaths(root: string, paths: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of paths) {
    const p = raw.trim();
    if (p === "") continue;
    if (!isAbsolute(p)) {
      out.push(normalizeQueryPath(p));
      continue;
    }
    const rel = toRepoPath(root, p);
    if (rel === "" || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) continue;
    out.push(rel);
  }
  return out;
}

const BOM = String.fromCharCode(0xfeff);
const DECISIONS = "decisions";

/** Rewrite a record as LF text, then restore its original BOM and line endings. */
export function rewriteRecord(absPath: string, fn: (lfText: string) => string): void {
  const raw = readFileSync(absPath, "utf8");
  const bom = raw.startsWith(BOM) ? BOM : "";
  const rest = raw.slice(bom.length);
  const crlf = rest.includes("\r\n");
  const out = fn(rest.replace(/\r\n/g, "\n"));
  writeFileAtomic(absPath, bom + (crlf ? out.replace(/\n/g, "\r\n") : out));
}

function readLf(absPath: string): string {
  return readFileSync(absPath, "utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

async function decisionEntries(root: string): Promise<string[]> {
  try {
    return await readdir(contextPath(root, DECISIONS));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** Repo path of ADR `n`, e.g. ".context/decisions/0001-use-passkeys.md", or null. */
export async function findAdrFile(root: string, n: number): Promise<string | null> {
  const names = (await decisionEntries(root)).filter((e) => {
    const m = /^(\d{4})-.+\.md$/.exec(e);
    return m?.[1] !== undefined && Number(m[1]) === n;
  });
  if (names.length === 0) return null;
  if (names.length > 1) {
    throw new BatonError(`ADR ${pad4(n)} has several files: ${names.join(", ")}`);
  }
  return `.context/${DECISIONS}/${names[0]}`;
}

function absOf(root: string, repoPath: string): string {
  return join(root, ...repoPath.split("/"));
}

async function assertSupersedable(root: string, m: number): Promise<void> {
  const file = await findAdrFile(root, m);
  if (file === null) throw new BatonError(`no ADR ${pad4(m)}`);
  const status = statusOf(readLf(absOf(root, file))) ?? "";
  const kind = statusKind(status);
  if (kind === "superseded" || kind === "rejected") {
    throw new BatonError(`ADR ${pad4(m)} is ${status}; it cannot be superseded`, ExitCode.Blocked);
  }
}

async function markSuperseded(root: string, m: number, n: number): Promise<string> {
  const file = await findAdrFile(root, m);
  if (file === null) throw new BatonError(`no ADR ${pad4(m)}`);
  rewriteRecord(absOf(root, file), (lf) =>
    setFrontmatterField(lf, "status", JSON.stringify(supersededStatus(n))),
  );
  return file;
}

export async function createDecision(
  root: string,
  input: CreateDecisionInput,
): Promise<CreateDecisionResult> {
  const { status, supersedes } = input;
  const title = input.title.trim();
  if (title === "" || /[\r\n]/.test(title)) {
    throw new BatonError("a decision needs a one-line title");
  }
  if (status === "accepted" && (input.context === undefined || input.outcome === undefined)) {
    throw new BatonError(
      "an accepted record needs --context and --outcome; create it as proposed and fill it in instead",
    );
  }

  const index = await loadSectionIndex(root, { lenient: true });
  const query: PreflightQuery = { title, paths: input.paths, specIds: input.specIds };
  if (supersedes !== undefined) query.supersedes = supersedes;
  const report = preflight(index, query);
  if (report.unknownSpecIds.length > 0) {
    throw new BatonError(`unknown spec section(s): ${report.unknownSpecIds.join(", ")}`);
  }
  if (supersedes !== undefined) await assertSupersedable(root, supersedes);

  const dir = contextPath(root, DECISIONS);
  const n = await nextAdrNumber(dir);
  const name = adrFileName(n, title);
  if (!/[\p{Letter}\p{Number}]/u.test(title))
    throw new BatonError("title has no letters or digits");
  const verifiedAt = status === "accepted" ? ((await headSha(root))?.slice(0, 12) ?? null) : null;
  const date = localDate(input.now ?? new Date());

  const text = renderAdr({
    number: n,
    title,
    status,
    date,
    deciders: input.deciders,
    verifiedAt,
    sourcePaths: input.paths,
    specSections: input.specIds,
    ...(supersedes === undefined ? {} : { supersedes }),
    ...(input.context === undefined ? {} : { context: input.context }),
    considered: input.considered,
    ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
    consequences: input.consequences,
    moreInformation: preflightMoreInformation(report),
  });

  mkdirSync(dir, { recursive: true });
  const abs = join(dir, name);
  const file = `.context/${DECISIONS}/${name}`;
  try {
    writeFileSync(abs, text, { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new BatonError(`${file} already exists`);
    }
    throw err;
  }

  if (numberTaken(await readdir(dir), n, name)) {
    unlinkSync(abs);
    throw new BatonError(`ADR number ${pad4(n)} was taken concurrently; run decide again`);
  }

  const result: CreateDecisionResult = {
    number: n,
    file,
    status,
    report,
    notes: [],
    placeholders: placeholdersIn(text).length > 0,
  };
  if (status === "accepted" && supersedes !== undefined) {
    result.superseded = { number: supersedes, file: await markSuperseded(root, supersedes, n) };
  }
  for (const id of input.specIds) {
    const section = index.byId.get(id);
    if (section && isLoadBearing(section)) {
      result.notes.push(
        `spec section ${id} is load-bearing; make its text agree with this decision, then baton verify-doc ${id}`,
      );
    }
  }
  return result;
}

export async function acceptDecision(
  root: string,
  n: number,
): Promise<{ number: number; file: string; superseded?: Superseded }> {
  const file = await findAdrFile(root, n);
  if (file === null) throw new BatonError(`no ADR ${pad4(n)}`);
  const abs = absOf(root, file);
  const lf = readLf(abs);

  const status = statusOf(lf) ?? "";
  if (statusKind(status) !== "proposed") {
    throw new BatonError(
      `ADR ${pad4(n)} is ${status || "missing a status"}; only a proposed record can be accepted`,
      ExitCode.Blocked,
    );
  }
  const left = placeholdersIn(lf);
  if (left.length > 0) {
    throw new BatonError(
      `ADR ${pad4(n)} still has template placeholders (${left.join(", ")}); fill them in first`,
      ExitCode.Blocked,
    );
  }
  const m = adrNumberFrom(String(parseFrontmatter(lf).data.supersedes ?? ""));
  if (m !== null) await assertSupersedable(root, m);

  const head = await headSha(root);
  rewriteRecord(abs, (text) => {
    const accepted = setFrontmatterField(text, "status", "accepted");
    return head === null
      ? accepted
      : setFrontmatterField(accepted, "verified_at", JSON.stringify(head.slice(0, 12)));
  });

  const result: { number: number; file: string; superseded?: Superseded } = { number: n, file };
  if (m !== null) result.superseded = { number: m, file: await markSuperseded(root, m, n) };
  return result;
}

export async function listDecisions(root: string): Promise<DecisionListing[]> {
  const index = await loadSectionIndex(root, { lenient: true });
  return index.sections
    .filter((s) => s.doc === "decision" && s.adr !== undefined)
    .sort((a, b) => (a.adr?.number ?? 0) - (b.adr?.number ?? 0))
    .map((s) => {
      const adr = s.adr;
      const by = s.meta.supersededBy;
      const listed: DecisionListing = {
        number: adr?.number ?? 0,
        status:
          by !== undefined && statusKind(adr?.status ?? "") !== "superseded"
            ? `${adr?.status ?? ""}, superseded by ${by}`
            : (adr?.status ?? ""),
        title: s.title,
        file: s.file,
      };
      const sup = adr?.supersedes === undefined ? null : adrNumberFrom(adr.supersedes);
      if (sup !== null) listed.supersedes = sup;
      return listed;
    });
}

export async function runPreflight(root: string, q: PreflightQuery): Promise<PreflightReport> {
  return preflight(await loadSectionIndex(root, { lenient: true }), q);
}
