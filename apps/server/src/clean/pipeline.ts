import { localToday, resolveDates, type ResolvedDate } from "../dates/resolve.js";
import { checkFacts, type FactCheck } from "../verify/facts.js";
import { cutMap } from "./normalize.js";
import type { Cleaner } from "./providers.js";
import type { Cleanup } from "./schema.js";

export interface CleanResult {
  cleanup: Cleanup;
  check: FactCheck;
  /** Date phrases worked out by code from the recording date. */
  dates: ResolvedDate[];
  model: string;
  elapsedMs: number;
}

/**
 * A model proposes the cleanup; plain code then computes the dates it pointed at
 * and checks every fact against what was actually said.
 */
export async function cleanAndCheck(words: string[], cleaner: Cleaner, mustKeep: number[] = [], recordedOn: string = localToday()): Promise<CleanResult> {
  const started = Date.now();
  const cleanup = await cleaner.clean(words, mustKeep);
  return { ...checkCleanup(words, cleanup, recordedOn), model: cleaner.model, elapsedMs: Date.now() - started };
}

export function checkCleanup(words: string[], cleanup: Cleanup, recordedOn: string) {
  const cut = cutMap(cleanup.cuts, words.length);
  const dates = resolveDates(words, cleanup.dates ?? [], recordedOn, (i) => cut[i] !== null);
  return { cleanup, dates, check: checkFacts(words, cleanup, dates) };
}
