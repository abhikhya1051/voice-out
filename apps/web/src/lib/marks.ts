import type { CleanResult, CutReason, Span } from "../api";

export type WordMark =
  | { kind: "plain" }
  | { kind: "cut"; reason: CutReason; restoring: boolean }
  | { kind: "fact" };

/**
 * Decides how each transcript word is drawn. Cut words get the pencil strike;
 * words backing a checked fact get the highlighter. A word never gets both.
 */
export function wordMarks(wordCount: number, result: CleanResult | null, restoring: ReadonlySet<number>): WordMark[] {
  const marks: WordMark[] = Array.from({ length: wordCount }, () => ({ kind: "plain" }));
  if (!result) return marks;
  for (const i of result.check.factWords) if (i < wordCount) marks[i] = { kind: "fact" };
  for (const cut of result.cleanup.cuts) {
    for (let i = cut.from; i <= cut.to && i < wordCount; i++) {
      marks[i] = { kind: "cut", reason: cut.reason, restoring: restoring.has(i) };
    }
  }
  return marks;
}

export const REASON_LABEL: Record<CutReason, string> = {
  filler: "filler",
  false_start: "false start",
  repeat: "repeat",
  self_correction: "corrected",
};

/** How many cuts were made for each reason ("um, so" is one filler cut), for the footer. */
export function cutCounts(result: CleanResult): { reason: CutReason; count: number }[] {
  const counts = new Map<CutReason, number>();
  for (const c of result.cleanup.cuts) counts.set(c.reason, (counts.get(c.reason) ?? 0) + 1);
  return [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

export function inSpan(i: number, span: Span | null): boolean {
  return span !== null && i >= span.from && i <= span.to;
}
