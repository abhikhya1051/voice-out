import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/** Repo root: apps/server/src (or dist) -> ../../.. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

dotenv.config({ path: path.join(ROOT, ".env") });

export interface Config {
  port: number;
  whisperBin: string;
  whisperModel: string;
  ffmpegBin: string;
  maxUploadBytes: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const model = env.WHISPER_MODEL ?? "models/ggml-small.en.bin";
  return {
    port: Number(env.PORT ?? 8787),
    whisperBin: env.WHISPER_BIN ?? "whisper-cli",
    whisperModel: path.isAbsolute(model) ? model : path.join(ROOT, model),
    ffmpegBin: env.FFMPEG_BIN ?? "ffmpeg",
    maxUploadBytes: 50 * 1024 * 1024,
  };
}
