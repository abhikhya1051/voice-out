import { describe, expect, it } from "vitest";
import type { Cleanup } from "../clean/schema.js";
import { checkFacts, detectCorrections, extractFacts, norm } from "./facts.js";

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

  describe("when the model forgets to cut a correction (seen with Gemini on a real memo)", () => {
    // 0 Adam 1 and 2 Priya 3 meet 4 on 5 Thursday. 6 No, 7 scratch 8 that. 9 They'll 10 meet 11 on 12 Friday
    // 13 because 14 Adam's 15 got 16 practice 17 on 18 Thursday 19 and 20 they 21 plan 22 for 23 Leila's 24 birthday
    // 25 party. 26 Oh, 27 no, 28 no, 29 not 30 the 31 birthday 32 party. 33 They 34 plan 35 for 36 Leila's 37 graduation 38 party.
    const w5 = words(
      "Adam and Priya meet on Thursday. No, scratch that. They'll meet on Friday because Adam's got practice on Thursday and they plan for Leila's birthday party. Oh, no, no, not the birthday party. They plan for Leila's graduation party.",
    );
    // Only the cues were cut, like Gemini did: "Thursday" (5) and "birthday party" (24-25) stayed in
    const cuts: Cleanup["cuts"] = [
      { from: 6, to: 8, reason: "self_correction" },
      { from: 26, to: 28, reason: "filler" },
    ];
    const note = {
      ...base,
      cuts,
      sentences: [
        { text: "Adam and Priya will meet on Friday because Adam has practice on Thursday, and they'll plan Leila's graduation party.", from: 0, to: 38 },
      ],
    };

    it("doesn't highlight the corrected Thursday, only the one that stands", () => {
      const result = checkFacts(w5, note);
      expect(result.factWords).not.toContain(5);
      expect(result.factWords).toContain(18);
    });

    it("doesn't mistake \"not the birthday party\" for a negative instruction", () => {
      expect(checkFacts(w5, note).flags).toEqual([]);
    });

    it("still flags a note that uses the uncut corrected value", () => {
      const bad = { ...note, sentences: [{ text: "Adam and Priya meet on Thursday.", from: 0, to: 8 }] };
      expect(checkFacts(w5, bad).flags).toMatchObject([{ problem: "corrected", fact: "Thursday" }]);
    });
  });

  it("detects 'X, no, Y' and cue-phrase corrections on its own", () => {
    const w6 = words("Call Tuesday, no, Wednesday. Budget forty, no sorry, fifty.");
    const { corrected } = detectCorrections(w6);
    expect([...corrected].sort((a, b) => a - b)).toEqual([1, 5]);
  });

  it("accepts a note that keeps a negative meaning with other words", () => {
    const w7 = words("Don't email Marcus until the contract is signed.");
    const ok = checkFacts(w7, { ...base, cuts: [], sentences: [{ text: "Only email Marcus after the contract is signed.", from: 0, to: 7 }] });
    expect(ok.flags).toEqual([]);
  });

  it("checks to-do deadlines too", () => {
    const w5 = words("Email Marcus by tomorrow.");
    const result = checkFacts(w5, { ...base, cuts: [], sentences: [], todos: [{ text: "Email Marcus", due: "by Friday", from: 0, to: 3 }] });
    expect(result.flags.map((f) => f.fact)).toEqual(["Friday"]);
  });
});
