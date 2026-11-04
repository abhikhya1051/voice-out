import { cutMap } from "../clean/normalize.js";
import type { Cleanup, CutReason, NoteItem } from "../clean/schema.js";
import { derivedValues, type ResolvedDate } from "../dates/resolve.js";

/**
 * The "never made up" check. Plain code, no AI: every hard fact in the clean note
 * (names, numbers, dates, times, weekdays, months) must appear among the words the
 * speaker actually said and that were KEPT. Also catches negations that appear or vanish.
 */

export type ItemKind = "sentence" | "keyPoint" | "todo";
export type Problem = "not_said" | "corrected" | "negation_dropped" | "negation_added";

export interface Flag {
  kind: ItemKind;
  index: number;
  fact: string;
  problem: Problem;
  message: string;
}

export interface FactCheck {
  /** Facts found in the note and checked against the transcript. */
  checked: number;
  /** Facts that passed. checked - supported = problems with facts. */
  supported: number;
  flags: Flag[];
  /** Kept transcript words that back a fact in the note; the UI highlights these. */
  factWords: number[];
}

/** Characterful but bounded: how far around a cited span to look, since citations can be a word or two off. */
const WINDOW = 3;

const WEEKDAYS: Record<string, string> = {
  monday: "monday", mon: "monday", tuesday: "tuesday", tue: "tuesday", tues: "tuesday",
  wednesday: "wednesday", wed: "wednesday", thursday: "thursday", thu: "thursday", thur: "thursday", thurs: "thursday",
  friday: "friday", fri: "friday", saturday: "saturday", sat: "saturday", sunday: "sunday", sun: "sunday",
};
const MONTHS: Record<string, string> = {
  january: "january", jan: "january", february: "february", feb: "february", march: "march", mar: "march",
  april: "april", apr: "april", may: "may", june: "june", jun: "june", july: "july", jul: "july",
  august: "august", aug: "august", september: "september", sep: "september", sept: "september",
  october: "october", oct: "october", november: "november", nov: "november", december: "december", dec: "december",
};
const RELATIVE = new Set(["today", "tonight", "tomorrow", "yesterday", "weekend", "noon", "midnight"]);

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, fifteenth: 15, twentieth: 20, thirtieth: 30,
};

const NEGATIONS = new Set([
  "not", "no", "never", "nothing", "nobody", "none", "cannot", "dont", "doesnt", "didnt", "cant", "wont", "wouldnt",
  "shouldnt", "couldnt", "isnt", "arent", "wasnt", "werent", "havent", "hasnt", "hadnt", "mustnt", "neednt",
]);

/** Common words that get capitalized at the start of a sentence but aren't names. */
const NOT_NAMES = new Set(
  ("a about after again all also am an and any are as at be because been before but by can could did do does doing done " +
    "for from get go going got had has have he her here hers him his how i i'd i'll i'm i've if in is it it's its just " +
    "let let's maybe me might more most must my need needs next no not now of oh ok okay on once one only or other our " +
    "out over really remember right she should so some still such that that's the their them then there these they this " +
    "those though to too up us very want was we we're well were what when where which while who why will with would yeah " +
    "yes yet you your also anyway basically like actually honestly plus first second third last finally overall sure thanks")
    .split(" "),
);

/** Lowercase, strip punctuation and possessive 's, fold apostrophes ("don't" -> "dont"). */
export function norm(word: string): string {
  return word
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']/g, "") // punctuation first, so "Sunena's," loses its comma...
    .replace(/'s$/, "") // ...before the possessive comes off
    .replace(/'/g, "");
}

interface Fact {
  label: string;
  /** Canonical value compared against the transcript: "thursday", "25", "marcus". */
  value: string;
}

/** Pulls the checkable facts out of one sentence of the clean note. */
export function extractFacts(text: string, sourceCapitalized: Set<string>): Fact[] {
  const facts: Fact[] = [];
  const tokens = text.split(/[\s\-–—/]+/).filter(Boolean);
  let sentenceStart = true;

  tokens.forEach((raw) => {
    const n = norm(raw);
    const atStart = sentenceStart;
    sentenceStart = /[.!?:]["')\]]?$/.test(raw);
    if (!n) return;

    const label = raw.replace(/^[^\w$]+|[^\w%]+$/g, "");
    if (WEEKDAYS[n]) return facts.push({ label, value: WEEKDAYS[n] });
    if (MONTHS[n] && (n !== "may" || /^May/.test(raw)) && (n !== "march" || /^March/.test(raw))) {
      return facts.push({ label, value: MONTHS[n] });
    }
    if (RELATIVE.has(n)) return facts.push({ label, value: n });

    const digits = raw.match(/\d+/g);
    if (digits) return digits.forEach((d) => facts.push({ label, value: String(Number(d)) }));
    if (n in UNITS || n in TENS) return; // spelled-out numbers are matched via their digits on the source side
    if (n in ORDINALS) return facts.push({ label, value: String(ORDINALS[n]) });

    const capitalized = /^[A-Z]/.test(raw.replace(/^[^\w]+/, ""));
    if (capitalized && !NOT_NAMES.has(n) && (!atStart || sourceCapitalized.has(n))) {
      facts.push({ label, value: n });
    }
  });

  // The same fact twice in one sentence only needs checking once
  return facts.filter((f, i) => facts.findIndex((g) => g.value === f.value) === i);
}

/** Canonical values for each source word, with spelled-out numbers parsed ("twenty five" -> 25 on both words). */
function sourceValues(words: string[]): string[][] {
  const values = words.map((w) => {
    const n = norm(w);
    const out = [n];
    if (WEEKDAYS[n]) out.push(WEEKDAYS[n]);
    if (MONTHS[n]) out.push(MONTHS[n]);
    for (const d of w.match(/\d+/g) ?? []) out.push(String(Number(d)));
    if (n in ORDINALS) out.push(String(ORDINALS[n]));
    return out;
  });

  // Spelled-out number runs: "twenty five", "two hundred", "three thousand"
  let i = 0;
  while (i < words.length) {
    const n = norm(words[i] ?? "");
    if (!(n in UNITS || n in TENS)) {
      i++;
      continue;
    }
    let total = 0;
    let current = 0;
    let lastWasTens = false;
    let j = i;
    for (; j < words.length; j++) {
      const t = norm(words[j] ?? "");
      if (j > i && /[.,!?;:]$/.test(words[j - 1] ?? "")) break;
      if (t in TENS && (j === i || current % 100 === 0)) {
        current += TENS[t]!;
        lastWasTens = true;
      } else if (t in UNITS && (j === i || (lastWasTens && UNITS[t]! < 10) || current % 100 === 0)) {
        current += UNITS[t]!;
        lastWasTens = false;
      } else if (t === "hundred" && j > i) {
        current *= 100;
        lastWasTens = false;
      } else if (t === "thousand" && j > i) {
        total += current * 1000;
        current = 0;
        lastWasTens = false;
      } else break;
    }
    const value = String(total + current);
    for (let k = i; k < j; k++) values[k]!.push(value);
    i = j;
  }
  return values;
}

export function checkFacts(words: string[], cleanup: Cleanup, dates: ResolvedDate[] = []): FactCheck {
  const reasons: (CutReason | null)[] = cutMap(cleanup.cuts, words.length);
  const values = sourceValues(words);
  const sourceCapitalized = new Set(words.filter((w) => /^[A-Z]/.test(w)).map(norm));
  const factWords = new Set<number>();
  const flags: Flag[] = [];
  let checked = 0;
  let supported = 0;

  const items: [ItemKind, NoteItem[]][] = [
    ["sentence", cleanup.sentences],
    ["keyPoint", cleanup.keyPoints],
    ["todo", cleanup.todos.map((t) => ({ ...t, text: t.due && !t.text.includes(t.due) ? `${t.text} ${t.due}` : t.text }))],
  ];

  // Our own read of the corrections, so a model that forgets to cut "Tuesday" in
  // "Tuesday, no wait, Wednesday" can't get it highlighted as a fact or slip it into the note.
  const { corrected: spokenCorrections, correctiveNegations } = detectCorrections(words, sourceCapitalized);
  const isCorrected = (i: number) => reasons[i] === "self_correction" || spokenCorrections.has(i);

  for (const [kind, list] of items) {
    list.forEach((item, index) => {
      const lo = Math.max(0, item.from - WINDOW);
      const hi = Math.min(words.length - 1, item.to + WINDOW);
      const inWindow = (i: number) => i >= lo && i <= hi;
      const matches = (i: number, value: string) => values[i]!.includes(value);

      for (const fact of extractFacts(item.text, sourceCapitalized)) {
        checked++;
        const all = words.map((_, i) => i).filter((i) => matches(i, fact.value));
        const usable = all.filter((i) => reasons[i] === null && !isCorrected(i));
        const usableNear = usable.filter(inWindow);

        const correctedNear = all.filter((i) => inWindow(i) && isCorrected(i));
        if (usableNear.length || (usable.length && !correctedNear.length)) {
          supported++;
          (usableNear.length ? usableNear : usable).forEach((i) => factWords.add(i));
        } else if (dates.some((d) => d.to >= lo && d.from <= hi && derivedValues(d).includes(fact.value))) {
          // Not said, but worked out by code from a date phrase in this part of the memo ("the next day" -> Saturday)
          supported++;
        } else if (all.some(isCorrected)) {
          flags.push({ kind, index, fact: fact.label, problem: "corrected", message: `You corrected "${fact.label}" while talking, but the note still uses it.` });
        } else if (all.length) {
          // Only said inside a filler/repeat/false start: it was said, so not invented
          supported++;
        } else {
          flags.push({ kind, index, fact: fact.label, problem: "not_said", message: `"${fact.label}" isn't in what you said.` });
        }
      }

      // Negation can flip meaning without touching any fact. Only a negation whose target
      // shows up in the note matters: "don't email Marcus" vs a note that says "email Marcus".
      const noteWords = new Set(item.text.split(/[\s\-–—/]+/).map(norm));
      const noteNeg = item.text.split(/\s+/).some((w) => NEGATIONS.has(norm(w)) || /n['’]t\b/i.test(w));
      const noteRestricts = noteNeg || [...noteWords].some((w) => RESTRICTIONS.has(w));
      let dropped = false;
      let sourceNeg = false;
      for (let i = item.from; i <= item.to && i < words.length; i++) {
        if (reasons[i] !== null || !isNegation(words[i] ?? "") || correctiveNegations.has(i)) continue;
        sourceNeg = true;
        const target = negationTarget(words, i);
        if (target && noteWords.has(target) && !noteRestricts) dropped = true;
      }
      if (dropped) {
        flags.push({ kind, index, fact: "not", problem: "negation_dropped", message: "You said this in the negative, but the note doesn't." });
      } else if (
        noteNeg &&
        !sourceNeg &&
        !words.slice(lo, hi + 1).some((w, k) => reasons[lo + k] === null && isNegation(w) && !correctiveNegations.has(lo + k))
      ) {
        flags.push({ kind, index, fact: "not", problem: "negation_added", message: "The note says this in the negative, but you didn't." });
      }
    });
  }

  return { checked, supported, flags, factWords: [...factWords].sort((a, b) => a - b) };
}

/** Words in the note that keep a "don't X" meaning without the word "not": "only email Marcus after...". */
const RESTRICTIONS = new Set(["until", "unless", "without", "avoid", "wait", "hold", "only", "before", "after", "refrain", "skip", "instead", "later"]);

/** Phrases that mean "replace what I just said". */
const CORRECTION_CUES = [["no", "wait"], ["wait", "no"], ["scratch", "that"], ["no", "sorry"], ["or", "rather"], ["make", "that"], ["correction"]];

const FILLER_LIKE = new Set(["the", "a", "an", "to", "on", "for", "of", "my", "our", "that", "this", "it"]);

/** A spoken negation, but not a bare interjection like "No," or "no." */
function isNegation(word: string): boolean {
  const n = norm(word);
  if (!NEGATIONS.has(n)) return false;
  return !(n === "no" && /[,.!?]$/.test(word));
}

/** The first meaningful word after a negation: "don't email Marcus" -> "email". */
function negationTarget(words: string[], i: number): string | null {
  for (let j = i + 1; j <= i + 3 && j < words.length; j++) {
    const n = norm(words[j] ?? "");
    if (n && !FILLER_LIKE.has(n)) return n;
  }
  return null;
}

/**
 * Finds self-corrections in what was said, independent of the model:
 * - a fact right before a cue: "Thursday. No, scratch that." / "forty, no sorry, fifty"
 * - "X, no, Y" where Y is the same kind of fact: "Tuesday, no, Wednesday"
 * - "not the X" echoing something said just before: "birthday party. Oh no, not the birthday party."
 *   (that "not" is a correction, not a negative instruction)
 */
export function detectCorrections(words: string[], sourceCapitalized: Set<string> = new Set()) {
  const corrected = new Set<number>();
  const correctiveNegations = new Set<number>();
  const n = words.map(norm);
  const isFact = (i: number) =>
    i >= 0 && i < words.length && (extractFacts(words[i]!, sourceCapitalized).length > 0 || n[i]! in UNITS || n[i]! in TENS);

  /** The fact nearest before a cue at c (plus fact words directly attached to it): what got replaced. */
  const markBefore = (c: number) => {
    let end = c - 1;
    while (end >= 0 && ["no", "oh", "wait", "sorry"].includes(n[end] ?? "")) end--;
    let j = end;
    while (j >= Math.max(0, end - 4) && !isFact(j)) {
      if (j < end && /[.!?]$/.test(words[j] ?? "")) return;
      j--;
    }
    while (j >= 0 && isFact(j)) corrected.add(j--);
  };

  for (let c = 0; c < words.length; c++) {
    if (CORRECTION_CUES.some((cue) => cue.every((w, k) => n[c + k] === w))) markBefore(c);
    if (n[c] === "no" && /,$/.test(words[c] ?? "") && isFact(c - 1) && (isFact(c + 1) || isFact(c + 2))) corrected.add(c - 1);
  }

  for (let i = 0; i < words.length; i++) {
    if (!NEGATIONS.has(n[i] ?? "")) continue;
    const after = [n[i + 1], n[i + 2], n[i + 3]].filter((w): w is string => !!w && !FILLER_LIKE.has(w));
    const earlier = n.slice(Math.max(0, i - 15), i);
    const echoes = after.filter((w) => earlier.includes(w));
    if (echoes.length) {
      correctiveNegations.add(i);
      for (let j = Math.max(0, i - 15); j < i; j++) if (echoes.includes(n[j]!)) corrected.add(j);
    }
  }
  /** Corrected names, days and numbers: the words the transcript should show as struck. */
  const correctedFacts = [...corrected].filter(isFact).sort((a, b) => a - b);
  return { corrected, correctiveNegations, correctedFacts };
}
