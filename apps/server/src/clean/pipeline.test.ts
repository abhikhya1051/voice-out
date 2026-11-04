import { describe, expect, it } from "vitest";
import { checkCleanup } from "./pipeline.js";
import type { Cleanup } from "./schema.js";

/** Priya's real memo (Nov 3), with the cuts Gemini actually made. */
const words = (
  "Yeah, so, so this is a testing piece. So, my name's Priya, and I have to contact Adam and Della, and we have to meet on Thursday. " +
  "No, scratch that, scratch that, that's wrong. We have to meet on Friday. Adam's got a play practice on Thursday, and we have to plan for, um, " +
  "Sunena's, uh, engagement party. She just got recently engaged, and we have to throw her a surprise engagement party the next day."
).split(" ");
const at = (w: string, nth = 0) => words.map((x, i) => [x, i] as const).filter(([x]) => x === w)[nth]![1];

const gemini: Cleanup = {
  title: "Priya's party planning",
  type: "memo",
  cuts: [
    { from: 0, to: 2, reason: "filler" },
    { from: at("So,"), to: at("So,"), reason: "filler" },
    { from: at("No,"), to: at("wrong."), reason: "self_correction" },
    { from: at("um,"), to: at("um,"), reason: "filler" },
    { from: at("uh,"), to: at("uh,"), reason: "filler" },
  ],
  sentences: [
    { text: "We have to meet on Friday.", from: at("We"), to: at("Friday.") },
    { text: "Adam's got a play practice on Thursday, and we have to plan for Sunena's engagement party.", from: at("Adam's"), to: at("party.") },
  ],
  keyPoints: [],
  todos: [{ text: "Plan Sunena's engagement party.", from: at("plan"), to: at("party.") }],
  dates: [
    { from: at("Friday."), to: at("Friday.") },
    { from: at("Thursday,"), to: at("Thursday,") },
  ],
};

describe("checkCleanup on a real memo", () => {
  it("matches a name said with a comma after it (\"Sunena's,\")", () => {
    expect(checkCleanup(words, gemini, "2026-11-03").check.flags).toEqual([]);
  });

  it("strikes the corrected Thursday the model left in, but not the practice Thursday", () => {
    const { cleanup } = checkCleanup(words, gemini, "2026-11-03");
    const struck = (i: number) => cleanup.cuts.some((c) => i >= c.from && i <= c.to);
    expect(struck(at("Thursday."))).toBe(true);
    expect(struck(at("Thursday,"))).toBe(false);
    expect(struck(at("Priya,"))).toBe(false);
  });

  it("leaves it alone if the speaker restored it", () => {
    const { cleanup } = checkCleanup(words, gemini, "2026-11-03", [at("Thursday.")]);
    expect(cleanup.cuts.some((c) => at("Thursday.") >= c.from && at("Thursday.") <= c.to)).toBe(false);
  });
});
