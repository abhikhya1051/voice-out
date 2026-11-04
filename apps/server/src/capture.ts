/**
 * Capture mode (npm run dev:capture): records a real memo end to end and saves it to demo/,
 * so `npm run demo` can replay a genuine Whisper transcript and a genuine model cleanup
 * without any setup. The last take wins.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.js";
import type { CleanResult } from "./clean/pipeline.js";
import { CleanupSchema, type Cleanup } from "./clean/schema.js";
import type { Transcript } from "./transcribe/whisper.js";

export const DEMO_DIR = path.join(ROOT, "demo");

export interface CapturedMemo {
  transcript: Transcript;
  cleanup: Cleanup;
  /** The model that wrote the cleanup, e.g. gemini-3.1-flash-lite. */
  model: string;
  /** The day it was recorded, so replayed dates match the original. */
  recordedOn: string;
  /** File name of the recording inside demo/, if one was saved. */
  audioFile: string | null;
}

export async function saveTranscript(dir: string, audio: Buffer, filename: string, transcript: Transcript): Promise<void> {
  await mkdir(dir, { recursive: true });
  // A new take replaces the old one entirely, including a stale cleanup
  for (const f of await readdir(dir)) if (/^(memo\.|cleanup\.json$)/.test(f)) await rm(path.join(dir, f));
  const ext = (path.extname(filename) || ".webm").toLowerCase();
  await writeFile(path.join(dir, `memo${ext}`), audio);
  await writeFile(path.join(dir, "transcript.json"), JSON.stringify(transcript, null, 2));
}

export async function saveCleanup(dir: string, result: CleanResult, recordedOn: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const saved = { recordedOn, model: result.model, cleanup: result.cleanup };
  await writeFile(path.join(dir, "cleanup.json"), JSON.stringify(saved, null, 2));
}

/** The captured memo in demo/, or null if there isn't a complete one. */
export function loadCaptured(dir: string = DEMO_DIR): CapturedMemo | null {
  const transcriptPath = path.join(dir, "transcript.json");
  const cleanupPath = path.join(dir, "cleanup.json");
  if (!existsSync(transcriptPath) || !existsSync(cleanupPath)) return null;
  try {
    const transcript = JSON.parse(readFileSync(transcriptPath, "utf8")) as Transcript;
    const saved = JSON.parse(readFileSync(cleanupPath, "utf8")) as { recordedOn: string; model: string; cleanup: unknown };
    const cleanup = CleanupSchema.parse(saved.cleanup);
    if (!Array.isArray(transcript.words) || !transcript.words.length) return null;
    const audioFile = readdirSync(dir).find((f) => f.startsWith("memo.")) ?? null;
    return { transcript, cleanup, model: saved.model, recordedOn: saved.recordedOn, audioFile };
  } catch {
    return null;
  }
}
