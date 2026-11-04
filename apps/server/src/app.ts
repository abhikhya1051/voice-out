import { access } from "node:fs/promises";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { z } from "zod";
import type { Config } from "./config.js";
import { cleanAndCheck, type CleanResult } from "./clean/pipeline.js";
import { cleanupErrorMessage, createCleaner } from "./clean/providers.js";
import { run } from "./transcribe/run.js";
import { transcribe as defaultTranscribe, type Transcript } from "./transcribe/whisper.js";

export interface AppDeps {
  transcribe?: (audio: Buffer, filename: string) => Promise<Transcript>;
  clean?: (words: string[], mustKeep: number[], recordedOn?: string) => Promise<CleanResult>;
  /** Demo mode: no local tools or API key needed. */
  demo?: boolean;
}

const CleanBody = z.object({
  words: z.array(z.string()).min(1).max(20000),
  mustKeep: z.array(z.number().int().min(0)).max(20000).default([]),
  /** The day the memo was recorded, in the speaker's own time zone, so "tomorrow" means their tomorrow. */
  recordedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export function buildApp(config: Config, deps: AppDeps = {}) {
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === "test" ? "silent" : "info" },
    bodyLimit: 5 * 1024 * 1024,
  });
  const transcribe =
    deps.transcribe ??
    ((audio: Buffer, filename: string) =>
      defaultTranscribe(audio, filename, config, {
        onGpuFallback: (err) =>
          app.log.warn(`whisper.cpp failed on the GPU, retrying on the CPU. Set WHISPER_GPU=false in .env to skip the GPU. (${err.message.split("\n")[0]})`),
      }));
  const cleaner = deps.clean ? null : createCleaner(config);
  const clean =
    deps.clean ??
    (cleaner ? (words: string[], mustKeep: number[], recordedOn?: string) => cleanAndCheck(words, cleaner, mustKeep, recordedOn) : null);

  app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1 } });

  /** Tells the UI (and you) whether the local tools and the cleanup model are ready. */
  app.get("/api/health", async () => {
    if (deps.demo) return { ok: true, ffmpeg: true, whisper: true, model: true, modelPath: "demo", cleanup: true, provider: "demo", demo: true };
    const check = async (fn: () => Promise<unknown>) => fn().then(() => true, () => false);
    const [ffmpeg, whisper, model] = await Promise.all([
      check(() => run(config.ffmpegBin, ["-version"])),
      check(() => run(config.whisperBin, ["--help"])),
      check(() => access(config.whisperModel)),
    ]);
    return { ok: ffmpeg && whisper && model, ffmpeg, whisper, model, modelPath: config.whisperModel, cleanup: clean !== null, provider: cleaner?.provider ?? null, demo: false };
  });

  app.post("/api/transcribe", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "Send the recording as a multipart field named \"audio\"." });
    const audio = await file.toBuffer();
    if (audio.length === 0) return reply.code(400).send({ error: "The recording is empty." });
    try {
      return await transcribe(audio, file.filename);
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: err instanceof Error ? err.message : "Transcription failed." });
    }
  });

  app.post("/api/clean", async (req, reply) => {
    if (!clean) {
      return reply.code(503).send({
        error: "Cleanup needs an API key. Add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY to .env and restart npm run dev.",
      });
    }
    const body = CleanBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Send {words: string[], mustKeep?: number[], recordedOn?: \"YYYY-MM-DD\"}." });
    try {
      return await clean(body.data.words, body.data.mustKeep, body.data.recordedOn);
    } catch (err) {
      req.log.error(err);
      const message = cleaner ? cleanupErrorMessage(err, cleaner.provider, cleaner.model) : err instanceof Error ? err.message : "Cleanup failed.";
      return reply.code(502).send({ error: message });
    }
  });

  return app;
}
