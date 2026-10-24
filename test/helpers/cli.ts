import { type Command, CommanderError } from "commander";
import { buildProgram } from "../../src/program.js";

/** exitOverride does not reach subcommands that already exist, so walk the tree. */
function configure(cmd: Command, sink: { out: string; err: string }): void {
  cmd.exitOverride();
  cmd.configureOutput({
    writeOut: (s) => {
      sink.out += s;
    },
    writeErr: (s) => {
      sink.err += s;
    },
  });
  for (const sub of cmd.commands) configure(sub, sink);
}

/** Run the real program in-process from `cwd`, capturing stdout, stderr and the exit code. */
export async function runCli(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const previousCwd = process.cwd();
  process.chdir(cwd);
  process.exitCode = undefined;

  const sink = { out: "", err: "" };
  const origOut = process.stdout.write;
  const origErr = process.stderr.write;
  process.stdout.write = ((chunk: unknown) => {
    sink.out += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => {
    sink.err += String(chunk);
    return true;
  }) as typeof process.stderr.write;

  let commanderExit: number | undefined;
  try {
    const program = buildProgram();
    configure(program, sink);
    await program.parseAsync(["node", "baton", ...args]);
  } catch (err) {
    if (err instanceof CommanderError) commanderExit = err.exitCode;
    else throw err;
  } finally {
    process.chdir(previousCwd);
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  const exitCode = commanderExit ?? Number(process.exitCode ?? 0);
  process.exitCode = undefined;
  return { stdout: sink.out, stderr: sink.err, exitCode };
}
