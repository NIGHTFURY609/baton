import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { ADR_FILE_RE } from "./decisions.js";
import { BatonError, ExitCode } from "./errors.js";
import { parseFileSection, parseFrontmatter, parseSections } from "./frontmatter.js";
import { contextPath } from "./paths.js";
import type { Section } from "./types.js";

/**
 * The section index (ADR 0012): every section of the five .context/ documents,
 * in a fixed order, with cross-file duplicate ids rejected.
 */

export type ContextDoc = "rules" | "spec" | "state" | "knowledge" | "decision";

export interface AdrInfo {
  /** 9 for 0009-*.md. */
  number: number;
  /** MADR status as written, "" when absent. */
  status: string;
  /** `spec_sections`, [] when absent. */
  specSections: string[];
  /** `String(supersedes)` when present and not null. */
  supersedes?: string;
}

export interface IndexedSection extends Section {
  doc: ContextDoc;
  /** Only for doc "decision". */
  adr?: AdrInfo;
}

/** One line, starts with the file. */
export interface IndexProblem {
  file: string;
  message: string;
}

export interface SectionIndex {
  root: string;
  sections: IndexedSection[];
  byId: ReadonlyMap<string, IndexedSection>;
  /** Always [] in strict mode (it throws instead). */
  problems: IndexProblem[];
}

export interface LoadIndexOptions {
  /** Collect problems instead of throwing; broken files are skipped. */
  lenient?: boolean;
}

/** "superseded by ADR-0009" -> "adr-0009". */
export function supersededByFromStatus(status: string): string | undefined {
  const m = /^superseded by\s+(?:adr[-\s]?)?(\d{1,4})\b/i.exec(status);
  return m?.[1] === undefined ? undefined : `adr-${m[1].padStart(4, "0")}`;
}

const isString = (v: unknown): v is string => typeof v === "string";

/** Strip one leading BOM, then normalise CRLF/CR to LF. */
async function readNormalised(abs: string): Promise<string> {
  const text = await readFile(abs, "utf8");
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

async function listMarkdown(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function adrInfo(text: string, number: number): { info: AdrInfo; status: string } {
  const { data } = parseFrontmatter(text);
  const status = typeof data.status === "string" ? data.status : "";
  const info: AdrInfo = {
    number,
    status,
    specSections: Array.isArray(data.spec_sections) ? data.spec_sections.filter(isString) : [],
  };
  if (data.supersedes != null) info.supersedes = String(data.supersedes);
  return { info, status };
}

export async function loadSectionIndex(
  root: string,
  opts: LoadIndexOptions = {},
): Promise<SectionIndex> {
  if (!existsSync(contextPath(root))) {
    return { root, sections: [], byId: new Map(), problems: [] };
  }

  const collected: IndexedSection[] = [];
  const problems: IndexProblem[] = [];

  const fail = (file: string, err: unknown) => {
    const first = (err instanceof Error ? err.message : String(err)).split("\n")[0]?.trim() ?? "";
    problems.push({ file, message: first.startsWith(file) ? first : `${file}: ${first}` });
  };

  /** Read and parse one file; a parser error becomes a problem and the file is skipped. */
  const load = async (
    rel: string,
    doc: ContextDoc,
    parse: (text: string, file: string) => Section[],
    extra?: (text: string, s: IndexedSection) => void,
  ) => {
    const abs = contextPath(root, ...rel.split("/"));
    if (!existsSync(abs)) return;
    const file = `.context/${rel}`;
    try {
      const text = await readNormalised(abs);
      for (const s of parse(text, file)) {
        const indexed: IndexedSection = { ...s, doc };
        extra?.(text, indexed);
        collected.push(indexed);
      }
    } catch (err) {
      fail(file, err);
    }
  };

  const wholeFile = (text: string, file: string): Section[] => {
    const s = parseFileSection(text, file);
    return s ? [s] : [];
  };

  await load("rules.md", "rules", parseSections);
  await load("spec.md", "spec", parseSections);
  await load("STATE.md", "state", wholeFile);

  const knowledge = (await listMarkdown(contextPath(root, "knowledge"))).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  for (const name of knowledge) await load(`knowledge/${name}`, "knowledge", wholeFile);

  const decisions = (await listMarkdown(contextPath(root, "decisions")))
    .flatMap((name) => {
      const m = ADR_FILE_RE.exec(name);
      const number = m?.[1] === undefined ? 0 : Number(m[1]);
      return number >= 1 ? [{ name, number }] : [];
    })
    .sort((a, b) => a.number - b.number);
  for (const { name, number } of decisions) {
    await load(`decisions/${name}`, "decision", wholeFile, (text, s) => {
      const { info, status } = adrInfo(text, number);
      s.adr = info;
      const by = supersededByFromStatus(status);
      if (s.meta.supersededBy === undefined && by !== undefined) s.meta.supersededBy = by;
    });
  }

  const sections: IndexedSection[] = [];
  const byId = new Map<string, IndexedSection>();
  for (const s of collected) {
    const first = byId.get(s.meta.id);
    if (first) {
      problems.push({
        file: s.file,
        message: `${s.file}:${s.line}: duplicate section id "${s.meta.id}" (also in ${first.file}:${first.line})`,
      });
      continue;
    }
    byId.set(s.meta.id, s);
    sections.push(s);
  }

  if (problems.length > 0 && !opts.lenient) {
    throw new BatonError(
      `.context/ has ${problems.length} problem(s):\n${problems.map((p) => `  ${p.message}`).join("\n")}`,
      ExitCode.Error,
    );
  }
  return { root, sections, byId, problems };
}
