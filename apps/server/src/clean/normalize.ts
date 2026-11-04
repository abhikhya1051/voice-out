import type { Cleanup, CutReason, NoteItem } from "./schema.js";

export interface Cut {
  from: number;
  to: number;
  reason: CutReason;
}

/**
 * Makes Claude's answer safe to render against the real transcript:
 * clamps every range to existing words, fixes reversed ranges, removes restored words
 * from cuts (splitting a range if needed), and merges overlapping cuts.
 */
export function normalizeCleanup(raw: Cleanup, wordCount: number, mustKeep: number[] = []): Cleanup {
  const last = Math.max(0, wordCount - 1);
  const clamp = (n: number) => Math.min(last, Math.max(0, Math.round(n)));
  const fixSpan = <T extends NoteItem>(item: T): T => {
    const a = clamp(item.from);
    const b = clamp(item.to);
    return { ...item, from: Math.min(a, b), to: Math.max(a, b) };
  };

  const keep = new Set(mustKeep);
  const pieces: Cut[] = [];
  for (const cut of raw.cuts.map((c) => fixSpan({ ...c, text: "" }))) {
    let start: number | null = null;
    for (let i = cut.from; i <= cut.to + 1; i++) {
      const cuttable = i <= cut.to && !keep.has(i);
      if (cuttable && start === null) start = i;
      if (!cuttable && start !== null) {
        pieces.push({ from: start, to: i - 1, reason: cut.reason });
        start = null;
      }
    }
  }

  pieces.sort((a, b) => a.from - b.from);
  const cuts: Cut[] = [];
  for (const p of pieces) {
    const prev = cuts[cuts.length - 1];
    if (prev && p.from <= prev.to) prev.to = Math.max(prev.to, p.to);
    else cuts.push({ ...p });
  }

  const nonEmpty = <T extends NoteItem>(items: T[]) => items.filter((i) => i.text.trim()).map(fixSpan);

  return {
    title: raw.title.trim() || "Untitled memo",
    type: raw.type,
    cuts,
    sentences: nonEmpty(raw.sentences),
    keyPoints: nonEmpty(raw.keyPoints),
    todos: nonEmpty(raw.todos).map((t) => (t.due?.trim() ? t : { ...t, due: undefined })),
  };
}

/** Per-word cut reason (or null if kept), handy for the checker and the UI. */
export function cutMap(cuts: Cut[], wordCount: number): (CutReason | null)[] {
  const map: (CutReason | null)[] = new Array(wordCount).fill(null);
  for (const c of cuts) for (let i = c.from; i <= c.to && i < wordCount; i++) map[i] = c.reason;
  return map;
}
