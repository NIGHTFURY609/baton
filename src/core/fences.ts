/**
 * The one fenced-code scanner. Every module that must not read `#` lines,
 * markers or inline code inside a code block (section parser, drift, explain)
 * shares it, so they agree on where a fence starts and ends.
 *
 * CommonMark rules: an opening fence is 3+ backticks or tildes indented at most
 * 3 spaces; it closes at a line of the same character, at least as long, with
 * nothing after it; an unclosed fence runs to the end of the text.
 */

export interface Fence {
  /** Line index of the opening fence. */
  open: number;
  /** Line index of the closing fence (last line when unclosed). */
  close: number;
  info: string;
}

export function findFences(lines: readonly string[]): Fence[] {
  const fences: Fence[] = [];
  let open: { index: number; char: string; size: number; info: string } | null = null;
  lines.forEach((line, i) => {
    if (open) {
      const m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (m && m[1]?.[0] === open.char && (m[1]?.length ?? 0) >= open.size) {
        fences.push({ open: open.index, close: i, info: open.info });
        open = null;
      }
      return;
    }
    const m = /^ {0,3}(`{3,}|~{3,})\s*(.*)$/.exec(line);
    if (m)
      open = {
        index: i,
        char: m[1]?.[0] ?? "`",
        size: m[1]?.length ?? 3,
        info: (m[2] ?? "").trim(),
      };
  });
  const unclosed = open as { index: number; info: string } | null;
  if (unclosed) fences.push({ open: unclosed.index, close: lines.length - 1, info: unclosed.info });
  return fences;
}

/** Per line: true for the fence lines themselves and everything between them. */
export function fencedLines(lines: readonly string[]): boolean[] {
  const mask: boolean[] = new Array<boolean>(lines.length).fill(false);
  for (const f of findFences(lines)) {
    for (let i = f.open; i <= f.close; i++) mask[i] = true;
  }
  return mask;
}
