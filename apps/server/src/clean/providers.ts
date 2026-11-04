import type { Config } from "../config.js";
import { cleanWithClaude, CleanupError, createClient } from "./claude.js";
import { cleanWithGemini, createGeminiClient } from "./gemini.js";
import type { Cleanup } from "./schema.js";

export type Provider = "claude" | "gemini";

/** A configured model that turns numbered words into a cleanup. The fact check doesn't care which. */
export interface Cleaner {
  provider: Provider;
  model: string;
  clean(words: string[], mustKeep: number[]): Promise<Cleanup>;
}

/** Builds the cleaner chosen in .env, or null when no API key is set. */
export function createCleaner(config: Config): Cleaner | null {
  if (config.cleanupProvider === "claude" && config.anthropicApiKey) {
    const client = createClient(config.anthropicApiKey);
    return { provider: "claude", model: config.claudeModel, clean: (words, mustKeep) => cleanWithClaude(words, { client, model: config.claudeModel, mustKeep }) };
  }
  if (config.cleanupProvider === "gemini" && config.geminiApiKey) {
    const client = createGeminiClient(config.geminiApiKey);
    return { provider: "gemini", model: config.geminiModel, clean: (words, mustKeep) => cleanWithGemini(words, { client, model: config.geminiModel, mustKeep }) };
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
      ? "You've hit Gemini's free-tier limit. Wait a minute and try again; if it keeps happening, the daily limit is used up until tomorrow."
      : "You've hit Claude's rate limit, or the account has no credit. Wait a moment, or add credit at console.anthropic.com.";
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network/i.test(text)) {
    return `Couldn't reach ${name}. Check your internet connection and try again.`;
  }
  if (status === 529 || status === 503 || /overloaded|UNAVAILABLE/i.test(text)) {
    return `${name} is busy right now. Try again in a moment.`;
  }
  return "Cleanup failed. Check the server terminal for details.";
}
