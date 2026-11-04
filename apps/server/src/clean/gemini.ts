import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";
import { CleanupError } from "./claude.js";
import { normalizeCleanup } from "./normalize.js";
import { buildUserMessage, systemPrompt } from "./prompt.js";
import { CleanupSchema, cleanupJsonSchema, type Cleanup } from "./schema.js";

/** The slice of the Google GenAI client we use, so tests can pass a fake. */
export interface GeminiClient {
  models: {
    generateContent(params: GenerateContentParameters): Promise<{ text?: string; candidates?: { finishReason?: string }[] }>;
  };
}

/** Gemini accepts a subset of JSON Schema; drop the "maximum: 2^53-1" Zod adds to every integer. */
export function geminiSchema(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(cleanupJsonSchema(), (key, value) => (key === "maximum" && value >= Number.MAX_SAFE_INTEGER ? undefined : value)));
}

/** Same job as cleanWithClaude, using Gemini's structured JSON output instead of a tool call. */
export async function cleanWithGemini(
  words: string[],
  { client, model, mustKeep = [] }: { client: GeminiClient; model: string; mustKeep?: number[] },
): Promise<Cleanup> {
  if (words.length === 0) throw new CleanupError("There's nothing to clean up: the transcript is empty.");

  const response = await client.models.generateContent({
    model,
    contents: buildUserMessage(words, mustKeep),
    config: {
      systemInstruction: systemPrompt("json"),
      responseMimeType: "application/json",
      responseJsonSchema: geminiSchema(),
      maxOutputTokens: 8000,
      temperature: 0,
    },
  });

  const finish = response.candidates?.[0]?.finishReason;
  if (finish === "MAX_TOKENS") throw new CleanupError("This memo is too long to clean in one go. Try a recording under about 10 minutes.");
  if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST") {
    throw new CleanupError("Gemini declined to process this memo.");
  }

  let json: unknown;
  try {
    json = JSON.parse(response.text ?? "");
  } catch {
    throw new CleanupError("Gemini didn't return a cleanup. Try again.");
  }
  const parsed = CleanupSchema.safeParse(json);
  if (!parsed.success) {
    throw new CleanupError(`Gemini's cleanup didn't match the expected shape: ${parsed.error.issues[0]?.message ?? "unknown issue"}`);
  }
  return normalizeCleanup(parsed.data, words.length, mustKeep);
}

/**
 * The SDK doesn't retry unless asked. Retry busy/rate-limited/server errors a couple of times
 * with short pauses (~1.5s, ~3s), so a brief overload doesn't fail the memo.
 */
export function createGeminiClient(apiKey: string): GeminiClient {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { retryOptions: { attempts: 3, initialDelay: 1.5, maxDelay: 5, httpStatusCodes: [429, 500, 502, 503, 504] } },
  });
}
