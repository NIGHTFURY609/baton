import { loadConfig } from "../config.js";
import { collectFacts, type Fact } from "./facts.js";
import { matchTargets, toKey } from "./match.js";
import { buildIndex, type SkippedFile, type Target, type TargetKind } from "./targets.js";
import {
  DEFAULT_TEMPLATE,
  resolveTemplate,
  type Template,
  type TemplateDirs,
} from "./templates.js";

/**
 * `baton explain`: resolve a name to repo targets, collect literal facts about
 * them, and hand back everything an agent needs to write the explanation. The
 * outcome is plain data (JSON-safe); `renderText` is the human/agent text form.
 */

export const DEFAULT_MAX_WORDS = 150;

export interface TargetRef {
  kind: TargetKind;
  name: string;
  /** Repo path (POSIX) of the file the target lives in. */
  source: string;
  /** 1-based line within `source`. */
  line: number;
}

export interface ExplainResult {
  query: string;
  resolution: "exact" | "closest";
  targets: TargetRef[];
  template: Template;
  maxWords: number;
  facts: Fact[];
  noRecordedReason: boolean;
}

/** `skipped` lists malformed repo files left out of the index; always present. */
export type ExplainOutcome =
  | { status: "ok"; result: ExplainResult; skipped: SkippedFile[] }
  | { status: "tie"; query: string; candidates: TargetRef[]; skipped: SkippedFile[] }
  | { status: "none"; query: string; suggestions: string[]; skipped: SkippedFile[] };

function ref(t: Target): TargetRef {
  return { kind: t.kind, name: t.name, source: t.source, line: t.line };
}

export async function explain(
  root: string,
  query: string,
  opts: { template?: string; dirs: TemplateDirs },
): Promise<ExplainOutcome> {
  // An unknown template is a usage error; fail before doing any repo work.
  const template = await resolveTemplate(opts.dirs, opts.template ?? DEFAULT_TEMPLATE);
  const index = await buildIndex(root);
  const skipped = index.skipped;

  if (toKey(query) === "") return { status: "none", query, suggestions: [], skipped };

  const match = matchTargets(query, index.targets);
  if (match.status === "tie") {
    return { status: "tie", query, candidates: match.candidates.map(ref), skipped };
  }
  if (match.status === "none") {
    return { status: "none", query, suggestions: match.suggestions.map((t) => t.name), skipped };
  }

  const config = await loadConfig(root);
  const { facts, noRecordedReason } = await collectFacts(index, match.matches, config);
  return {
    status: "ok",
    skipped,
    result: {
      query,
      resolution: match.status,
      targets: match.matches.map(ref),
      template,
      maxWords: DEFAULT_MAX_WORDS,
      facts,
      noRecordedReason,
    },
  };
}

// ------------------------------------------------------------------ text

function skippedLines(skipped: SkippedFile[]): string[] {
  return skipped.map((s) => `WARNING skipped ${s.file}: ${s.error}`);
}

function indent(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => `  ${l}`)
    .join("\n");
}

export function renderText(outcome: ExplainOutcome): string {
  if (outcome.status === "tie") {
    return [
      `Ambiguous: "${outcome.query}" could be:`,
      ...outcome.candidates.map((c) => `- ${c.kind} ${c.name} (${c.source})`),
      ...skippedLines(outcome.skipped),
    ].join("\n");
  }
  if (outcome.status === "none") {
    return [
      `Nothing named "${outcome.query}" found.`,
      ...(outcome.suggestions.length > 0
        ? [`Did you mean: ${outcome.suggestions.join(", ")}?`]
        : []),
      ...skippedLines(outcome.skipped),
    ].join("\n");
  }

  const { result } = outcome;
  const first = result.targets[0]?.name ?? result.query;
  const lines = [`# baton explain: ${first}`];
  if (result.resolution === "closest") {
    lines.push(`Closest match: no "${result.query}" found, explaining "${first}" instead.`);
  }
  lines.push(
    `Targets: ${result.targets.map((t) => `${t.kind} ${t.name} (${t.source})`).join(", ")}`,
    `Template: ${result.template.name} (${result.template.source})`,
    `Instructions: ${result.template.prompt.replace(/\r?\n/g, "\n  ")}`,
    `Length: under ${result.maxWords} words unless the user asks for more.`,
  );
  if (result.noRecordedReason) {
    lines.push(
      "WARNING no recorded reason: no ADR or .context section says why this exists. Say so plainly; do not invent a purpose.",
    );
  }
  lines.push(...skippedLines(outcome.skipped), "", "## Facts");
  for (const f of result.facts) {
    lines.push(`- [${f.label}] ${f.source} (${f.provenance})`, indent(f.text));
  }
  return lines.join("\n");
}
