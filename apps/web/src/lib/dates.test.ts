import { describe, expect, it } from "vitest";
import type { CleanResult } from "../api";
import { localYmd, placeDates } from "./dates";

const date = (from: number, to: number, label: string) => ({ from, to, phrase: "x", date: "2026-11-07", label, basis: "b" });

describe("placeDates", () => {
  it("puts a date beside the to-do that cites it, else the sentence, and only once", () => {
    const result = {
      cleanup: {
        title: "t",
        type: "memo",
        cuts: [],
        keyPoints: [],
        sentences: [{ text: "s0", from: 0, to: 9 }, { text: "s1", from: 10, to: 20 }],
        todos: [{ text: "Send invites", from: 14, to: 20 }],
      },
      check: { checked: 0, supported: 0, flags: [], factWords: [] },
      dates: [date(3, 3, "Fri, Nov 6"), date(18, 20, "Sat, Nov 7")],
      model: "m",
      elapsedMs: 1,
    } satisfies CleanResult;
    const placed = placeDates(result);
    expect(placed.get("sentence-0")?.map((d) => d.label)).toEqual(["Fri, Nov 6"]);
    expect(placed.get("todo-0")?.map((d) => d.label)).toEqual(["Sat, Nov 7"]);
    expect(placed.has("sentence-1")).toBe(false);
  });
});

describe("placeDates dedupe", () => {
  it("shows a repeated date once per line", () => {
    const fri = { from: 2, to: 2, phrase: "Friday", date: "2026-11-06", label: "Fri, Nov 6", basis: "b" };
    const result = {
      cleanup: { title: "t", type: "memo", cuts: [], keyPoints: [], todos: [], sentences: [{ text: "s", from: 0, to: 20 }] },
      check: { checked: 0, supported: 0, flags: [], factWords: [] },
      dates: [fri, { ...fri, from: 9, to: 9 }],
      model: "m",
      elapsedMs: 1,
    } satisfies CleanResult;
    expect(placeDates(result).get("sentence-0")).toHaveLength(1);
  });
});

describe("localYmd", () => {
  it("uses the local calendar day", () => {
    expect(localYmd(new Date(2026, 10, 3, 23, 30))).toBe("2026-11-03");
  });
});
