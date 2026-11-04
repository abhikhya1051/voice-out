import { spawn } from "node:child_process";

export interface RunResult {
  stdout: string;
  stderr: string;
}

/** Runs a command and resolves with its output; rejects with stderr on a non-zero exit. */
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
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim().split("\n").slice(-5).join("\n")}`));
    });
  });
}

export type Runner = typeof run;
