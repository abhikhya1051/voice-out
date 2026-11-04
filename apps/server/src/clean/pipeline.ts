import { checkFacts, type FactCheck } from "../verify/facts.js";
import { cleanWithClaude, type MessagesClient } from "./claude.js";
import type { Cleanup } from "./schema.js";

export interface CleanResult {
  cleanup: Cleanup;
  check: FactCheck;
  model: string;
  elapsedMs: number;
}

/** Claude proposes the cleanup; plain code then checks it against what was actually said. */
export async function cleanAndCheck(
  words: string[],
  opts: { client: MessagesClient; model: string; mustKeep?: number[] },
): Promise<CleanResult> {
  const started = Date.now();
  const cleanup = await cleanWithClaude(words, opts);
  const check = checkFacts(words, cleanup);
  return { cleanup, check, model: opts.model, elapsedMs: Date.now() - started };
}
