import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Config } from "../config.js";
import { run as defaultRun, RunError, type Runner } from "./run.js";

/** One spoken word with its punctuation attached, e.g. "um," or "Tuesday." */
export interface Word {
  text: string;
  startMs: number;
  endMs: number;
}

export interface Segment {
  startMs: number;
  endMs: number;
  text: string;
  /** Index of this segment's first word in `Transcript.words`. */
  firstWord: number;
  /** Index one past this segment's last word. */
  endWord: number;
}

export interface Transcript {
  text: string;
  words: Word[];
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

interface WhisperToken {
  text: string;
  offsets?: { from: number; to: number };
}
interface WhisperJson {
  transcription?: { offsets?: { from: number; to: number }; text: string; tokens?: WhisperToken[] }[];
}

const NON_SPEECH = /^[[(].*[\])]$/;

/**
 * Turns whisper.cpp's full JSON (-ojf) into words with timestamps.
 * Whisper emits sub-word tokens; a token that starts with a space begins a new word,
 * anything else (", " "ing" "'s") is glued onto the previous word.
 * Without token data it falls back to spreading the segment's time evenly over its words.
 */
export function parseWhisperJson(raw: string): Omit<Transcript, "elapsedMs"> {
  const data = JSON.parse(raw) as WhisperJson;
  const words: Word[] = [];
  const segments: Segment[] = [];

  for (const seg of data.transcription ?? []) {
    const segText = seg.text.trim();
    if (!segText || NON_SPEECH.test(segText)) continue;
    const segStart = seg.offsets?.from ?? 0;
    const segEnd = seg.offsets?.to ?? segStart;
    const firstWord = words.length;

    const tokens = (seg.tokens ?? []).filter((t) => t.text && !t.text.startsWith("[_") && !NON_SPEECH.test(t.text.trim()));
    if (tokens.length > 0) {
      for (const tok of tokens) {
        const from = tok.offsets?.from ?? segStart;
        const to = tok.offsets?.to ?? from;
        const last = words[words.length - 1];
        if (tok.text.startsWith(" ") || !last || words.length === firstWord) {
          const text = tok.text.trim();
          if (text) words.push({ text, startMs: from, endMs: to });
        } else {
          last.text += tok.text;
          last.endMs = to;
        }
      }
    } else {
      const parts = segText.split(/\s+/);
      const step = (segEnd - segStart) / parts.length;
      parts.forEach((text, i) =>
        words.push({ text, startMs: Math.round(segStart + i * step), endMs: Math.round(segStart + (i + 1) * step) }),
      );
    }

    if (words.length > firstWord) {
      segments.push({
        startMs: segStart,
        endMs: segEnd,
        text: words.slice(firstWord).map((w) => w.text).join(" "),
        firstWord,
        endWord: words.length,
      });
    }
  }

  return { text: words.map((w) => w.text).join(" "), words, segments };
}

export interface TranscribeDeps {
  run?: Runner;
  /** Called when the GPU run fails and transcription retries on the CPU. */
  onGpuFallback?: (err: RunError) => void;
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

    const args = [
      "-m", config.whisperModel,
      "-f", wav,
      "-l", "en",
      "--prompt", DISFLUENCY_PROMPT,
      "-oj", "-ojf", // JSON with per-token timestamps, so every word knows when it was said
      "-of", outBase,
      "-np",
    ];
    if (!config.whisperGpu) {
      await run(config.whisperBin, [...args, "-ng"]);
    } else {
      try {
        await run(config.whisperBin, args);
      } catch (err) {
        // Some whisper.cpp builds crash while setting up the GPU (Metal). The CPU path is
        // still fast on Apple Silicon, so retry there instead of failing the recording.
        if (!(err instanceof RunError)) throw err;
        deps.onGpuFallback?.(err);
        await run(config.whisperBin, [...args, "-ng"]);
      }
    }

    const parsed = parseWhisperJson(await readFile(`${outBase}.json`, "utf8"));
    return { ...parsed, elapsedMs: Date.now() - started };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
