import { describe, expect, it } from "vitest";
import { cleanWithClaude, CleanupError, TOOL_NAME, type MessagesClient } from "./claude.js";
import { SAMPLE_TOOL_INPUT, SAMPLE_WORDS } from "./fixtures.js";
import { normalizeCleanup } from "./normalize.js";
import { buildUserMessage } from "./prompt.js";
import { checkFacts } from "../verify/facts.js";
import { checkCleanup } from "./pipeline.js";

function fakeClient(input: unknown, stop_reason: "tool_use" | "max_tokens" = "tool_use") {
  const calls: Parameters<MessagesClient["messages"]["create"]>[0][] = [];
  const client: MessagesClient = {
    messages: {
      create: async (params) => {
        calls.push(params);
        return { stop_reason, content: [{ type: "tool_use", id: "t1", name: TOOL_NAME, input, caller: { type: "direct" } }] } as never;
      },
    },
  };
  return { client, calls };
}

describe("cleanWithClaude", () => {
  it("forces the tool call and sends numbered words", async () => {
    const { client, calls } = fakeClient(SAMPLE_TOOL_INPUT);
    const result = await cleanWithClaude(SAMPLE_WORDS, { client, model: "claude-haiku-5-5" });

    expect(calls[0]!.tool_choice).toEqual({ type: "tool", name: TOOL_NAME });
    expect(calls[0]!.model).toBe("claude-haiku-5-5");
    expect(JSON.stringify(calls[0]!.messages)).toContain("10:Henderson");
    expect(result.sentences).toHaveLength(3);
    expect(result.todos[1]!.due).toBe("by tomorrow");
  });

  it("rejects output that doesn't match the schema", async () => {
    const { client } = fakeClient({ title: "x" });
    await expect(cleanWithClaude(SAMPLE_WORDS, { client, model: "m" })).rejects.toBeInstanceOf(CleanupError);
  });

  it("explains when the memo is too long", async () => {
    const { client } = fakeClient(SAMPLE_TOOL_INPUT, "max_tokens");
    await expect(cleanWithClaude(SAMPLE_WORDS, { client, model: "m" })).rejects.toThrow(/too long/);
  });

  it("the sample cleanup passes the fact check with nothing invented", () => {
    const cleanup = normalizeCleanup(SAMPLE_TOOL_INPUT as never, SAMPLE_WORDS.length);
    const check = checkFacts(SAMPLE_WORDS, cleanup);
    expect(check.flags).toEqual([]);
    expect(check.checked).toBeGreaterThan(8);
    expect(check.factWords).toEqual(expect.arrayContaining([10, 22, 25, 29, 47, 54, 69]));
  });
});

describe("checkCleanup", () => {
  it("works out the sample memo's dates from the recording day and accepts them in the note", () => {
    const cleanup = normalizeCleanup(SAMPLE_TOOL_INPUT as never, SAMPLE_WORDS.length);
    const { dates, check } = checkCleanup(SAMPLE_WORDS, cleanup, "2026-11-03");
    expect(dates.map((d) => [d.phrase, d.label])).toEqual([
      ["Thursday", "Thu, Nov 5"],
      ["Tuesday", "Tue, Nov 3"],
      ["tomorrow", "Wed, Nov 4"],
    ]);
    // A note that names the worked-out day ("Wednesday" for "tomorrow") isn't flagged as invented
    const withDay = { ...cleanup, sentences: [{ text: "Email Marcus the budget numbers by Wednesday.", from: 43, to: 54 }] };
    expect(checkCleanup(SAMPLE_WORDS, withDay, "2026-11-03").check.flags).toEqual([]);
    expect(check.flags).toEqual([]);
  });
});

describe("normalizeCleanup", () => {
  const base = { title: " ", type: "memo" as const, sentences: [], keyPoints: [], todos: [] };

  it("clamps, un-reverses and merges cut ranges", () => {
    const out = normalizeCleanup({ ...base, cuts: [{ from: 5, to: 2, reason: "filler" }, { from: 4, to: 99, reason: "repeat" }] }, 8);
    expect(out.cuts).toEqual([{ from: 2, to: 7, reason: "filler" }]);
    expect(out.title).toBe("Untitled memo");
  });

  it("never cuts a word the speaker restored, splitting the range around it", () => {
    const out = normalizeCleanup({ ...base, cuts: [{ from: 1, to: 5, reason: "filler" }] }, 10, [3]);
    expect(out.cuts).toEqual([
      { from: 1, to: 2, reason: "filler" },
      { from: 4, to: 5, reason: "filler" },
    ]);
  });
});

describe("buildUserMessage", () => {
  it("lists restored words when re-cleaning", () => {
    expect(buildUserMessage(["a", "b"], [1])).toMatch(/restored these words.*1\./s);
  });
});
