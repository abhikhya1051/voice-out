import Anthropic from "@anthropic-ai/sdk";
import { normalizeCleanup } from "./normalize.js";
import { buildUserMessage, systemPrompt } from "./prompt.js";
import { CleanupSchema, cleanupJsonSchema, type Cleanup } from "./schema.js";

export const TOOL_NAME = "save_cleanup";

/** The slice of the Anthropic client we use, so tests can pass a fake. */
export interface MessagesClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Pick<Anthropic.Message, "content" | "stop_reason">>;
  };
}

export class CleanupError extends Error {}

export interface CleanOptions {
  client: MessagesClient;
  model: string;
  mustKeep?: number[];
}

/** Asks Claude to cut fillers and write the note, forcing a schema-validated tool call. */
export async function cleanWithClaude(words: string[], { client, model, mustKeep = [] }: CleanOptions): Promise<Cleanup> {
  if (words.length === 0) throw new CleanupError("There's nothing to clean up: the transcript is empty.");

  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    system: systemPrompt("tool"),
    tools: [
      {
        name: TOOL_NAME,
        description: "Save the cleanup: which words to cut and the clean note, all citing word numbers.",
        input_schema: cleanupJsonSchema() as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: buildUserMessage(words, mustKeep) }],
  });

  if (response.stop_reason === "max_tokens") {
    throw new CleanupError("This memo is too long to clean in one go. Try a recording under about 10 minutes.");
  }
  const call = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_NAME);
  if (!call) throw new CleanupError("Claude didn't return a cleanup. Try again.");

  const parsed = CleanupSchema.safeParse(call.input);
  if (!parsed.success) {
    throw new CleanupError(`Claude's cleanup didn't match the expected shape: ${parsed.error.issues[0]?.message ?? "unknown issue"}`);
  }
  return normalizeCleanup(parsed.data, words.length, mustKeep);
}

export function createClient(apiKey: string): MessagesClient {
  return new Anthropic({ apiKey });
}
