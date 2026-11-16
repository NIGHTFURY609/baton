#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);

// src/core/errors.ts
var ExitCode = {
  Ok: 0,
  Error: 1,
  /** A check failed or an action was blocked (drift --fail-on, verify, compile --check). */
  Blocked: 2,
  /** The command exists in the contract but is not built yet. */
  NotImplemented: 3
};
var BatonError = class extends Error {
  constructor(message, exitCode = ExitCode.Error) {
    super(message);
    this.exitCode = exitCode;
    this.name = "BatonError";
  }
  exitCode;
};
var NotImplementedError = class extends BatonError {
  constructor(feature, phase) {
    super(`${feature} is not implemented yet (planned for ${phase}).`, ExitCode.NotImplemented);
    this.feature = feature;
    this.phase = phase;
    this.name = "NotImplementedError";
  }
  feature;
  phase;
};
function notImplemented(feature, phase) {
  throw new NotImplementedError(feature, phase);
}

export {
  ExitCode,
  BatonError,
  notImplemented
};
//# sourceMappingURL=chunk-YXJRO53B.mjs.map