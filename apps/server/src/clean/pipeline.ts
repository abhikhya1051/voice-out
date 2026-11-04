import { localToday, resolveDates, type ResolvedDate } from "../dates/resolve.js";
import { checkFacts, detectCorrections, norm, type FactCheck } from "../verify/facts.js";
import { cutMap, normalizeCleanup } from "./normalize.js";
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
  return { ...checkCleanup(words, cleanup, recordedOn, mustKeep), model: cleaner.model, elapsedMs: Date.now() - started };
}

/**
 * Strikes values the speaker took back that the model left in ("Thursday" in
 * "Thursday. No, scratch that."), unless the speaker restored them.
 */
export function strikeMissedCorrections(words: string[], cleanup: Cleanup, mustKeep: number[] = []): Cleanup {
  const capitalized = new Set(words.filter((w) => /^[A-Z]/.test(w)).map(norm));
  const cut = cutMap(cleanup.cuts, words.length);
  const keep = new Set(mustKeep);
  const missed = detectCorrections(words, capitalized).correctedFacts.filter((i) => cut[i] === null && !keep.has(i));
  if (!missed.length) return cleanup;
  const extra = missed.map((i) => ({ from: i, to: i, reason: "self_correction" as const }));
  return normalizeCleanup({ ...cleanup, cuts: [...cleanup.cuts, ...extra] }, words.length, mustKeep);
}

export function checkCleanup(words: string[], raw: Cleanup, recordedOn: string, mustKeep: number[] = []) {
  const cleanup = strikeMissedCorrections(words, raw, mustKeep);
  const cut = cutMap(cleanup.cuts, words.length);
  const dates = resolveDates(words, cleanup.dates ?? [], recordedOn, (i) => cut[i] !== null);
  return { cleanup, dates, check: checkFacts(words, cleanup, dates) };
}
