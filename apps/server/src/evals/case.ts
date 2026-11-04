/**
 * Eval cases are written as plain transcripts with light markup:
 *   [um,]      words that SHOULD be cut (fillers, repeats, false starts, corrected parts)
 *   {like}     words that must NOT be cut, because they carry meaning
 * Everything else is ordinary speech.
 */
export interface EvalCase {
  name: string;
  /** What this case is testing, in one line. */
  tests: string;
  transcript: string;
  /** Regexes (case-insensitive) that must match the clean note. */
  mustSay: string[];
  /** Regexes that must NOT match the clean note (e.g. a corrected value). */
  mustNotSay?: string[];
}

export interface ParsedCase {
  words: string[];
  expectCut: Set<number>;
  expectKeep: Set<number>;
}

export function parseCase(transcript: string): ParsedCase {
  const words: string[] = [];
  const expectCut = new Set<number>();
  const expectKeep = new Set<number>();
  let mode: "plain" | "cut" | "keep" = "plain";

  for (const raw of transcript.split(/\s+/).filter(Boolean)) {
    let token = raw;
    if (token.startsWith("[")) {
      mode = "cut";
      token = token.slice(1);
    } else if (token.startsWith("{")) {
      mode = "keep";
      token = token.slice(1);
    }
    const closes = /[\]}]/.exec(token);
    const current = mode;
    if (closes) {
      token = token.replace(/[\]}]/, "");
      mode = "plain";
    }
    if (!token) continue;
    const i = words.push(token) - 1;
    if (current === "cut") expectCut.add(i);
    if (current === "keep") expectKeep.add(i);
  }
  return { words, expectCut, expectKeep };
}
