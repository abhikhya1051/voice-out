import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "recording" | "error";

export interface Recording {
  blob: Blob;
  filename: string;
  durationMs: number;
}

/** Picks a container the browser can record: webm/opus in Chrome/Firefox, mp4/aac in Safari. */
function pickMimeType(): { mime: string; ext: string } {
  const options = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "m4a" },
  ];
  return options.find((o) => MediaRecorder.isTypeSupported(o.mime)) ?? { mime: "", ext: "webm" };
}

export function useRecorder(onDone: (rec: Recording) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const startedRef = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const { mime, ext } = pickMimeType();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        const durationMs = Date.now() - startedRef.current;
        cleanup();
        setState("idle");
        onDoneRef.current({
          blob: new Blob(chunks, { type: recorder.mimeType }),
          filename: `recording-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`,
          durationMs,
        });
      };

      // Level meter + timer, driven by one animation loop
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
        setLevel(peak);
        setElapsedMs(Date.now() - startedRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };

      startedRef.current = Date.now();
      setElapsedMs(0);
      recorder.start(250);
      mediaRef.current = recorder;
      setState("recording");
      tick();
    } catch (err) {
      cleanup();
      setState("error");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in the browser's address bar, then try again."
          : "Couldn't start the microphone. Check that one is connected.",
      );
    }
  }, [cleanup]);

  const stop = useCallback(() => {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
  }, []);

  return { state, error, elapsedMs, level, start, stop };
}
