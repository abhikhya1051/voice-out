import type { CleanResult, ResolvedDate, Span } from "../api";

const within = (d: Span, item: Span) => d.from >= item.from && d.to <= item.to;

/**
 * Where each worked-out date appears in the note: beside the first to-do that cites it,
 * otherwise after the first sentence that does. Each date shows up once.
 */
export function placeDates(result: CleanResult): Map<string, ResolvedDate[]> {
  const placed = new Map<string, ResolvedDate[]>();
  const put = (key: string, d: ResolvedDate) => placed.set(key, [...(placed.get(key) ?? []), d]);
  for (const d of result.dates ?? []) {
    const todo = result.cleanup.todos.findIndex((t) => within(d, t));
    if (todo >= 0) {
      put(`todo-${todo}`, d);
      continue;
    }
    const sentence = result.cleanup.sentences.findIndex((s) => within(d, s));
    if (sentence >= 0) put(`sentence-${sentence}`, d);
  }
  return placed;
}

/** A Date's local calendar day as YYYY-MM-DD (not UTC, so late-evening memos keep their date). */
export function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
