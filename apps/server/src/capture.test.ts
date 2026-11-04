import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadCaptured } from "./capture.js";
import { SAMPLE_TOOL_INPUT, SAMPLE_WORDS } from "./clean/fixtures.js";
import { normalizeCleanup } from "./clean/normalize.js";
import { checkCleanup } from "./clean/pipeline.js";
import { loadConfig } from "./config.js";
import { demoSource } from "./demo.js";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

function multipart(content: Buffer, filename: string) {
  const b = "----vo";
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="audio"; filename="${filename}"\r\nContent-Type: audio/webm\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${b}--\r\n`),
  ]);
  return { payload: body, headers: { "content-type": `multipart/form-data; boundary=${b}` } };
}

describe("capture mode", () => {
  it("saves the recording, transcript and cleanup, and demo mode replays them with the original date", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "vo-capture-"));
    dirs.push(dir);
    const words = SAMPLE_WORDS.map((text, i) => ({ text, startMs: i * 300, endMs: i * 300 + 250 }));
    const transcript = { text: SAMPLE_WORDS.join(" "), words, segments: [], elapsedMs: 5 };
    const cleanup = normalizeCleanup(SAMPLE_TOOL_INPUT as never, SAMPLE_WORDS.length);
    const app = buildApp(loadConfig({}), {
      captureDir: dir,
      transcribe: async () => transcript,
      clean: async (w, keep, on) => ({ ...checkCleanup(w, cleanup, on!, keep), model: "gemini-test", elapsedMs: 1 }),
    });

    await app.inject({ method: "POST", url: "/api/transcribe", ...multipart(Buffer.from("audio!"), "take.webm") });
    await app.inject({ method: "POST", url: "/api/clean", payload: { words: SAMPLE_WORDS, recordedOn: "2026-11-03" } });
    expect((await readdir(dir)).sort()).toEqual(["cleanup.json", "memo.webm", "transcript.json"]);

    const captured = loadCaptured(dir)!;
    expect(captured).toMatchObject({ model: "gemini-test", recordedOn: "2026-11-03", audioFile: "memo.webm" });

    // Replayed on a different day, "tomorrow" still means Nov 4: the day it was recorded
    const replay = demoSource(captured).clean(SAMPLE_WORDS, [], "2027-01-01");
    expect(replay.dates.find((d) => d.phrase === "tomorrow")?.date).toBe("2026-11-04");
    expect(replay.check.flags).toEqual([]);
    expect(replay.model).toBe("gemini-test (captured)");
  });

  it("falls back to the built-in sample when demo/ has no complete capture", () => {
    expect(demoSource(null).description).toBe("the built-in sample memo");
  });
});
