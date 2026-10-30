import type * as ChildProcess from "node:child_process";
import { promisify } from "node:util";

/**
 * A `node:child_process` that counts execFile and execFileSync (git() and beads use them),
 * delegating to the real implementation; spawn/spawnSync are not counted. For a `vi.mock`
 * factory, so a test can bound subprocess fan-out instead of elapsed time.
 */
export function countingChildProcess(
  actual: typeof ChildProcess,
  spawned: { count: number },
): typeof ChildProcess {
  const real = actual.execFile;
  const counted = ((...args: unknown[]) => {
    spawned.count++;
    return (real as (...a: unknown[]) => unknown)(...args);
  }) as unknown as typeof actual.execFile;
  (counted as unknown as Record<symbol, unknown>)[promisify.custom] = (...args: unknown[]) => {
    spawned.count++;
    return (real as unknown as Record<symbol, (...a: unknown[]) => unknown>)[promisify.custom]?.(
      ...args,
    );
  };
  const realSync = actual.execFileSync;
  const countedSync = ((...args: unknown[]) => {
    spawned.count++;
    return (realSync as (...a: unknown[]) => unknown)(...args);
  }) as unknown as typeof actual.execFileSync;
  return { ...actual, execFile: counted, execFileSync: countedSync };
}
