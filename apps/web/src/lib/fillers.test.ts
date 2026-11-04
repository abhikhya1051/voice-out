import { describe, expect, it } from "vitest";
import { countFillers, markFillers } from "./fillers";

describe("markFillers", () => {
  it("marks single and multi-word fillers and keeps the text intact", () => {
    const text = "Um, so I was, you know, thinking we should, uh, move it.";
    const tokens = markFillers(text);
    expect(tokens.map((t) => t.text).join("")).toBe(text);
    expect(tokens.filter((t) => t.filler).map((t) => t.text)).toEqual(["Um,", "you know,", "uh,"]);
    expect(countFillers(tokens)).toBe(3);
  });

  it("returns nothing for empty text", () => {
    expect(markFillers("")).toEqual([]);
  });
});
