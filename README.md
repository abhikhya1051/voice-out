# Voice Out

**Ramble freely. Cleaned up, never made up.**

Talk into your mic the way you'd leave yourself a voice memo — "um, so, like, we should, uh, move the demo to Thursday, you know" — and Voice Out writes it down as a clean note.

Most voice-to-text apps are black boxes: you speak, tidy text comes back, and you have no way to know what was cut or whether anything was changed. For notes, that matters — a dropped "not" or an invented deadline is worse than an "um". Voice Out shows its receipts:

- **Every cut is visible.** Removed words stay in the transcript with a pencil strike-through and a reason (filler, false start, repeat, corrected). Tap one to restore it.
- **Every fact is checked.** Names, numbers, dates and times in the note are verified against the words you actually said — by plain code, not another AI call. Anything that doesn't trace back gets flagged.
- **Dates are worked out, never guessed.** "Tomorrow", "Friday" and "the next day" get a pencil note with the real date (*the next day → Sat, Nov 7*). The model only links "the next day" to "Friday"; plain code does the calendar math from the day you recorded.
- **Every line links to your voice.** Tap a sentence in the note to hear yourself say it; its source words light up in the transcript.
- **Your audio never leaves your Mac.** Transcription runs locally with [whisper.cpp](https://github.com/ggerganov/whisper.cpp). Only the text goes to the cleanup model: Claude or Gemini (free tier), your choice.

<!-- Add a screenshot or GIF here: docs/screenshot.png -->

## Try it in one command (no setup)

```bash
npm install
npm run demo
```

Open http://localhost:5173 and press the mic (or upload any audio). Demo mode skips Whisper and the API: every recording becomes a sample memo with a recorded Claude response, but the fact check runs for real.

## Run it with your own voice (macOS)

Needs Node 20+, [Homebrew](https://brew.sh), and one API key: a free [Gemini key](https://aistudio.google.com/apikey) or an [Anthropic key](https://console.anthropic.com).

```bash
npm install
npm run setup:whisper   # installs whisper-cpp + ffmpeg, downloads the small.en model (~470 MB), creates .env
# put ONE key in .env: GEMINI_API_KEY=... or ANTHROPIC_API_KEY=sk-ant-...
npm run dev             # http://localhost:5173
```

| Provider | Default model | Cost | Notes |
| --- | --- | --- | --- |
| Gemini | `gemini-3.1-flash-lite` | Free tier | Rate-limited; on the free tier Google may use requests to improve its products |
| Claude | `claude-haiku-5-5` | A fraction of a cent per memo | Switch to `claude-sonnet-5-5` for harder memos |

If both keys are set, Claude is used; `CLEANUP_PROVIDER=gemini` overrides that. The prompt, schema and fact check are the same for both, so the receipts mean the same thing whichever model wrote the note.

On Apple Silicon, whisper.cpp uses Metal and transcribes a 30-second memo in a few seconds. Some whisper.cpp builds crash while setting up Metal; setup tests for this and switches to the CPU (`WHISPER_GPU=false`), and the server also retries on the CPU if a GPU run fails. Cleanup uses `claude-haiku-5-5` by default (a fraction of a cent per memo); set `CLAUDE_MODEL=claude-sonnet-5-5` in `.env` for harder memos.

## How the receipts work

```
mic ─▶ ffmpeg ─▶ whisper.cpp ─────────▶ words with timestamps
                 (local, -ojf)                  │
                                                ▼
                                   Claude (tool use) or Gemini (JSON
                                   schema), same Zod schema, returns
                                   WORD NUMBERS, not text:
                                   cuts [{from, to, reason}]
                                   note sentences [{text, from, to}]
                                                │
                                                ▼
                                   fact check (plain TypeScript)
                                   every name/number/date in the note
                                   must match a KEPT source word
                                                │
                                                ▼
                     notebook UI: struck = cut · highlighted = checked fact
```

**1. Whisper is told to keep the ums.** Whisper was trained on tidy subtitles and quietly deletes fillers. Voice Out primes the decoder with a deliberately disfluent prompt, so the transcript shows what you really said.

**2. The model points at words; it never rewrites the transcript.** The transcript goes to the model as numbered words (`0:Okay 1:so, 2:um,`). It returns ranges of word numbers to cut, and each note sentence cites the word range it came from. The transcript you see is always Whisper's exact output, so the AI can't silently alter it. Output is forced into shape (a tool call for Claude, structured JSON output for Gemini) and validated with the same Zod schema that generates both JSON Schemas.

**3. Plain code checks the note.** [`verify/facts.ts`](apps/server/src/verify/facts.ts) extracts every name, number, weekday, month, time and relative date ("tomorrow") from the note and looks for it among the *kept* words near the cited span. It handles "twenty five" ↔ 25, possessives and abbreviations, and flags:

| Problem | Example |
| --- | --- |
| Not said | Note says "by Friday"; you never said Friday |
| Corrected | You said "Tuesday, no wait, Thursday", but the note uses Tuesday |
| Negation dropped | You said "don't email Marcus"; the note says "email Marcus" |
| Negation added | The note says "don't", you didn't |

The result is the receipt at the bottom of every note: **"18 facts checked against your words · 0 invented"**.

**4. Dates: the model links, code computes.** The model lists date phrases by word position, and for relative ones ("the next day") points at the day they hang off ("Friday"). [`dates/resolve.ts`](apps/server/src/dates/resolve.ts) turns them into calendar dates from the recording date: today/tomorrow/yesterday, weekdays ("the next Monday" = the first one coming, "next Friday" = Friday of next calendar week), "in three days", "the day before", explicit dates. Vague phrases ("ASAP", "next week") are left alone on purpose, and a day the speaker took back is never resolved. If the note says "Saturday" for "the next day", the fact check accepts it only because code worked it out.

**5. Restoring is a constraint, not a suggestion.** Restored words are sent back as `mustKeep`, and the server removes them from any cut the model proposes, so a restored word can't be cut again.

## Evals

[`apps/server/src/evals/cases.ts`](apps/server/src/evals/cases.ts) has ten rambles built to trip up a naive filler remover: "like" as a verb, "don't email Marcus", "twenty five chairs", "Tuesday, no wait, Wednesday", a corrected budget figure, feelings that aren't filler. Each case marks words that *should* be cut `[like this]` and words that must survive `{like this}`.

```bash
npm run eval                 # all cases with whichever provider .env selects
npm run eval -- negation     # one case
CLEANUP_PROVIDER=gemini npm run eval
```

It reports five numbers: fillers cut, meaningful words kept, facts kept, dates worked out correctly (every eval memo is treated as recorded on Tue, Nov 3, 2026), and facts invented, and writes them to [evals/RESULTS-gemini.md](evals/RESULTS-gemini.md) or [evals/RESULTS-claude.md](evals/RESULTS-claude.md), so the two models can be compared on the same cases.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run demo` | Full UI with no Whisper and no API key |
| `npm run dev` | Server + web app with hot reload |
| `npm test` | Vitest: whisper parsing, cleanup normalization, fact check, API routes, UI marks. No API key needed. |
| `npm run eval` | The real cleanup model on the eval cases |
| `npm run typecheck` / `npm run lint` | TypeScript + ESLint |
| `npm run setup:whisper` | Install whisper.cpp/ffmpeg, download a model (`-- base.en` or `-- medium.en` for others) |

## Project layout

```
apps/server/src
  transcribe/   ffmpeg + whisper.cpp, tokens → words with timestamps
  clean/        shared prompt + Zod schema, Claude and Gemini providers, normalization
  verify/       the deterministic fact check and correction detector
  dates/        relative dates -> calendar dates
  evals/        tricky cases + runner
  demo.ts       recorded responses for `npm run demo`
apps/web/src
  components/   Recorder (mic + ink waveform), TranscriptView, NoteView
  hooks/        useRecorder, useClipPlayer (tap-to-hear)
```

## Stack

TypeScript throughout · Fastify · React + Vite · whisper.cpp · Claude (Anthropic SDK) or Gemini (Google GenAI SDK) · Zod · Vitest · GitHub Actions

## License

MIT
