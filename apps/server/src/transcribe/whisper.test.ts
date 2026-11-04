import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { DISFLUENCY_PROMPT, parseWhisperJson, transcribe } from "./whisper.js";
import type { Runner } from "./run.js";

const sampleJson = JSON.stringify({
  transcription: [
    { offsets: { from: 0, to: 2400 }, text: " Um, so, like, I was thinking" },
    { offsets: { from: 2400, to: 3000 }, text: " [BLANK_AUDIO]" },
    { offsets: { from: 3000, to: 6100 }, text: " we should, uh, move the demo to Thursday." },
  ],
});

describe("parseWhisperJson", () => {
  it("keeps fillers, drops non-speech markers, joins text", () => {
    const t = parseWhisperJson(sampleJson);
    expect(t.segments).toHaveLength(2);
    expect(t.segments[0]).toEqual({ startMs: 0, endMs: 2400, text: "Um, so, like, I was thinking" });
    expect(t.text).toBe("Um, so, like, I was thinking we should, uh, move the demo to Thursday.");
  });

  it("handles empty output", () => {
    expect(parseWhisperJson("{}")).toEqual({ text: "", segments: [] });
  });
});

describe("transcribe", () => {
  it("converts with ffmpeg, then calls whisper with the disfluency prompt", async () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const fakeRun: Runner = async (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === "whisper-cli") {
        const outBase = args[args.indexOf("-of") + 1]!;
        await writeFile(`${outBase}.json`, sampleJson);
      }
      return { stdout: "", stderr: "" };
    };

    const config = loadConfig({ WHISPER_MODEL: "/models/test.bin" });
    const t = await transcribe(Buffer.from("fake audio"), "memo.webm", config, { run: fakeRun });

    expect(calls.map((c) => c.cmd)).toEqual(["ffmpeg", "whisper-cli"]);
    expect(calls[0]!.args).toEqual(expect.arrayContaining(["-ar", "16000", "-ac", "1"]));
    const whisperArgs = calls[1]!.args;
    expect(whisperArgs[whisperArgs.indexOf("-m") + 1]).toBe("/models/test.bin");
    expect(whisperArgs[whisperArgs.indexOf("--prompt") + 1]).toBe(DISFLUENCY_PROMPT);
    expect(t.text).toContain("uh, move the demo");
  });
});
