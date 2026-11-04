import { describe, expect, it } from "vitest";
import type { Cleanup } from "../clean/schema.js";
import { checkFacts, extractFacts, norm } from "./facts.js";

const words = (s: string) => s.split(" ");

const base: Omit<Cleanup, "sentences" | "cuts"> = { title: "t", type: "memo", keyPoints: [], todos: [] };

describe("norm", () => {
  it("strips punctuation, possessives and apostrophes", () => {
    expect(norm("Priya's")).toBe("priya");
    expect(norm("don't,")).toBe("dont");
    expect(norm("Thursday.")).toBe("thursday");
  });
});

describe("extractFacts", () => {
  it("finds names, weekdays, relative dates and numbers but not ordinary words", () => {
    const facts = extractFacts("Move the Henderson demo to Thursday and email Marcus 3 numbers by tomorrow.", new Set());
    expect(facts.map((f) => f.value)).toEqual(["henderson", "thursday", "marcus", "3", "tomorrow"]);
  });

  it("only treats a sentence-initial capital as a name if the speaker's transcript capitalizes it too", () => {
    expect(extractFacts("Also I need coffee.", new Set(["also"]))).toEqual([]);
    expect(extractFacts("Priya is out.", new Set(["priya"])).map((f) => f.value)).toEqual(["priya"]);
  });
});

describe("checkFacts", () => {
  // 0:Um, 1:we 2:should 3:move 4:the 5:demo 6:to 7:Tuesday, 8:no 9:wait, 10:Thursday 11:because 12:Priya's 13:out.
  const w = words("Um, we should move the demo to Tuesday, no wait, Thursday because Priya's out.");
  const cuts: Cleanup["cuts"] = [
    { from: 0, to: 0, reason: "filler" },
    { from: 7, to: 9, reason: "self_correction" },
  ];

  it("passes facts backed by kept words and returns them for highlighting", () => {
    const result = checkFacts(w, { ...base, cuts, sentences: [{ text: "We should move the demo to Thursday because Priya is out.", from: 1, to: 13 }] });
    expect(result.flags).toEqual([]);
    expect(result.checked).toBe(2);
    expect(result.supported).toBe(2);
    expect(result.factWords).toEqual([10, 12]);
  });

  it("flags a fact the speaker corrected", () => {
    const result = checkFacts(w, { ...base, cuts, sentences: [{ text: "Move the demo to Tuesday.", from: 1, to: 10 }] });
    expect(result.flags).toMatchObject([{ problem: "corrected", fact: "Tuesday" }]);
  });

  it("flags facts that were never said", () => {
    const result = checkFacts(w, { ...base, cuts, sentences: [{ text: "Move the demo to Friday with Marcus.", from: 1, to: 13 }] });
    expect(result.flags.map((f) => f.fact)).toEqual(["Friday", "Marcus"]);
    expect(result.supported).toBe(0);
  });

  it("matches spelled-out numbers to digits", () => {
    const w2 = words("I need twenty five copies by three.");
    const result = checkFacts(w2, { ...base, cuts: [], sentences: [{ text: "I need 25 copies by 3.", from: 0, to: 6 }] });
    expect(result.flags).toEqual([]);
    expect(result.factWords).toEqual([2, 3, 6]);
  });

  it("catches a dropped or added negation", () => {
    const w3 = words("Don't email Marcus yet.");
    const dropped = checkFacts(w3, { ...base, cuts: [], sentences: [{ text: "Email Marcus.", from: 0, to: 3 }] });
    expect(dropped.flags.map((f) => f.problem)).toEqual(["negation_dropped"]);

    const w4 = words("Email Marcus today.");
    const added = checkFacts(w4, { ...base, cuts: [], sentences: [{ text: "Don't email Marcus today.", from: 0, to: 2 }] });
    expect(added.flags.map((f) => f.problem)).toEqual(["negation_added"]);
  });

  it("checks to-do deadlines too", () => {
    const w5 = words("Email Marcus by tomorrow.");
    const result = checkFacts(w5, { ...base, cuts: [], sentences: [], todos: [{ text: "Email Marcus", due: "by Friday", from: 0, to: 3 }] });
    expect(result.flags.map((f) => f.fact)).toEqual(["Friday"]);
  });
});
