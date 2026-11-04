import { checkFacts, type FactCheck } from "../verify/facts.js";
import type { Cleaner } from "./providers.js";
import type { Cleanup } from "./schema.js";

export interface CleanResult {
  cleanup: Cleanup;
  check: FactCheck;
  model: string;
  elapsedMs: number;
}

/** A model proposes the cleanup; plain code then checks it against what was actually said. */
export async function cleanAndCheck(words: string[], cleaner: Cleaner, mustKeep: number[] = []): Promise<CleanResult> {
  const started = Date.now();
  const cleanup = await cleaner.clean(words, mustKeep);
  const check = checkFacts(words, cleanup);
  return { cleanup, check, model: cleaner.model, elapsedMs: Date.now() - started };
}
