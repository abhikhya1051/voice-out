import { spawn } from "node:child_process";

export interface RunResult {
  stdout: string;
  stderr: string;
}

/** A command that started but failed. `crashed` means it was killed by a signal (abort, segfault) rather than exiting. */
export class RunError extends Error {
  constructor(
    message: string,
    readonly cmd: string,
    readonly stderr: string,
    readonly crashed: boolean,
  ) {
    super(message);
  }
}

/** The useful part of a long stderr: lines that name the problem, else the last few lines. */
export function summarizeStderr(stderr: string): string {
  const lines = stderr.split("\n").map((l) => l.trim()).filter(Boolean);
  const telling = lines.filter((l) => /error|assert|failed|unable|cannot|not found|invalid/i.test(l));
  return (telling.length ? telling.slice(0, 3) : lines.slice(-3)).join("\n");
}

/** Runs a command and resolves with its output; rejects with a RunError on failure. */
export function run(cmd: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err: NodeJS.ErrnoException) => {
      reject(
        err.code === "ENOENT"
          ? new Error(`"${cmd}" was not found. Run \`npm run setup:whisper\` or fix the path in .env.`)
          : err,
      );
    });
    child.on("close", (code, signal) => {
      if (code === 0) return resolve({ stdout, stderr });
      const detail = summarizeStderr(stderr);
      const how = signal ? `crashed (${signal})` : `exited with code ${code}`;
      reject(new RunError(`${cmd} ${how}${detail ? `: ${detail}` : ""}`, cmd, stderr, code === null));
    });
  });
}

export type Runner = typeof run;
