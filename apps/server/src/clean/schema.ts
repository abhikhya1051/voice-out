import { z } from "zod";

/** Word indices are inclusive: {from: 3, to: 5} covers words 3, 4 and 5. */
const span = {
  from: z.number().int().min(0).describe("Index of the first source word"),
  to: z.number().int().min(0).describe("Index of the last source word (inclusive)"),
};

export const CUT_REASONS = ["filler", "false_start", "repeat", "self_correction"] as const;
export type CutReason = (typeof CUT_REASONS)[number];

export const NOTE_TYPES = ["memo", "todo", "journal", "idea", "meeting", "note"] as const;

/** What Claude must return. It never sends transcript text back, only word indices plus the note. */
export const CleanupSchema = z.object({
  title: z.string().describe("Short title for the note, at most 8 words, using only what was said"),
  type: z.enum(NOTE_TYPES),
  cuts: z
    .array(z.object({ ...span, reason: z.enum(CUT_REASONS) }))
    .describe("Ranges of source words to remove, each with why"),
  sentences: z
    .array(z.object({ text: z.string(), ...span }))
    .describe("The clean note, one sentence per item, each citing the source words it came from"),
  keyPoints: z.array(z.object({ text: z.string(), ...span })).describe("0-5 key points, each citing its source words"),
  todos: z
    .array(z.object({ text: z.string(), due: z.string().optional().describe("Deadline exactly as spoken, if any"), ...span }))
    .describe("Concrete action items the speaker gave themselves, each citing its source words"),
  dates: z
    .array(
      z.object({
        ...span,
        anchorFrom: z.number().int().min(0).optional().describe("For a phrase like 'the next day': first word of the day it is relative to"),
        anchorTo: z.number().int().min(0).optional().describe("Last word of that day"),
      }),
    )
    .optional()
    .describe("Every phrase naming a specific day (today, tomorrow, Friday, the next day...). Word positions only; the dates are computed by code"),
});

export type Cleanup = z.infer<typeof CleanupSchema>;
export type NoteItem = { text: string; from: number; to: number };

/** JSON Schema for the Anthropic tool definition, generated from the same Zod schema. */
export function cleanupJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(CleanupSchema) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
