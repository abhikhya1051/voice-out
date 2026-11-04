/**
 * Turns spoken date phrases into calendar dates. The model only says WHICH words are a date
 * and, for "the next day", which other day it's relative to. Every date is computed here,
 * from the recording date, so the arithmetic can't be wrong.
 */
import { norm } from "../verify/facts.js";

export interface DateMention {
  from: number;
  to: number;
  /** For "the next day" / "the day before": the words of the day it's relative to. */
  anchorFrom?: number;
  anchorTo?: number;
}

export interface ResolvedDate {
  from: number;
  to: number;
  phrase: string;
  /** YYYY-MM-DD */
  date: string;
  /** "Sat, Nov 7" */
  label: string;
  /** How it was worked out, in words: "the day after Fri, Nov 6". */
  basis: string;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_ALIASES: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const SMALL_NUMBERS: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Dates as UTC midnight, so adding days never trips over daylight saving. */
export function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
export const dateLabel = (d: Date) => `${SHORT_DAY[d.getUTCDay()]}, ${SHORT_MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;

/**
 * One phrase -> a date, or null if it isn't a specific day.
 * Rules, all relative to the day the memo was recorded:
 *   today / tonight            -> that day
 *   tomorrow / yesterday       -> +1 / -1; "the day after tomorrow" -> +2
 *   in N days / N days from now -> +N
 *   Friday / this Friday / on Friday -> the coming Friday (today if it is Friday)
 *   next Friday                -> the Friday after the coming one
 *   last Friday                -> the most recent Friday before today
 *   the next day / the day after / the following day / N days later -> anchor + 1 (or N)
 *   the day before             -> anchor - 1
 * Vague phrases (soon, ASAP, next week, this weekend) are left alone on purpose.
 */
export function resolvePhrase(phrase: string, recorded: Date, anchor: Date | null): { date: Date; basis: string } | null {
  const t = phrase.split(/\s+/).map(norm).filter(Boolean);
  const has = (...w: string[]) => w.every((x) => t.includes(x));
  const recordedLabel = dateLabel(recorded);

  if (has("day", "after", "tomorrow")) return { date: addDays(recorded, 2), basis: `two days after ${recordedLabel}, when you recorded this` };
  if (has("tomorrow")) return { date: addDays(recorded, 1), basis: `the day after ${recordedLabel}, when you recorded this` };
  if (has("yesterday")) return { date: addDays(recorded, -1), basis: `the day before ${recordedLabel}, when you recorded this` };
  if (has("today") || has("tonight")) return { date: recorded, basis: `the day you recorded this` };

  const count = (i: number) => {
    const w = t[i] ?? "";
    return /^\d+$/.test(w) ? Number(w) : SMALL_NUMBERS[w] ?? null;
  };
  const daysAt = t.findIndex((w) => w === "days" || w === "day");

  // Relative to another day the speaker named
  const relative =
    has("next", "day") || has("following", "day") || (has("day", "after") && !has("tomorrow"))
      ? 1
      : has("day", "before")
        ? -1
        : daysAt > 0 && has("later") && count(daysAt - 1) !== null
          ? count(daysAt - 1)!
          : null;
  if (relative !== null) {
    if (!anchor) return null;
    const n = Math.abs(relative);
    return {
      date: addDays(anchor, relative),
      basis: `${n === 1 ? "the day" : `${n} days`} ${relative > 0 ? "after" : "before"} ${dateLabel(anchor)}`,
    };
  }

  if (daysAt > 0 && (has("in") || has("from", "now")) && count(daysAt - 1) !== null) {
    const n = count(daysAt - 1)!;
    return { date: addDays(recorded, n), basis: `${n} days after ${recordedLabel}, when you recorded this` };
  }

  const dayWord = t.find((w) => w in WEEKDAY_ALIASES);
  if (dayWord !== undefined) {
    const target = WEEKDAY_ALIASES[dayWord]!;
    const name = WEEKDAYS[target]!.replace(/^./, (c) => c.toUpperCase());
    const ahead = (target - recorded.getUTCDay() + 7) % 7;
    if (has("last")) {
      return { date: addDays(recorded, ahead === 0 ? -7 : ahead - 7), basis: `the ${name} before ${recordedLabel}` };
    }
    if (has("next")) {
      return { date: addDays(recorded, ahead + 7), basis: `"next ${name}" read as the week after this one` };
    }
    return { date: addDays(recorded, ahead), basis: ahead === 0 ? `today is ${name}` : `the coming ${name}` };
  }

  // An explicit date: "November 7", "the 7th of November"
  const monthAt = t.findIndex((w) => MONTHS.includes(w));
  const dayNum = t.map((w) => /^(\d{1,2})(st|nd|rd|th)?$/.exec(w)).find(Boolean);
  if (monthAt >= 0 && dayNum) {
    const month = MONTHS.indexOf(t[monthAt]!);
    let d = new Date(Date.UTC(recorded.getUTCFullYear(), month, Number(dayNum[1])));
    if (d.getUTCMonth() !== month) return null;
    if (d < addDays(recorded, -60)) d = new Date(Date.UTC(recorded.getUTCFullYear() + 1, month, Number(dayNum[1])));
    return { date: d, basis: "the date you said" };
  }
  return null;
}

/**
 * Resolves every mention the model found. Mentions inside cut words are skipped (a day the
 * speaker took back isn't a date in the note). Anchors are resolved first, one level deep.
 */
export function resolveDates(words: string[], mentions: DateMention[], recordedOn: string, isCut: (i: number) => boolean = () => false): ResolvedDate[] {
  const recorded = parseYmd(recordedOn);
  if (!recorded) return [];
  const text = (from: number, to: number) => words.slice(from, to + 1).join(" ");
  const valid = (from: number, to: number) => from >= 0 && to < words.length && from <= to && to - from < 8;

  const out: ResolvedDate[] = [];
  const seen = new Set<string>();
  for (const m of mentions) {
    if (!valid(m.from, m.to) || seen.has(`${m.from}-${m.to}`)) continue;
    if (words.slice(m.from, m.to + 1).every((_, k) => isCut(m.from + k))) continue;

    let anchor: Date | null = null;
    if (m.anchorFrom !== undefined && m.anchorTo !== undefined && valid(m.anchorFrom, m.anchorTo)) {
      anchor = resolvePhrase(text(m.anchorFrom, m.anchorTo), recorded, null)?.date ?? null;
    }
    const phrase = text(m.from, m.to).replace(/[.,!?;:]+$/, "");
    const resolved = resolvePhrase(phrase, recorded, anchor);
    if (!resolved) continue;
    seen.add(`${m.from}-${m.to}`);
    out.push({ from: m.from, to: m.to, phrase, date: ymd(resolved.date), label: dateLabel(resolved.date), basis: resolved.basis });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** Values the fact check may accept as worked out (not invented) near a resolved date. */
export function derivedValues(d: ResolvedDate): string[] {
  const date = parseYmd(d.date)!;
  return [WEEKDAYS[date.getUTCDay()]!, MONTHS[date.getUTCMonth()]!, String(date.getUTCDate())];
}

/** Today's date where the server runs, as YYYY-MM-DD (fallback when the browser doesn't send one). */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
