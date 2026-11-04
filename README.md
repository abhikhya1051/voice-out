# Voice Out

Ramble into your mic like you're leaving yourself a voice memo — "um, so, like, we should, uh, move the demo to Thursday, you know" — and get back a clean note that keeps what you meant and drops the filler.

- **Transcription runs locally** with [whisper.cpp](https://github.com/ggerganov/whisper.cpp) (Metal-accelerated on Apple Silicon). Your audio never leaves your machine.
- **Cleanup uses Claude** to tell real content from filler *by context*: "I like that place" keeps *like*; "it was, like, fine" drops it. *(coming in step 3)*

> **Status:** step 2 of 5 — recording and local transcription work. Claude cleanup, saved notes and evals are next.

## Quick start (macOS)

Requires Node 20+, [Homebrew](https://brew.sh) and Xcode Command Line Tools.

```bash
npm install
npm run setup:whisper   # installs whisper-cpp + ffmpeg, downloads the small.en model (~470 MB), creates .env
npm run dev             # server on :8787, web app on http://localhost:5173
```

Open http://localhost:5173, allow the microphone, press **Record**, and talk.

Want a faster or more accurate model? `npm run setup:whisper -- base.en` or `-- medium.en`, then set `WHISPER_MODEL` in `.env`.

## How it works

```
Browser (MediaRecorder: webm/opus or mp4/aac)
   │  POST /api/transcribe (multipart)
   ▼
Fastify server
   ├─ ffmpeg → 16 kHz mono WAV
   └─ whisper-cli --prompt "<disfluent example>" -oj → segments + timestamps
```

**Why the odd prompt?** Whisper was trained on tidy subtitles, so it quietly deletes "um" and "uh". Voice Out needs to *see* the fillers to show what it cut, so the decoder is primed with a deliberately disfluent prompt — Whisper imitates the style of its prompt and keeps them.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Server + web app with hot reload |
| `npm test` | Vitest (server pipeline with a fake whisper, filler marker) |
| `npm run typecheck` / `npm run lint` | TypeScript + ESLint |
| `npm run setup:whisper` | Install whisper.cpp/ffmpeg, download a model |

## Project layout

```
apps/server   Fastify + TypeScript: /api/health, /api/transcribe
apps/web      Vite + React + TypeScript: recorder, transcript view
scripts/      setup-whisper.sh
```

## License

MIT
