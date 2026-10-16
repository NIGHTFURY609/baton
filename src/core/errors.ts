/** Process exit codes used by every command. Documented in docs/design/architecture.md. */
export const ExitCode = {
  Ok: 0,
  Error: 1,
  /** A check failed or an action was blocked (drift --fail-on, verify, compile --check). */
  Blocked: 2,
  /** The command exists in the contract but is not built yet. */
  NotImplemented: 3,
} as const;

export class BatonError extends Error {
  constructor(
    message: string,
    readonly exitCode: number = ExitCode.Error,
  ) {
    super(message);
    this.name = "BatonError";
  }
}

export class NotImplementedError extends BatonError {
  constructor(
    readonly feature: string,
    readonly phase: string,
  ) {
    super(`${feature} is not implemented yet (planned for ${phase}).`, ExitCode.NotImplemented);
    this.name = "NotImplementedError";
  }
}

export function notImplemented(feature: string, phase: string): never {
  throw new NotImplementedError(feature, phase);
}
