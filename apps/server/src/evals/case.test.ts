import { describe, expect, it } from "vitest";
import { CASES } from "./cases.js";
import { parseCase } from "./case.js";

describe("parseCase", () => {
  it("reads cut and keep markup and strips it from the words", () => {
    const p = parseCase("[Um, so] I {like} it [you know,] a lot.");
    expect(p.words).toEqual(["Um,", "so", "I", "like", "it", "you", "know,", "a", "lot."]);
    expect([...p.expectCut]).toEqual([0, 1, 5, 6]);
    expect([...p.expectKeep]).toEqual([3]);
  });

  it("every eval case parses and has expectations", () => {
    for (const c of CASES) {
      const p = parseCase(c.transcript);
      expect(p.words.join(" "), c.name).not.toMatch(/[[\]{}]/);
      expect(c.mustSay.length, c.name).toBeGreaterThan(0);
    }
  });
});
