import { normalizeCleanup } from "./clean/normalize.js";
import { SAMPLE_TOOL_INPUT, SAMPLE_WORDS } from "./clean/fixtures.js";
import { checkCleanup, type CleanResult } from "./clean/pipeline.js";
import { localToday } from "./dates/resolve.js";
import type { Cleanup } from "./clean/schema.js";
import type { Transcript, Word } from "./transcribe/whisper.js";

/**
 * Demo mode (npm run demo): no Whisper, no API key. Any recording "transcribes" to a sample
 * ramble and gets a pre-recorded Claude cleanup, but the fact check runs for real.
 * Lets anyone browsing the repo see the whole flow in one command.
 */
export function demoTranscript(durationMs: number): Transcript {
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

export function demoClean(words: string[], mustKeep: number[], recordedOn: string = localToday()): CleanResult {
  const cleanup = normalizeCleanup(SAMPLE_TOOL_INPUT as Cleanup, words.length, mustKeep);
  return { ...checkCleanup(words, cleanup, recordedOn, mustKeep), model: "demo (recorded response)", elapsedMs: 1400 };
}
