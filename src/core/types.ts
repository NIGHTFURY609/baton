/**
 * Shared domain types. The on-disk format these describe is specified in
 * docs/design/context-format.md; keep the two in sync.
 */

/** What a section is for. Drives its staleness threshold and mutation rule. */
export type SectionKind = "rule" | "intent" | "decision" | "state" | "knowledge";

export const SECTION_KINDS: readonly SectionKind[] = [
  "rule",
  "intent",
  "decision",
  "state",
  "knowledge",
] as const;

/** Provenance carried by every section (inline marker or file frontmatter). */
export interface SectionMeta {
  /** Stable id, unique across .context/ (kebab-case). */
  id: string;
  kind: SectionKind;
  /** Commit SHA at which a human or agent last confirmed the section; null = never verified. */
  verifiedAt: string | null;
  /** Globs (repo-relative, POSIX separators) whose changes can invalidate the section. */
  sourcePaths: string[];
  /** Id of the section or ADR that replaces this one, if any. */
  supersededBy?: string;
}

export interface Section {
  meta: SectionMeta;
  /** Heading text (without the leading #s), or the file title for whole-file sections. */
  title: string;
  /** Markdown body, excluding the heading and the marker. */
  body: string;
  /** Repo-relative path of the file the section lives in. */
  file: string;
  /** 1-based line of the heading (or 1 for whole-file sections). */
  line: number;
}

/**
 * Freshness levels, in increasing order of distrust.
 * - fresh: sources unchanged since verifiedAt -> injected
 * - aging: sources changed, under the stale threshold -> injected with a one-line flag
 * - stale: over threshold, or a dead reference -> withheld, listed as "needs re-verify"
 * - superseded: replaced by a newer section/ADR -> linked, not injected
 * - unverified: verifiedAt is null -> treated like stale until someone verifies it
 */
export type FreshnessLevel = "fresh" | "aging" | "stale" | "superseded" | "unverified";

export interface FreshnessResult {
  level: FreshnessLevel;
  /** Commits touching sourcePaths since verifiedAt (0 when unknown or not applicable). */
  commitsSince: number;
  /** Human-readable reason, suitable for the packet's one-line flag. */
  reason: string;
}

/** Task as seen by baton, normalised across task-store backends. */
export interface Task {
  id: string;
  title: string;
  status: "open" | "in_progress" | "blocked" | "deferred" | "closed";
  priority?: number;
  description?: string;
  /** Spec section ids this task is tagged to (label `spec:<id>` in Beads). */
  specSections: string[];
  /** Shell command `baton verify` runs to decide whether the task is done. */
  checkCommand?: string;
}

export type Harness = "claude" | "codex" | "gemini";
