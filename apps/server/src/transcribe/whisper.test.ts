import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { DISFLUENCY_PROMPT, parseWhisperJson, transcribe } from "./whisper.js";
import type { Runner } from "./run.js";

const tok = (text: string, from: number, to: number) => ({ text, offsets: { from, to } });

/** Shape of whisper.cpp -ojf output: segments with sub-word tokens and special markers. */
const fullJson = JSON.stringify({
  transcription: [
    {
      offsets: { from: 0, to: 2400 },
      text: " Um, so we should move it",
      tokens: [tok("[_BEG_]", 0, 0), tok(" Um", 0, 300), tok(",", 300, 350), tok(" so", 400, 600), tok(" we", 700, 800), tok(" sh", 800, 900), tok("ould", 900, 1100), tok(" move", 1200, 1500), tok(" it", 1500, 1700), tok("[_TT_120]", 2400, 2400)],
    },
    { offsets: { from: 2400, to: 3000 }, text: " [BLANK_AUDIO]", tokens: [tok(" [BLANK_AUDIO]", 2400, 3000)] },
    {
      offsets: { from: 3000, to: 4000 },
      text: " to Thursday.",
      tokens: [tok(" to", 3000, 3200), tok(" Thursday", 3300, 3800), tok(".", 3800, 3900)],
    },
  ],
});

describe("parseWhisperJson", () => {
  it("merges sub-word tokens into words with timestamps", () => {
    const t = parseWhisperJson(fullJson);
    expect(t.words.map((w) => w.text)).toEqual(["Um,", "so", "we", "should", "move", "it", "to", "Thursday."]);
    expect(t.words[3]).toEqual({ text: "should", startMs: 800, endMs: 1100 });
    expect(t.text).toBe("Um, so we should move it to Thursday.");
  });

  it("drops non-speech segments and records each segment's word range", () => {
    const t = parseWhisperJson(fullJson);
    expect(t.segments).toHaveLength(2);
    expect(t.segments[1]).toMatchObject({ firstWord: 6, endWord: 8, text: "to Thursday." });
  });

  it("falls back to evenly spaced words when there are no tokens", () => {
    const t = parseWhisperJson(JSON.stringify({ transcription: [{ offsets: { from: 0, to: 3000 }, text: " one two three" }] }));
    expect(t.words).toEqual([
      { text: "one", startMs: 0, endMs: 1000 },
      { text: "two", startMs: 1000, endMs: 2000 },
      { text: "three", startMs: 2000, endMs: 3000 },
    ]);
  });

  it("handles empty output", () => {
    expect(parseWhisperJson("{}")).toEqual({ text: "", words: [], segments: [] });
  });
});

describe("transcribe", () => {
  it("converts with ffmpeg, then calls whisper with the disfluency prompt and full JSON", async () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const fakeRun: Runner = async (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === "whisper-cli") await writeFile(`${args[args.indexOf("-of") + 1]}.json`, fullJson);
      return { stdout: "", stderr: "" };
    };

    const config = loadConfig({ WHISPER_MODEL: "/models/test.bin" });
    const t = await transcribe(Buffer.from("fake audio"), "memo.webm", config, { run: fakeRun });

    expect(calls.map((c) => c.cmd)).toEqual(["ffmpeg", "whisper-cli"]);
    expect(calls[0]!.args).toEqual(expect.arrayContaining(["-ar", "16000", "-ac", "1"]));
    const args = calls[1]!.args;
    expect(args[args.indexOf("-m") + 1]).toBe("/models/test.bin");
    expect(args[args.indexOf("--prompt") + 1]).toBe(DISFLUENCY_PROMPT);
    expect(args).toContain("-ojf");
    expect(t.words).toHaveLength(8);
  });
});
