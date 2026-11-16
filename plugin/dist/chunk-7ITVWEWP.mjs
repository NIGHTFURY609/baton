#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);

// src/core/fences.ts
function findFences(lines) {
  const fences = [];
  let open = null;
  lines.forEach((line, i) => {
    if (open) {
      const m2 = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (m2 && m2[1]?.[0] === open.char && (m2[1]?.length ?? 0) >= open.size) {
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
        info: (m[2] ?? "").trim()
      };
  });
  const unclosed = open;
  if (unclosed) fences.push({ open: unclosed.index, close: lines.length - 1, info: unclosed.info });
  return fences;
}
function fencedLines(lines) {
  const mask = new Array(lines.length).fill(false);
  for (const f of findFences(lines)) {
    for (let i = f.open; i <= f.close; i++) mask[i] = true;
  }
  return mask;
}

export {
  findFences,
  fencedLines
};
//# sourceMappingURL=chunk-7ITVWEWP.mjs.map