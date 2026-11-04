import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

function multipartBody(field: string, filename: string, content: Buffer) {
  const boundary = "----voiceouttest";
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: audio/webm\r\n\r\n`;
  const body = Buffer.concat([Buffer.from(head), content, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

describe("POST /api/transcribe", () => {
  it("returns the transcript for an uploaded recording", async () => {
    const app = buildApp(loadConfig({}), {
      transcribe: async (audio, filename) => ({
        text: `got ${audio.length} bytes from ${filename}`,
        segments: [],
        elapsedMs: 1,
      }),
    });
    const { body, contentType } = multipartBody("audio", "memo.webm", Buffer.from("abcd"));
    const res = await app.inject({ method: "POST", url: "/api/transcribe", payload: body, headers: { "content-type": contentType } });
    expect(res.statusCode).toBe(200);
    expect(res.json().text).toBe("got 4 bytes from memo.webm");
  });

  it("surfaces transcription errors as 500 with a message", async () => {
    const app = buildApp(loadConfig({}), {
      transcribe: async () => {
        throw new Error('"whisper-cli" was not found.');
      },
    });
    const { body, contentType } = multipartBody("audio", "memo.webm", Buffer.from("abcd"));
    const res = await app.inject({ method: "POST", url: "/api/transcribe", payload: body, headers: { "content-type": contentType } });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toContain("whisper-cli");
  });
});
