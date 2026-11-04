import { access } from "node:fs/promises";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { z } from "zod";
import type { Config } from "./config.js";
import { CleanupError, createClient } from "./clean/claude.js";
import { cleanAndCheck, type CleanResult } from "./clean/pipeline.js";
import { run } from "./transcribe/run.js";
import { transcribe as defaultTranscribe, type Transcript } from "./transcribe/whisper.js";

export interface AppDeps {
  transcribe?: (audio: Buffer, filename: string) => Promise<Transcript>;
  clean?: (words: string[], mustKeep: number[]) => Promise<CleanResult>;
  /** Demo mode: no local tools or API key needed. */
  demo?: boolean;
}

const CleanBody = z.object({
  words: z.array(z.string()).min(1).max(20000),
  mustKeep: z.array(z.number().int().min(0)).max(20000).default([]),
});

export function buildApp(config: Config, deps: AppDeps = {}) {
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === "test" ? "silent" : "info" },
    bodyLimit: 5 * 1024 * 1024,
  });
  const transcribe = deps.transcribe ?? ((audio: Buffer, filename: string) => defaultTranscribe(audio, filename, config));
  const clean =
    deps.clean ??
    (config.anthropicApiKey
      ? (() => {
          const client = createClient(config.anthropicApiKey);
          return (words: string[], mustKeep: number[]) => cleanAndCheck(words, { client, model: config.claudeModel, mustKeep });
        })()
      : null);

  app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1 } });

  /** Tells the UI (and you) whether the local tools and Claude are ready. */
  app.get("/api/health", async () => {
    if (deps.demo) return { ok: true, ffmpeg: true, whisper: true, model: true, modelPath: "demo", claude: true, demo: true };
    const check = async (fn: () => Promise<unknown>) => fn().then(() => true, () => false);
    const [ffmpeg, whisper, model] = await Promise.all([
      check(() => run(config.ffmpegBin, ["-version"])),
      check(() => run(config.whisperBin, ["--help"])),
      check(() => access(config.whisperModel)),
    ]);
    return { ok: ffmpeg && whisper && model, ffmpeg, whisper, model, modelPath: config.whisperModel, claude: clean !== null, demo: false };
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
      return reply.code(503).send({ error: "Cleanup needs an Anthropic API key. Add ANTHROPIC_API_KEY to .env and restart npm run dev." });
    }
    const body = CleanBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Send {words: string[], mustKeep?: number[]}." });
    try {
      return await clean(body.data.words, body.data.mustKeep);
    } catch (err) {
      req.log.error(err);
      const status = (err as { status?: number }).status;
      const message =
        err instanceof CleanupError
          ? err.message
          : status === 401
            ? "Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env."
            : status === 429 || status === 529
              ? "Claude is busy or you've hit your rate limit. Wait a moment and try again."
              : "Cleanup failed. Check the server terminal for details.";
      return reply.code(502).send({ error: message });
    }
  });

  return app;
}
