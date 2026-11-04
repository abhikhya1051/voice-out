import { describe, expect, it } from "vitest";
import { dateLabel, parseYmd, resolveDates, resolvePhrase } from "./resolve.js";

// Recorded on Tuesday, November 3, 2026
const TUE = parseYmd("2026-11-03")!;
const on = (phrase: string, anchor: Date | null = null) => {
  const r = resolvePhrase(phrase, TUE, anchor);
  return r ? dateLabel(r.date) : null;
};

describe("resolvePhrase", () => {
  it("handles today, tomorrow, yesterday and the day after tomorrow", () => {
    expect(on("today")).toBe("Tue, Nov 3");
    expect(on("tonight")).toBe("Tue, Nov 3");
    expect(on("by tomorrow.")).toBe("Wed, Nov 4");
    expect(on("yesterday")).toBe("Mon, Nov 2");
    expect(on("the day after tomorrow")).toBe("Thu, Nov 5");
  });

  it("reads a plain weekday as the coming one, and 'next' as the week after", () => {
    expect(on("Friday")).toBe("Fri, Nov 6");
    expect(on("on Friday.")).toBe("Fri, Nov 6");
    expect(on("Tuesday")).toBe("Tue, Nov 3");
    expect(on("Monday")).toBe("Mon, Nov 9");
    expect(on("next Friday")).toBe("Fri, Nov 13");
    expect(on("last Friday")).toBe("Fri, Oct 30");
  });

  it("works out 'the next day' from the day it's relative to", () => {
    const friday = parseYmd("2026-11-06")!;
    expect(on("the next day", friday)).toBe("Sat, Nov 7");
    expect(on("the day after", friday)).toBe("Sat, Nov 7");
    expect(on("the day before", friday)).toBe("Thu, Nov 5");
    expect(on("two days later", friday)).toBe("Sun, Nov 8");
    expect(on("the next day")).toBeNull(); // no anchor: refuse to guess
  });

  it("handles 'in N days' and explicit dates", () => {
    expect(on("in three days")).toBe("Fri, Nov 6");
    expect(on("in 10 days")).toBe("Fri, Nov 13");
    expect(on("November 20th")).toBe("Fri, Nov 20");
  });

  it("leaves vague phrases alone", () => {
    for (const p of ["ASAP", "soon", "next week", "sometime", "this weekend"]) expect(on(p)).toBeNull();
  });
});

describe("resolveDates", () => {
  // 0 decided 1 ASAP 2 on 3 Friday 4 and 5 invites 6 sent 7 out 8 the 9 next 10 day.
  const words = "decided ASAP on Friday and invites sent out the next day.".split(" ");

  it("resolves the user's real example: invites the day after Friday are Saturday", () => {
    const dates = resolveDates(words, [{ from: 3, to: 3 }, { from: 8, to: 10, anchorFrom: 3, anchorTo: 3 }, { from: 1, to: 1 }], "2026-11-03");
    expect(dates.map((d) => [d.phrase, d.label])).toEqual([
      ["Friday", "Fri, Nov 6"],
      ["the next day", "Sat, Nov 7"],
    ]);
    expect(dates[1]!.basis).toBe("the day after Fri, Nov 6");
  });

  it("skips mentions the speaker took back and nonsense spans", () => {
    const dates = resolveDates(words, [{ from: 3, to: 3 }, { from: 40, to: 41 }], "2026-11-03", (i) => i === 3);
    expect(dates).toEqual([]);
  });
});
