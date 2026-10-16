/**
 * Budgeting for the mission packet. The binding limit is characters, not
 * tokens: Claude Code caps SessionStart context at 10,000 characters. Token
 * figures are estimates for reporting only; `baton stats` uses real usage
 * numbers from the session log.
 */

/** Rough chars-per-token for English prose and code. Reporting only. */
export const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface PacketBlock {
  /** Stable key, e.g. "state", "task:bd-a1b2", "spec:auth". */
  key: string;
  /** Lower numbers are kept first. */
  priority: number;
  text: string;
}

export interface FitResult {
  kept: PacketBlock[];
  dropped: PacketBlock[];
  chars: number;
}

/**
 * Greedy fit: keep blocks in priority order (stable for ties) while the joined
 * output stays within maxChars. A block that does not fit is dropped whole;
 * smaller, lower-priority blocks after it may still fit. Never truncates a
 * block mid-way, so nothing half-stated reaches the model.
 */
export function fitToBudget(
  blocks: PacketBlock[],
  maxChars: number,
  separator = "\n\n",
): FitResult {
  const ordered = blocks
    .map((b, i) => ({ b, i }))
    .sort((x, y) => x.b.priority - y.b.priority || x.i - y.i)
    .map(({ b }) => b);

  const kept: PacketBlock[] = [];
  const dropped: PacketBlock[] = [];
  let chars = 0;
  for (const block of ordered) {
    const cost = block.text.length + (kept.length > 0 ? separator.length : 0);
    if (chars + cost <= maxChars) {
      kept.push(block);
      chars += cost;
    } else {
      dropped.push(block);
    }
  }
  return { kept, dropped, chars };
}
