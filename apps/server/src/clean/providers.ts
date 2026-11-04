import type { Config } from "../config.js";
import { cleanWithClaude, CleanupError, createClient } from "./claude.js";
import { cleanWithGemini, createGeminiClient, type GeminiClient } from "./gemini.js";
import type { Cleanup } from "./schema.js";

export type Provider = "claude" | "gemini";

/** A configured model that turns numbered words into a cleanup. The fact check doesn't care which. */
export interface Cleaner {
  provider: Provider;
  model: string;
  /** Resolves with the cleanup and the model that actually wrote it (it may be the fallback). */
  clean(words: string[], mustKeep: number[]): Promise<{ cleanup: Cleanup; model: string }>;
}

/** Busy, rate-limited or a server hiccup: worth another model's try. Not for bad keys or bad requests. */
export function isTransient(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  const text = String((err as { message?: unknown })?.message ?? err);
  return [429, 500, 502, 503, 504, 529].includes(status ?? 0) || /overloaded|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(text);
}

export interface FallbackDeps {
  onFallback?: (from: string, to: string, err: unknown) => void;
}

/** Builds the cleaner chosen in .env, or null when no API key is set. */
export function createCleaner(config: Config, deps: FallbackDeps & { geminiClient?: GeminiClient } = {}): Cleaner | null {
  if (config.cleanupProvider === "claude" && config.anthropicApiKey) {
    // The Anthropic SDK already retries busy/rate-limited requests twice with backoff
    const client = createClient(config.anthropicApiKey);
    const model = config.claudeModel;
    return { provider: "claude", model, clean: async (words, mustKeep) => ({ cleanup: await cleanWithClaude(words, { client, model, mustKeep }), model }) };
  }
  if (config.cleanupProvider === "gemini" && config.geminiApiKey) {
    const client = deps.geminiClient ?? createGeminiClient(config.geminiApiKey);
    const { geminiModel: primary, geminiFallbackModel: fallback } = config;
    return {
      provider: "gemini",
      model: primary,
      clean: async (words, mustKeep) => {
        try {
          return { cleanup: await cleanWithGemini(words, { client, model: primary, mustKeep }), model: primary };
        } catch (err) {
          // Busy or out of quota even after retries: each model has its own capacity and free-tier quota
          if (!fallback || fallback === primary || !isTransient(err)) throw err;
          deps.onFallback?.(primary, fallback, err);
          try {
            return { cleanup: await cleanWithGemini(words, { client, model: fallback, mustKeep }), model: fallback };
          } catch {
            throw err; // the first model's error says more about what to do
          }
        }
      },
    };
  }
  return null;
}

const NAME: Record<Provider, string> = { claude: "Claude", gemini: "Gemini" };
const KEY_VAR: Record<Provider, string> = { claude: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY" };
const MODEL_VAR: Record<Provider, string> = { claude: "CLAUDE_MODEL", gemini: "GEMINI_MODEL" };

/** Turns SDK errors from either provider into one sentence that says what to do. */
export function cleanupErrorMessage(err: unknown, provider: Provider, model: string): string {
  if (err instanceof CleanupError) return err.message;
  const status = (err as { status?: number }).status;
  const text = String((err as { message?: unknown })?.message ?? err);
  const name = NAME[provider];

  if (status === 401 || status === 403 || /api key not valid|invalid.*api.?key|API_KEY_INVALID/i.test(text)) {
    return `${name} rejected the API key. Check ${KEY_VAR[provider]} in .env.`;
  }
  if (status === 404 || /not found|is not supported/i.test(text)) {
    return `The model "${model}" isn't available to your ${name} key. Change ${MODEL_VAR[provider]} in .env.`;
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(text)) {
    return provider === "gemini"
      ? "You've hit Gemini's free-tier limit. Your recording is safe: press \"Try cleanup again\" in a minute. If it keeps happening, today's limit is used up."
      : "You've hit Claude's rate limit, or the account has no credit. Wait a moment, or add credit at console.anthropic.com.";
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network/i.test(text)) {
    return `Couldn't reach ${name}. Check your internet connection and try again.`;
  }
  if (status === 529 || status === 503 || status === 500 || /overloaded|UNAVAILABLE|high demand/i.test(text)) {
    return `${name} is busy right now${provider === "gemini" ? " (tried 3 times and a backup model)" : ""}. Your recording is safe: press "Try cleanup again" in a minute.`;
  }
  return "Cleanup failed. Check the server terminal for details.";
}
