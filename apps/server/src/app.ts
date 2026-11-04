import { access } from "node:fs/promises";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import type { Config } from "./config.js";
import { run } from "./transcribe/run.js";
import { transcribe as defaultTranscribe, type Transcript } from "./transcribe/whisper.js";

export interface AppDeps {
  transcribe?: (audio: Buffer, filename: string) => Promise<Transcript>;
}

export function buildApp(config: Config, deps: AppDeps = {}) {
  const app = Fastify({ logger: { level: process.env.NODE_ENV === "test" ? "silent" : "info" } });
  const transcribe = deps.transcribe ?? ((audio: Buffer, filename: string) => defaultTranscribe(audio, filename, config));

  app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1 } });

  /** Tells the UI (and you) whether the local tools are ready. */
  app.get("/api/health", async () => {
    const check = async (fn: () => Promise<unknown>) => fn().then(() => true, () => false);
    const [ffmpeg, whisper, model] = await Promise.all([
      check(() => run(config.ffmpegBin, ["-version"])),
      check(() => run(config.whisperBin, ["--help"])),
      check(() => access(config.whisperModel)),
    ]);
    return { ok: ffmpeg && whisper && model, ffmpeg, whisper, model, modelPath: config.whisperModel };
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

  return app;
}
