import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { checkFacts } from "../verify/facts.js";
import { CleanupError } from "./claude.js";
import { SAMPLE_TOOL_INPUT, SAMPLE_WORDS } from "./fixtures.js";
import { cleanWithGemini, geminiSchema, type GeminiClient } from "./gemini.js";
import { cleanupErrorMessage, createCleaner } from "./providers.js";

function fakeGemini(text: string, finishReason = "STOP") {
  const calls: Parameters<GeminiClient["models"]["generateContent"]>[0][] = [];
  const client: GeminiClient = {
    models: {
      generateContent: async (params) => {
        calls.push(params);
        return { text, candidates: [{ finishReason }] };
      },
    },
  };
  return { client, calls };
}

describe("cleanWithGemini", () => {
  it("asks for schema-shaped JSON and gets a cleanup that passes the fact check", async () => {
    const { client, calls } = fakeGemini(JSON.stringify(SAMPLE_TOOL_INPUT));
    const cleanup = await cleanWithGemini(SAMPLE_WORDS, { client, model: "gemini-3.1-flash-lite" });

    const config = calls[0]!.config!;
    expect(config.responseMimeType).toBe("application/json");
    expect(config.responseJsonSchema).toEqual(geminiSchema());
    expect(String(calls[0]!.contents)).toContain("10:Henderson");
    expect(String(config.systemInstruction)).toMatch(/JSON object/);
    expect(checkFacts(SAMPLE_WORDS, cleanup).flags).toEqual([]);
  });

  it("rejects text that isn't JSON or doesn't match the schema", async () => {
    await expect(cleanWithGemini(SAMPLE_WORDS, { client: fakeGemini("Sure! Here's your note").client, model: "m" })).rejects.toBeInstanceOf(CleanupError);
    await expect(cleanWithGemini(SAMPLE_WORDS, { client: fakeGemini('{"title":"x"}').client, model: "m" })).rejects.toThrow(/expected shape/);
  });

  it("explains a memo that was too long", async () => {
    const { client } = fakeGemini("{", "MAX_TOKENS");
    await expect(cleanWithGemini(SAMPLE_WORDS, { client, model: "m" })).rejects.toThrow(/too long/);
  });
});

describe("geminiSchema", () => {
  it("keeps the shape but drops Zod's 2^53 integer maximum", () => {
    const json = JSON.stringify(geminiSchema());
    expect(json).not.toContain("9007199254740991");
    expect(json).toContain('"minimum":0');
    expect(json).toContain('"self_correction"');
  });
});

describe("provider choice", () => {
  it("uses whichever key is set, Claude first, unless CLEANUP_PROVIDER says otherwise", () => {
    expect(loadConfig({ GEMINI_API_KEY: "g" }).cleanupProvider).toBe("gemini");
    expect(loadConfig({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" }).cleanupProvider).toBe("claude");
    expect(loadConfig({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g", CLEANUP_PROVIDER: "Gemini" }).cleanupProvider).toBe("gemini");
    expect(loadConfig({}).cleanupProvider).toBeNull();
  });

  it("builds a Gemini cleaner with the default model, or nothing without a key", () => {
    expect(createCleaner(loadConfig({ GEMINI_API_KEY: "g" }))).toMatchObject({ provider: "gemini", model: "gemini-3.1-flash-lite" });
    expect(createCleaner(loadConfig({ CLEANUP_PROVIDER: "gemini" }))).toBeNull();
  });
});

describe("cleanupErrorMessage", () => {
  it("says what to fix for each provider", () => {
    expect(cleanupErrorMessage({ status: 400, message: "API key not valid. Please pass a valid API key." }, "gemini", "m")).toContain("GEMINI_API_KEY");
    expect(cleanupErrorMessage({ status: 429 }, "gemini", "m")).toMatch(/free-tier limit/);
    expect(cleanupErrorMessage({ status: 404 }, "gemini", "gemini-x")).toMatch(/"gemini-x".*GEMINI_MODEL/);
    expect(cleanupErrorMessage({ status: 401 }, "claude", "m")).toContain("ANTHROPIC_API_KEY");
    expect(cleanupErrorMessage(new CleanupError("empty"), "claude", "m")).toBe("empty");
    expect(cleanupErrorMessage(new TypeError("fetch failed: getaddrinfo ENOTFOUND generativelanguage.googleapis.com"), "gemini", "m")).toMatch(/Couldn't reach Gemini/);
  });
});

describe("Gemini fallback model", () => {
  const config = loadConfig({ GEMINI_API_KEY: "g" });
  const ok = JSON.stringify(SAMPLE_TOOL_INPUT);

  function scripted(byModel: Record<string, () => unknown>) {
    const seen: string[] = [];
    const client: GeminiClient = {
      models: {
        generateContent: async (params) => {
          seen.push(params.model);
          const outcome = byModel[params.model]!();
          return { text: outcome as string, candidates: [{ finishReason: "STOP" }] };
        },
      },
    };
    return { client, seen };
  }
  const busy = () => {
    throw Object.assign(new Error("The model is overloaded. Please try again later."), { status: 503 });
  };

  it("tries the backup model when the main one is busy, and reports which model wrote the note", async () => {
    const { client, seen } = scripted({ "gemini-3.1-flash-lite": busy, "gemini-3.5-flash-lite": () => ok });
    let fellBack = "";
    const cleaner = createCleaner(config, { geminiClient: client, onFallback: (from, to) => (fellBack = `${from}->${to}`) })!;
    const { model } = await cleaner.clean(SAMPLE_WORDS, []);
    expect(seen).toEqual(["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]);
    expect(model).toBe("gemini-3.5-flash-lite");
    expect(fellBack).toBe("gemini-3.1-flash-lite->gemini-3.5-flash-lite");
  });

  it("doesn't fall back for a bad key, and reports the main model's error if the backup fails too", async () => {
    const badKey = () => {
      throw Object.assign(new Error("API key not valid"), { status: 400 });
    };
    const a = scripted({ "gemini-3.1-flash-lite": badKey, "gemini-3.5-flash-lite": () => ok });
    await expect(createCleaner(config, { geminiClient: a.client })!.clean(SAMPLE_WORDS, [])).rejects.toThrow(/API key/);
    expect(a.seen).toEqual(["gemini-3.1-flash-lite"]);

    const b = scripted({ "gemini-3.1-flash-lite": busy, "gemini-3.5-flash-lite": () => { throw Object.assign(new Error("not found"), { status: 404 }); } });
    await expect(createCleaner(config, { geminiClient: b.client })!.clean(SAMPLE_WORDS, [])).rejects.toThrow(/overloaded/);
  });

  it("can be turned off with an empty GEMINI_FALLBACK_MODEL", () => {
    expect(loadConfig({ GEMINI_FALLBACK_MODEL: "" }).geminiFallbackModel).toBeNull();
    expect(loadConfig({}).geminiFallbackModel).toBe("gemini-3.5-flash-lite");
  });
});
