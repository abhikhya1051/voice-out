/**
 * Runs every eval case through real Claude + the fact check and reports:
 *   fillers cut    expected cuts that were made
 *   meaning kept   {braced} words that were NOT cut
 *   facts kept     mustSay patterns found in the note
 *   invented       facts the checker flagged, plus mustNotSay hits
 * Usage: npm run eval   (needs GEMINI_API_KEY or ANTHROPIC_API_KEY in .env)
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig, ROOT } from "../config.js";
import { cleanAndCheck } from "../clean/pipeline.js";
import { cleanupErrorMessage, createCleaner } from "../clean/providers.js";
import { cutMap } from "../clean/normalize.js";
import { parseCase } from "./case.js";
import { CASES } from "./cases.js";

interface Row {
  name: string;
  fillersCut: [number, number];
  meaningKept: [number, number];
  factsKept: [number, number];
  invented: number;
  notes: string[];
}

const config = loadConfig();
const cleaner = createCleaner(config);
if (!cleaner) {
  console.error("Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY in .env to run the evals.");
  process.exit(1);
}
console.log(`Running evals with ${cleaner.provider} (${cleaner.model})\n`);
const only = process.argv[2];
const rows: Row[] = [];

for (const c of CASES.filter((c) => !only || c.name === only)) {
  const { words, expectCut, expectKeep } = parseCase(c.transcript);
  process.stdout.write(`${c.name.padEnd(22)} `);
  let result;
  try {
    result = await cleanAndCheck(words, cleaner);
  } catch (err) {
    console.log(`✗ ${cleanupErrorMessage(err, cleaner.provider, cleaner.model)}`);
    if ((err as { status?: number }).status === 429) {
      console.log("Stopping early: rate limited. Results so far are below.");
      break;
    }
    continue;
  }
  const { cleanup, check } = result;
  const cut = cutMap(cleanup.cuts, words.length);
  const note = [cleanup.title, ...cleanup.sentences.map((s) => s.text), ...cleanup.todos.map((t) => `${t.text} ${t.due ?? ""}`)].join(" ");

  const notes: string[] = [];
  const missedCuts = [...expectCut].filter((i) => cut[i] === null);
  const wrongCuts = [...expectKeep].filter((i) => cut[i] !== null);
  const missingFacts = c.mustSay.filter((p) => !new RegExp(p, "i").test(note));
  const forbidden = (c.mustNotSay ?? []).filter((p) => new RegExp(`\\b${p}\\b`, "i").test(note));
  if (missedCuts.length) notes.push(`left in: ${missedCuts.map((i) => words[i]).join(" ")}`);
  if (wrongCuts.length) notes.push(`wrongly cut: ${wrongCuts.map((i) => words[i]).join(" ")}`);
  if (missingFacts.length) notes.push(`missing: ${missingFacts.join(", ")}`);
  if (forbidden.length) notes.push(`said anyway: ${forbidden.join(", ")}`);
  for (const f of check.flags) notes.push(`flag: ${f.message}`);

  const row: Row = {
    name: c.name,
    fillersCut: [expectCut.size - missedCuts.length, expectCut.size],
    meaningKept: [expectKeep.size - wrongCuts.length, expectKeep.size],
    factsKept: [c.mustSay.length - missingFacts.length, c.mustSay.length],
    invented: check.flags.length + forbidden.length,
    notes,
  };
  rows.push(row);
  console.log(notes.length ? `⚠ ${notes.join(" | ")}` : "✓");
  if (notes.length) {
    // Show what the model actually wrote, so a failure can be judged (some are stricter than the meaning)
    const kept = words.filter((_, i) => cut[i] === null).join(" ");
    console.log(`${" ".repeat(23)}kept: ${kept}`);
    console.log(`${" ".repeat(23)}note: ${cleanup.sentences.map((x) => x.text).join(" ")}`);
  }
}

const sum = (pick: (r: Row) => [number, number]): [number, number] =>
  rows.reduce<[number, number]>((a, r) => [a[0] + pick(r)[0], a[1] + pick(r)[1]], [0, 0]);
const pct = ([a, b]: [number, number]) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");
const totals = {
  fillersCut: sum((r) => r.fillersCut),
  meaningKept: sum((r) => r.meaningKept),
  factsKept: sum((r) => r.factsKept),
  invented: rows.reduce((a, r) => a + r.invented, 0),
};

console.log(
  `\n${rows.length} cases · ${cleaner.provider} · ${cleaner.model}\n` +
    `fillers cut   ${pct(totals.fillersCut)} (${totals.fillersCut.join("/")})\n` +
    `meaning kept  ${pct(totals.meaningKept)} (${totals.meaningKept.join("/")})\n` +
    `facts kept    ${pct(totals.factsKept)} (${totals.factsKept.join("/")})\n` +
    `invented      ${totals.invented}`,
);

if (!only) {
  const md = [
    `# Eval results`,
    ``,
    `${rows.length} cases · ${cleaner.provider} · \`${cleaner.model}\` · ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `| | Result |`,
    `| --- | --- |`,
    `| Fillers cut | ${pct(totals.fillersCut)} (${totals.fillersCut.join("/")}) |`,
    `| Meaningful words kept | ${pct(totals.meaningKept)} (${totals.meaningKept.join("/")}) |`,
    `| Facts kept | ${pct(totals.factsKept)} (${totals.factsKept.join("/")}) |`,
    `| Facts invented | ${totals.invented} |`,
    ``,
    `| Case | Fillers cut | Meaning kept | Facts kept | Invented | Notes |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...rows.map(
      (r) =>
        `| ${r.name} | ${r.fillersCut.join("/")} | ${r.meaningKept[1] ? r.meaningKept.join("/") : "–"} | ${r.factsKept.join("/")} | ${r.invented} | ${r.notes.join("; ") || "✓"} |`,
    ),
    ``,
  ].join("\n");
  const out = path.join(ROOT, "evals", `RESULTS-${cleaner.provider}.md`);
  await writeFile(out, md);
  console.log(`\nWrote ${path.relative(ROOT, out)}`);
}
