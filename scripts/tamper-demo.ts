/**
 * Prints the demo memo's cleanup with one day in the note swapped for a day that was never said,
 * re-checked by the real fact check. Used to make the README's "flagged line" screenshot honest:
 * the red flag in it is the checker's own output, not something drawn on.
 *   npx tsx scripts/tamper-demo.ts > tampered.json
 */
import { checkCleanup } from "../apps/server/src/clean/pipeline.js";
import { loadCaptured } from "../apps/server/src/capture.js";
import { SAMPLE_TOOL_INPUT, SAMPLE_WORDS } from "../apps/server/src/clean/fixtures.js";
import { normalizeCleanup } from "../apps/server/src/clean/normalize.js";
import type { Cleanup } from "../apps/server/src/clean/schema.js";

const captured = loadCaptured();
const words = captured ? captured.transcript.words.map((w) => w.text) : SAMPLE_WORDS;
const cleanup: Cleanup = captured ? captured.cleanup : normalizeCleanup(SAMPLE_TOOL_INPUT as Cleanup, SAMPLE_WORDS.length);
const recordedOn = captured?.recordedOn ?? "2026-11-03";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const said = new Set(words.map((w) => w.replace(/[^A-Za-z]/g, "")));
const unsaid = DAYS.find((d) => !said.has(d))!;

const sentences = cleanup.sentences.map((s) => ({ ...s }));
const target = sentences.findIndex((s) => DAYS.some((d) => s.text.includes(d)));
if (target < 0) throw new Error("No sentence mentions a weekday to tamper with.");
const day = DAYS.find((d) => sentences[target]!.text.includes(d))!;
sentences[target] = { ...sentences[target]!, text: sentences[target]!.text.replace(day, unsaid) };

const result = checkCleanup(words, { ...cleanup, sentences }, recordedOn);
console.log(JSON.stringify({ ...result, model: captured?.model ?? "demo", elapsedMs: 1400 }));
console.error(`Swapped "${day}" for "${unsaid}" in sentence ${target}; checker flags: ${result.check.flags.map((f) => f.message).join(" | ")}`);
