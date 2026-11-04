import { loadCaptured, type CapturedMemo } from "./capture.js";
import { normalizeCleanup } from "./clean/normalize.js";
import { SAMPLE_TOOL_INPUT, SAMPLE_WORDS } from "./clean/fixtures.js";
import { checkCleanup, type CleanResult } from "./clean/pipeline.js";
import { localToday } from "./dates/resolve.js";
import type { Cleanup } from "./clean/schema.js";
import type { Transcript, Word } from "./transcribe/whisper.js";

/**
 * Demo mode (npm run demo): no Whisper, no API key. Any recording "transcribes" to the demo
 * memo and gets its saved cleanup; the correction detector, date resolver and fact check
 * still run for real. The demo memo is the one in demo/ (a real recording captured with
 * npm run dev:capture), or the built-in sample if there isn't one.
 */
export interface DemoSource {
  transcript: (durationMs: number) => Transcript;
  clean: (words: string[], mustKeep: number[], recordedOn?: string) => CleanResult;
  /** Shown in the server log. */
  description: string;
}

export function demoSource(captured: CapturedMemo | null = loadCaptured()): DemoSource {
  if (captured) {
    return {
      description: `the captured memo in demo/ (${captured.transcript.words.length} words, cleaned by ${captured.model})`,
      transcript: () => captured.transcript,
      // Use the original recording day so "tomorrow" means what it meant then
      clean: (words, mustKeep) => ({
        ...checkCleanup(words, captured.cleanup, captured.recordedOn, mustKeep),
        model: `${captured.model} (captured)`,
        elapsedMs: 1400,
      }),
    };
  }
  return { description: "the built-in sample memo", transcript: sampleTranscript, clean: sampleClean };
}

export function sampleTranscript(durationMs: number): Transcript {
  const total = Math.max(durationMs, 21000);
  const step = total / SAMPLE_WORDS.length;
  const words: Word[] = SAMPLE_WORDS.map((text, i) => ({ text, startMs: Math.round(i * step), endMs: Math.round((i + 0.9) * step) }));
  const breaks = [0, 12, 32, 55, words.length];
  const segments = breaks.slice(0, -1).map((first, k) => {
    const end = breaks[k + 1]!;
    return {
      firstWord: first,
      endWord: end,
      startMs: words[first]!.startMs,
      endMs: words[end - 1]!.endMs,
      text: words.slice(first, end).map((w) => w.text).join(" "),
    };
  });
  return { text: SAMPLE_WORDS.join(" "), words, segments, elapsedMs: 900 };
}

export function sampleClean(words: string[], mustKeep: number[], recordedOn: string = localToday()): CleanResult {
  const cleanup = normalizeCleanup(SAMPLE_TOOL_INPUT as Cleanup, words.length, mustKeep);
  return { ...checkCleanup(words, cleanup, recordedOn, mustKeep), model: "demo (recorded response)", elapsedMs: 1400 };
}
