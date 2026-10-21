import { extname } from "node:path";
import type { Config } from "../config.js";
import { classifyFreshness } from "../freshness.js";
import { commitsTouching } from "../git.js";
import { matchesAny } from "../glob.js";
import { CONTEXT_DIR } from "../paths.js";
import type { FreshnessLevel, Section } from "../types.js";
import { findFences, headingTargets, type RepoIndex, readLines, type Target } from "./targets.js";

/**
 * The evidence `baton explain` answers from: literal facts read out of the repo,
 * each with a `path:line` source and a provenance. A fact never paraphrases.
 * `noRecordedReason` is the "nobody wrote down why" signal the answer must state
 * plainly instead of inventing a rationale.
 */

export type Provenance = FreshnessLevel | "no provenance";
export type FactLabel =
  | "package"
  | "import"
  | "section"
  | "decision"
  | "doc"
  | "layout"
  | "source"
  | "diagram";

export interface Fact {
  label: FactLabel;
  /** `path:line`, POSIX path. */
  source: string;
  text: string;
  provenance: Provenance;
}

export interface FactBundle {
  facts: Fact[];
  /** True when no `.context/` section or decision backs the targets. Decided before the MAX_FACTS cut. */
  noRecordedReason: boolean;
}

export const FACT_TEXT_MAX = 1200;
export const MAX_FACTS = 20;
export const MAX_LISTED = 10;

/** Kept-first order when there are more than MAX_FACTS. */
const LABEL_ORDER: FactLabel[] = [
  "section",
  "decision",
  "doc",
  "package",
  "diagram",
  "layout",
  "source",
  "import",
];

/** The heading syntax `parseSections` uses to close a section (fence-unaware, like the parser). */
const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx"]);

export async function collectFacts(
  index: RepoIndex,
  targets: Target[],
  config: Config,
): Promise<FactBundle> {
  const ctx = new Collector(index, config);
  const all: Fact[] = [];
  for (const target of targets) all.push(...(await ctx.factsFor(target)));

  const seen = new Set<string>();
  const unique = all.filter((f) => {
    const key = `${f.label}\0${f.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const facts = unique.map((f) => ({ ...f, text: truncate(f.text) }));

  const noRecordedReason = !facts.some((f) => f.label === "section" || f.label === "decision");
  const ranked = LABEL_ORDER.flatMap((label) => facts.filter((f) => f.label === label));
  return { facts: ranked.slice(0, MAX_FACTS), noRecordedReason };
}

function truncate(text: string): string {
  return text.length > FACT_TEXT_MAX ? `${text.slice(0, FACT_TEXT_MAX)}…` : text;
}

// -------------------------------------------------------------- mentions

/** Characters that end a token besides whitespace and the text's ends. */
const BOUNDARY = "`\"'()\\[\\],.:;";

/**
 * Whether `text` contains `name` as a whole token, case-insensitively. With
 * `strictCase` (dependency names, which are common words: `yaml`, `next`,
 * `react`) a mention must match the case exactly, or be wrapped in backticks or
 * quotes, so prose like "YAML flow mapping" does not back the package `yaml`.
 */
function mentions(text: string, name: string, strictCase = false): boolean {
  if (name === "") return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const edge = `[^\\s${BOUNDARY}]`;
  const token = (flags: string) => new RegExp(`(?<!${edge})${escaped}(?!${edge})`, flags);
  if (!strictCase) return token("i").test(text);
  return token("").test(text) || new RegExp(`([\`"'])${escaped}\\1`, "i").test(text);
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

// ------------------------------------------------------------- collector

class Collector {
  private readonly lineCache = new Map<string, string[] | null>();
  private readonly commitCache = new Map<string, number>();

  constructor(
    private readonly index: RepoIndex,
    private readonly config: Config,
  ) {}

  async factsFor(target: Target): Promise<Fact[]> {
    switch (target.kind) {
      case "dependency":
        return [
          ...(await this.packageFact(target)),
          ...(await this.importFacts(target.name)),
          ...(await this.mentionFacts(target.name, () => false, true)),
        ];
      case "section":
        return [
          await this.sectionFact(target.section, this.isDecision(target.section)),
          ...(await this.citingDecisions(target.section.meta.id)),
          ...this.sourceFact(target.section),
        ];
      case "heading":
        return [
          ...docFact(target.source, target.line, target.body),
          ...(await this.mentionFacts(target.name, () => false)),
        ];
      case "file":
        return [
          ...(await this.layoutFacts(basename(target.name))),
          ...(await this.mentionFacts(target.name, (paths) => this.touches(target, paths))),
        ];
      case "mermaid":
        return [
          diagramFact(target),
          ...(await this.enclosingDoc(target)),
          ...(await this.mentionFacts(target.name, () => false)),
        ];
    }
  }

  // ------------------------------------------------------------ provenance

  private async provenance(section: Section): Promise<Provenance> {
    const { meta } = section;
    let commitsSince = 0;
    if (meta.verifiedAt) {
      const key = `${section.file}\0${meta.id}`;
      let cached = this.commitCache.get(key);
      if (cached === undefined) {
        try {
          cached = await commitsTouching(this.index.root, meta.verifiedAt, meta.sourcePaths);
        } catch {
          cached = 0; // unknown sha, shallow clone, no git: nothing to count
        }
        this.commitCache.set(key, cached);
      }
      commitsSince = cached;
    }
    return classifyFreshness({ meta, commitsSince }, this.config.freshness.staleAfter).level;
  }

  private isDecision(section: Section): boolean {
    return this.index.decisions.some((d) => d.section === section);
  }

  private async sectionFact(section: Section, asDecision: boolean): Promise<Fact> {
    return {
      label: asDecision ? "decision" : "section",
      source: `${section.file}:${section.line}`,
      text: section.body || section.title,
      provenance: await this.provenance(section),
    };
  }

  // -------------------------------------------------------------- dependency

  private async packageFact(target: Target): Promise<Fact[]> {
    const line = (await this.lines(target.source))?.[target.line - 1];
    if (line === undefined) return [];
    return [
      {
        label: "package",
        source: `${target.source}:${target.line}`,
        text: line.trim(),
        provenance: "no provenance",
      },
    ];
  }

  private async importFacts(name: string): Promise<Fact[]> {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(?:\\bfrom\\s*|\\brequire\\(\\s*|\\bimport\\(\\s*)(["'])${escaped}(?:/[^"']*)?\\1`,
    );
    const facts: Fact[] = [];
    for (const file of this.index.files) {
      if (facts.length >= MAX_LISTED) break;
      if (!SOURCE_EXTENSIONS.has(extname(file))) continue;
      const lines = await this.lines(file);
      const at = lines?.findIndex((l) => re.test(l)) ?? -1;
      if (lines && at >= 0) {
        facts.push({
          label: "import",
          source: `${file}:${at + 1}`,
          text: (lines[at] ?? "").trim(),
          provenance: "no provenance",
        });
      }
    }
    return facts;
  }

  // ------------------------------------------------------------------ section

  private async citingDecisions(id: string): Promise<Fact[]> {
    const facts: Fact[] = [];
    for (const d of this.index.decisions) {
      if (d.specSections.includes(id)) facts.push(await this.sectionFact(d.section, true));
    }
    return facts;
  }

  private sourceFact(section: Section): Fact[] {
    const matched = this.index.files.filter((f) => matchesAny(f, section.meta.sourcePaths));
    if (matched.length === 0) return [];
    const listed = matched.slice(0, MAX_LISTED).join(", ");
    const more = matched.length > MAX_LISTED ? ` (+${matched.length - MAX_LISTED} more)` : "";
    return [
      {
        label: "source",
        source: `${section.file}:${section.line}`,
        text: `${listed}${more}`,
        provenance: "no provenance",
      },
    ];
  }

  // --------------------------------------------------------------------- file

  /** Lines of non-mermaid fenced blocks in docs/**\/*.md that start with `base` or `base/`. */
  private async layoutFacts(base: string): Promise<Fact[]> {
    const facts: Fact[] = [];
    for (const file of this.index.files) {
      if (!matchesAny(file, ["docs/**/*.md"])) continue;
      const lines = await this.lines(file);
      if (!lines) continue;
      for (const fence of findFences(lines)) {
        if (/^mermaid\b/i.test(fence.info)) continue;
        for (let i = fence.open + 1; i < fence.close; i++) {
          const line = lines[i] ?? "";
          const first = line.trim().split(/\s+/)[0];
          if (first === base || first === `${base}/`) {
            facts.push({
              label: "layout",
              source: `${file}:${i + 1}`,
              text: line.trim(),
              provenance: "no provenance",
            });
          }
        }
      }
    }
    return facts;
  }

  /** Whether a file (or any file under a directory) matches one of the source-path globs. */
  private touches(target: Target & { kind: "file" }, globs: string[]): boolean {
    if (globs.length === 0) return false;
    if (!target.isDir) return matchesAny(target.name, globs);
    const prefix = `${target.name}/`;
    return this.index.files.some((f) => f.startsWith(prefix) && matchesAny(f, globs));
  }

  // ------------------------------------------------------------------ mermaid

  /**
   * What encloses the diagram's fence. In `.context/` files that is the section
   * the fence sits in (with its freshness, never "no provenance"); elsewhere it
   * is the body of the nearest heading above, read with the index's own heading
   * parser so README and docs agree.
   */
  private async enclosingDoc(target: Target & { kind: "mermaid" }): Promise<Fact[]> {
    if (target.source.startsWith(`${CONTEXT_DIR}/`)) {
      let best: Section | null = null;
      for (const s of [
        ...this.index.contextSections,
        ...this.index.decisions.map((d) => d.section),
      ]) {
        if (s.file !== target.source || s.line > target.line) continue;
        if (!best || s.line > best.line) best = s;
      }
      if (!best || !(await this.spanReaches(best, target.line))) return [];
      return [await this.sectionFact(best, this.isDecision(best))];
    }
    const lines = await this.lines(target.source);
    if (!lines) return [];
    let best: (Target & { kind: "heading" }) | null = null;
    for (const t of headingTargets(target.source, lines)) {
      if (t.kind !== "heading" || t.line > target.line) continue;
      if (!best || t.line > best.line) best = t;
    }
    return best ? docFact(best.source, best.line, best.body) : [];
  }

  /**
   * Whether `section` still covers `line`. A marked section in a multi-section
   * file ends at the next heading of the same or higher level (marked or not),
   * so a diagram under a later unmarked heading is not part of it. Whole-file
   * sections (no heading at their line) cover the entire file.
   */
  private async spanReaches(section: Section, line: number): Promise<boolean> {
    const lines = await this.lines(section.file);
    if (!lines) return false;
    const own = HEADING_LINE.exec(lines[section.line - 1] ?? "");
    if (!own) return true;
    const level = (own[1] ?? "#").length;
    for (let i = section.line; i < line - 1; i++) {
      const h = HEADING_LINE.exec(lines[i] ?? "");
      if (h && (h[1] ?? "#").length <= level) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ shared

  /**
   * Decisions, then context sections, whose text mentions `name` (or, when
   * `byPath` says so, whose source paths cover the target).
   */
  private async mentionFacts(
    name: string,
    byPath: (sourcePaths: string[]) => boolean,
    strictCase = false,
  ): Promise<Fact[]> {
    const hit = (s: Section) =>
      mentions(`${s.title}\n${s.body}`, name, strictCase) || byPath(s.meta.sourcePaths);
    const facts: Fact[] = [];
    for (const d of this.index.decisions) {
      if (hit(d.section)) facts.push(await this.sectionFact(d.section, true));
    }
    for (const s of this.index.contextSections) {
      if (hit(s)) facts.push(await this.sectionFact(s, false));
    }
    return facts;
  }

  private async lines(repoPath: string): Promise<string[] | null> {
    if (!this.lineCache.has(repoPath)) {
      this.lineCache.set(repoPath, await readLines(this.index.root, repoPath));
    }
    return this.lineCache.get(repoPath) ?? null;
  }
}

function docFact(source: string, line: number, body: string): Fact[] {
  if (body === "") return [];
  return [{ label: "doc", source: `${source}:${line}`, text: body, provenance: "no provenance" }];
}

function diagramFact(target: Target & { kind: "mermaid" }): Fact {
  const list = (names: string[]) => (names.length > 0 ? names.join(", ") : "none");
  return {
    label: "diagram",
    source: `${target.source}:${target.line}`,
    text: `${target.name}: in ← ${list(target.edgesIn)}; out → ${list(target.edgesOut)}`,
    provenance: "no provenance",
  };
}
