/**
 * Upper bound for a scan of pathological input, in tests where elapsed time is the only signal
 * of a regex or quadratic blowup. A linear scan takes a few milliseconds, and a blowup on these
 * sizes takes minutes, so a loaded machine stays far under it. Prefer asserting behaviour.
 */
export const BLOWUP_MS = 10_000;
