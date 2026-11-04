import { describe, expect, it } from "vitest";
import type { CleanResult } from "../api";
import { cutCounts, wordMarks } from "./marks";

const result: CleanResult = {
  model: "m",
  elapsedMs: 1,
  cleanup: {
    title: "t",
    type: "memo",
    cuts: [
      { from: 0, to: 1, reason: "filler" },
      { from: 4, to: 4, reason: "self_correction" },
    ],
    sentences: [],
    keyPoints: [],
    todos: [],
  },
  check: { checked: 2, supported: 2, flags: [], factWords: [3, 4, 5] },
};

describe("wordMarks", () => {
  it("strikes cut words, highlights fact words, and never does both", () => {
    const marks = wordMarks(6, result, new Set([1]));
    expect(marks.map((m) => m.kind)).toEqual(["cut", "cut", "plain", "fact", "cut", "fact"]);
    expect(marks[1]).toEqual({ kind: "cut", reason: "filler", restoring: true });
  });

  it("is all plain before cleanup", () => {
    expect(wordMarks(2, null, new Set()).map((m) => m.kind)).toEqual(["plain", "plain"]);
  });
});

describe("cutCounts", () => {
  it("counts cuts per reason", () => {
    expect(cutCounts(result)).toEqual([
      { reason: "filler", count: 1 },
      { reason: "self_correction", count: 1 },
    ]);
  });
});
