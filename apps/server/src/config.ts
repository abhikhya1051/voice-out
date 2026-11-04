import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/** Repo root: apps/server/src (or dist) -> ../../.. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

dotenv.config({ path: path.join(ROOT, ".env"), quiet: true });

export interface Config {
  port: number;
  whisperBin: string;
  whisperModel: string;
  ffmpegBin: string;
  /** Try the GPU (Metal) first. Set WHISPER_GPU=false to always use the CPU. */
  whisperGpu: boolean;
  maxUploadBytes: number;
  /** Which model cleans up memos; null when no API key is set. */
  cleanupProvider: "claude" | "gemini" | null;
  anthropicApiKey: string | null;
  claudeModel: string;
  geminiApiKey: string | null;
  geminiModel: string;
  /** Tried once if the main Gemini model is busy or out of quota. Empty to disable. */
  geminiFallbackModel: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const model = env.WHISPER_MODEL ?? "models/ggml-small.en.bin";
  const anthropicApiKey = env.ANTHROPIC_API_KEY?.trim() || null;
  const geminiApiKey = env.GEMINI_API_KEY?.trim() || null;
  // CLEANUP_PROVIDER wins; otherwise use whichever key is set (Claude first if both are)
  const chosen = env.CLEANUP_PROVIDER?.trim().toLowerCase();
  const cleanupProvider =
    chosen === "claude" || chosen === "gemini" ? chosen : anthropicApiKey ? "claude" : geminiApiKey ? "gemini" : null;
  return {
    port: Number(env.PORT ?? 8787),
    whisperBin: env.WHISPER_BIN ?? "whisper-cli",
    whisperModel: path.isAbsolute(model) ? model : path.join(ROOT, model),
    ffmpegBin: env.FFMPEG_BIN ?? "ffmpeg",
    whisperGpu: !/^(false|0|no|off)$/i.test(env.WHISPER_GPU?.trim() ?? ""),
    maxUploadBytes: 50 * 1024 * 1024,
    cleanupProvider,
    anthropicApiKey,
    claudeModel: env.CLAUDE_MODEL?.trim() || "claude-haiku-5-5",
    geminiApiKey,
    geminiModel: env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite",
    geminiFallbackModel: env.GEMINI_FALLBACK_MODEL === undefined ? "gemini-3.5-flash-lite" : env.GEMINI_FALLBACK_MODEL.trim() || null,
  };
}
