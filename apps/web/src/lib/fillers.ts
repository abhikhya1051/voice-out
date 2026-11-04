/**
 * Step-2 helper: marks obvious filler words so you can check whether Whisper KEPT them.
 * This is deliberately dumb; the real, context-aware cleanup is Claude's job in step 3.
 */
const MULTI = ["you know", "i mean", "kind of", "sort of"];
const SINGLE = new Set(["um", "umm", "uh", "uhh", "uhm", "er", "erm", "ah", "hmm", "mm", "like", "basically", "literally"]);

export interface Token {
  text: string;
  filler: boolean;
}

export function markFillers(text: string): Token[] {
  const parts = text.split(/(\s+)/);
  const out: Token[] = [];
  for (let i = 0; i < parts.length; i++) {
    const word = parts[i] ?? "";
    if (!word) continue;
    const bare = normalize(word);
    const next = parts[i + 2];
    if (next !== undefined && MULTI.includes(`${bare} ${normalize(next)}`)) {
      out.push({ text: word + (parts[i + 1] ?? "") + next, filler: true });
      i += 2;
      continue;
    }
    out.push({ text: word, filler: bare !== "" && SINGLE.has(bare) });
  }
  return out;
}

export function countFillers(tokens: Token[]): number {
  return tokens.filter((t) => t.filler).length;
}

function normalize(word: string): string {
  return word.toLowerCase().replace(/[^a-z']/g, "");
}
