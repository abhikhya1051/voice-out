import type { EvalCase } from "./case.js";

/** Rambles designed to trip up a naive filler remover. Markup is explained in case.ts. */
export const CASES: EvalCase[] = [
  {
    name: "everyday-memo",
    tests: "Mixed fillers, a repeat and a false start in one memo",
    transcript:
      "[Okay so, um, basically] I was thinking, [like,] for the Henderson project [we should, uh,] we should probably move the demo to Thursday instead of Tuesday because, [you know,] Priya's out Tuesday. [And um, I need to, wait, what was it, oh yeah,] I need to email Marcus about the budget numbers, [like,] by tomorrow.",
    mustSay: ["Henderson", "Thursday", "Priya", "Marcus", "budget", "tomorrow"],
  },
  {
    name: "self-correction-day",
    tests: "Keeps the corrected value, drops the original",
    transcript: "Call the dentist on [Tuesday, no wait,] Wednesday at three to [uh,] move the cleaning.",
    mustSay: ["dentist", "Wednesday", "(3|three)"],
    mustNotSay: ["Tuesday"],
  },
  {
    name: "like-as-a-verb",
    tests: "\"like\" that means something must survive",
    transcript: "[Um,] I really {like} the new logo, it looks {like} a fox. [Like,] we should keep it.",
    mustSay: ["(like|love)", "logo", "fox", "keep"],
  },
  {
    name: "negation",
    tests: "A negative instruction must stay negative",
    transcript: "[So, um,] don't email Marcus until the contract is signed. [Yeah.]",
    mustSay: ["(don't|do not|not|until)", "Marcus", "contract"],
  },
  {
    name: "spelled-numbers",
    tests: "Numbers survive whether spelled out or not",
    transcript: "Order [uh,] twenty five chairs and [um,] three tables for the [the] June offsite.",
    mustSay: ["(25|twenty.five)", "(3|three)", "chairs", "tables", "June"],
  },
  {
    name: "false-start",
    tests: "An abandoned sentence is cut, the restart kept",
    transcript: "[I need to, wait, what was it, oh yeah,] I need to pick up the dry cleaning before six.",
    mustSay: ["dry cleaning", "(6|six)"],
  },
  {
    name: "journal-feelings",
    tests: "Feelings are content, not filler",
    transcript: "Today was rough, [you know,] I felt [like,] really tired after the [after the] late shift, but I'm proud I finished the report.",
    mustSay: ["rough", "tired", "late shift", "proud", "report"],
  },
  {
    name: "meeting-time",
    tests: "Names and a spoken time",
    transcript: "Meeting with Priya and Daniel [um,] moved to [uh,] ten thirty tomorrow, [so,] bring the slides.",
    mustSay: ["Priya", "Daniel", "(10:30|ten thirty|10.30)", "tomorrow", "slides"],
  },
  {
    name: "kind-of-meaningful",
    tests: "\"kind of\" as a real phrase, \"so\" as filler",
    transcript: "What {kind} {of} tea do we have left? [Um,] I think we're out of green tea, [so] add it to the list.",
    mustSay: ["green tea", "list"],
  },
  {
    name: "number-correction",
    tests: "A corrected number plus a stutter",
    transcript: "The budget is [forty, no sorry,] fifty thousand dollars [for, for] for Q3.",
    mustSay: ["(50|fifty)", "Q3"],
    mustNotSay: ["(40|forty)"],
  },
];
