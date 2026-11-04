import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Config } from "../config.js";
import { run as defaultRun, type Runner } from "./run.js";

export interface Segment {
  /** Start/end in milliseconds from the beginning of the recording. */
  startMs: number;
  endMs: number;
  text: string;
}

export interface Transcript {
  text: string;
  segments: Segment[];
  /** Wall-clock time spent converting + transcribing. */
  elapsedMs: number;
}

/**
 * Whisper tends to "clean up" speech on its own and drop ums and uhs.
 * Voice Out needs to SEE the fillers (so the cleanup step and the UI can show what was cut),
 * so we prime the decoder with a disfluent prompt; Whisper mimics the style of its prompt.
 */
export const DISFLUENCY_PROMPT =
  "Umm, so, like, I was, uh, thinking... you know, I mean, hmm, let me, uh, let me think. Okay, yeah, so basically, like, um.";

interface WhisperJson {
  transcription?: { offsets?: { from: number; to: number }; text: string }[];
}

export function parseWhisperJson(raw: string): Omit<Transcript, "elapsedMs"> {
  const data = JSON.parse(raw) as WhisperJson;
  const segments: Segment[] = (data.transcription ?? [])
    .map((s) => ({
      startMs: s.offsets?.from ?? 0,
      endMs: s.offsets?.to ?? 0,
      text: s.text.trim(),
    }))
    // whisper.cpp emits markers like [BLANK_AUDIO] or (music) for non-speech
    .filter((s) => s.text && !/^[[(].*[\])]$/.test(s.text));
  const text = segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
  return { text, segments };
}

export interface TranscribeDeps {
  run?: Runner;
}

/** Converts any browser/phone audio to 16 kHz mono WAV, then runs whisper.cpp on it. */
export async function transcribe(
  audio: Buffer,
  filename: string,
  config: Config,
  deps: TranscribeDeps = {},
): Promise<Transcript> {
  const run = deps.run ?? defaultRun;
  const started = Date.now();
  const dir = await mkdtemp(path.join(tmpdir(), "voice-out-"));
  try {
    const ext = path.extname(filename) || ".webm";
    const input = path.join(dir, `input${ext}`);
    const wav = path.join(dir, "audio.wav");
    const outBase = path.join(dir, "out");
    await writeFile(input, audio);

    await run(config.ffmpegBin, ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav]);

    await run(config.whisperBin, [
      "-m", config.whisperModel,
      "-f", wav,
      "-l", "en",
      "--prompt", DISFLUENCY_PROMPT,
      "-oj", // write JSON with segment timestamps
      "-of", outBase,
      "-np", // no progress noise
    ]);

    const parsed = parseWhisperJson(await readFile(`${outBase}.json`, "utf8"));
    return { ...parsed, elapsedMs: Date.now() - started };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
