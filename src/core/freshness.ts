import type { Config } from "./config.js";
import type { FreshnessResult, SectionMeta } from "./types.js";

export interface FreshnessInput {
  meta: SectionMeta;
  /** Commits touching meta.sourcePaths in verifiedAt..HEAD. Ignored when verifiedAt is null. */
  commitsSince: number;
  /** Paths or identifiers the section references that no longer exist. */
  deadRefs?: string[];
}

/**
 * Pure classifier: no git, no filesystem. The caller (drift / mission) gathers
 * commit counts and dead references; this decides the level. Order matters:
 * superseded beats everything, then unverified, then dead refs, then commits.
 */
export function classifyFreshness(
  input: FreshnessInput,
  staleAfter: Config["freshness"]["staleAfter"],
): FreshnessResult {
  const { meta, commitsSince, deadRefs = [] } = input;

  if (meta.supersededBy) {
    return { level: "superseded", commitsSince, reason: `superseded by ${meta.supersededBy}` };
  }
  if (meta.verifiedAt === null) {
    return { level: "unverified", commitsSince: 0, reason: "never verified" };
  }
  if (deadRefs.length > 0) {
    return {
      level: "stale",
      commitsSince,
      reason: `dead reference${deadRefs.length > 1 ? "s" : ""}: ${deadRefs.join(", ")}`,
    };
  }
  if (meta.sourcePaths.length === 0 || commitsSince === 0) {
    return { level: "fresh", commitsSince, reason: "sources unchanged since verification" };
  }
  const threshold = staleAfter[meta.kind];
  if (threshold !== null && commitsSince >= threshold) {
    return {
      level: "stale",
      commitsSince,
      reason: `${commitsSince} commits touched sources since ${meta.verifiedAt.slice(0, 7)}`,
    };
  }
  return {
    level: "aging",
    commitsSince,
    reason: `${commitsSince} commit${commitsSince > 1 ? "s" : ""} touched sources since ${meta.verifiedAt.slice(0, 7)}`,
  };
}

/** Whether a section at this level may be injected into the mission packet. */
export function isInjectable(level: FreshnessResult["level"]): boolean {
  return level === "fresh" || level === "aging";
}
