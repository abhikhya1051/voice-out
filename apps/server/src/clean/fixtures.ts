/**
 * A recorded-style Claude response for the sample memo, used by tests and the offline demo.
 * Word indices refer to SAMPLE_WORDS.
 */
export const SAMPLE_TEXT =
  "Okay so, um, basically I was thinking, like, for the Henderson project we should, uh, we should probably move the demo to Thursday instead of Tuesday because, you know, Priya's out Tuesday. And um, I need to, wait, what was it, oh yeah, I need to email Marcus about the budget numbers, like, by tomorrow. Also, sort of random, but I mean I really liked that coffee place on Fifth. Anyway, yeah, demo Thursday, email Marcus.";

export const SAMPLE_WORDS = SAMPLE_TEXT.split(" ");

// 0 Okay 1 so, 2 um, 3 basically 4 I 5 was 6 thinking, 7 like, 8 for 9 the 10 Henderson 11 project 12 we 13 should,
// 14 uh, 15 we 16 should 17 probably 18 move 19 the 20 demo 21 to 22 Thursday 23 instead 24 of 25 Tuesday 26 because,
// 27 you 28 know, 29 Priya's 30 out 31 Tuesday. 32 And 33 um, 34 I 35 need 36 to, 37 wait, 38 what 39 was 40 it, 41 oh
// 42 yeah, 43 I 44 need 45 to 46 email 47 Marcus 48 about 49 the 50 budget 51 numbers, 52 like, 53 by 54 tomorrow.
// 55 Also, 56 sort 57 of 58 random, 59 but 60 I 61 mean 62 I 63 really 64 liked 65 that 66 coffee 67 place 68 on
// 69 Fifth. 70 Anyway, 71 yeah, 72 demo 73 Thursday, 74 email 75 Marcus.
export const SAMPLE_TOOL_INPUT = {
  title: "Henderson demo moves to Thursday",
  type: "memo",
  cuts: [
    { from: 0, to: 3, reason: "filler" },
    { from: 7, to: 7, reason: "filler" },
    { from: 12, to: 14, reason: "repeat" },
    { from: 27, to: 28, reason: "filler" },
    { from: 33, to: 42, reason: "false_start" },
    { from: 52, to: 52, reason: "filler" },
    { from: 56, to: 57, reason: "filler" },
    { from: 60, to: 61, reason: "filler" },
    { from: 70, to: 75, reason: "repeat" },
  ],
  sentences: [
    { text: "For the Henderson project, we should probably move the demo to Thursday instead of Tuesday, because Priya's out Tuesday.", from: 8, to: 31 },
    { text: "I need to email Marcus about the budget numbers by tomorrow.", from: 43, to: 54 },
    { text: "Also, random, but I really liked that coffee place on Fifth.", from: 55, to: 69 },
  ],
  keyPoints: [
    { text: "Henderson demo moves from Tuesday to Thursday (Priya's out Tuesday)", from: 10, to: 31 },
    { text: "Marcus needs the budget numbers by tomorrow", from: 46, to: 54 },
  ],
  todos: [
    { text: "Move the Henderson demo to Thursday", from: 10, to: 22 },
    { text: "Email Marcus about the budget numbers", due: "by tomorrow", from: 43, to: 54 },
    { text: "Go back to the coffee place on Fifth", from: 62, to: 69 },
  ],
  dates: [
    { from: 22, to: 22 },
    { from: 25, to: 25 },
    { from: 54, to: 54 },
  ],
};
