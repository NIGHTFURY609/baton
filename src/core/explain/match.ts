/**
 * Name matching for `baton explain`: normalise a query and the repo's names to
 * comparable keys, then resolve to an exact hit, a closest hit, a tie the caller
 * must ask about, or nothing (with suggestions). Pure; no IO.
 */

/** Lowercase, fold accents, collapse every run of non-letter/non-number to "-", trim "-". */
export function toKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Levenshtein distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(
        (prev[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
    }
    prev = row;
  }
  return prev[b.length] as number;
}

export interface Matchable {
  kind: string;
  name: string;
  /** Already passed through toKey. */
  keys: string[];
}

export type MatchResult<T extends Matchable> =
  | { status: "exact"; matches: T[] }
  | { status: "closest"; matches: T[] }
  | { status: "tie"; candidates: T[] }
  | { status: "none"; suggestions: T[] };

const MAX_SUGGESTIONS = 3;
/** Keys shorter than this (one-letter mermaid ids) are too weak to fuzzy-match. */
const MIN_FUZZY_KEY = 3;

function distanceTo(q: string, target: Matchable): number {
  let best = Number.POSITIVE_INFINITY;
  for (const key of target.keys) {
    if (key.length < MIN_FUZZY_KEY) continue;
    best = Math.min(best, editDistance(q, key));
  }
  return best;
}

export function matchTargets<T extends Matchable>(
  query: string,
  targets: readonly T[],
): MatchResult<T> {
  const q = toKey(query);

  const exact = targets.filter((t) => t.keys.includes(q));
  if (exact.length > 0) {
    const files = exact.filter((t) => t.kind === "file");
    const others = exact.filter((t) => t.kind !== "file");

    // A query spelled as one file's full path picks that file: `README.md` is the
    // root README even though `templates/README.md` shares its basename.
    const byPath = files.filter((f) => toKey(f.name) === q);
    if (byPath.length === 1) return { status: "exact", matches: [...others, ...byPath] };

    // One name that is a spec id, a heading and a directory at once is "one concept,
    // not a tie: merge" (spec, "Exact match in several kinds"). The same-basename
    // files are the only ambiguous part, so they are dropped, not tied on.
    if (others.length > 0) return { status: "exact", matches: others };

    // Only files left: two different ones sharing a key (a basename) are different things.
    if (files.length > 1 && new Set(files.map((f) => f.name)).size > 1) {
      return { status: "tie", candidates: files };
    }
    return { status: "exact", matches: exact };
  }

  const scored = targets.map((target) => ({ target, distance: distanceTo(q, target) }));
  const threshold = Math.min(3, Math.max(1, Math.floor(q.length / 3)));
  const minDistance = scored.reduce((m, s) => Math.min(m, s.distance), Number.POSITIVE_INFINITY);

  if (minDistance <= threshold) {
    const best = scored.filter((s) => s.distance === minDistance).map((s) => s.target);
    const groups = new Set(best.map((t) => toKey(t.name)));
    return groups.size === 1
      ? { status: "closest", matches: best }
      : { status: "tie", candidates: best };
  }

  // A suggestion further away than this is noise, not help.
  const farthest = Math.max(3, Math.floor(q.length / 2));
  const suggestions: T[] = [];
  const seen = new Set<string>();
  for (const { target, distance } of [...scored].sort((a, b) => a.distance - b.distance)) {
    if (distance > farthest) break;
    const name = toKey(target.name);
    if (seen.has(name)) continue;
    seen.add(name);
    suggestions.push(target);
    if (suggestions.length === MAX_SUGGESTIONS) break;
  }
  return { status: "none", suggestions };
}
