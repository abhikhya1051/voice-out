import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "recording" | "error";

export interface Recording {
  blob: Blob;
  filename: string;
  durationMs: number;
  recordedAt: Date;
  /** Loudness samples 0..1 (~20 per second), used to draw the memo's ink waveform. */
  peaks: number[];
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

const PEAK_INTERVAL_MS = 50;

export function useRecorder(onDone: (rec: Recording) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  /** Live peaks while recording; the waveform canvas reads this every frame. */
  const peaksRef = useRef<number[]>([]);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const startedRef = useRef(0);
  // Keep the latest callback without re-creating start/stop (updated after render, not during it)
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
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
      const recordedAt = new Date();
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        const durationMs = Date.now() - startedRef.current;
        cleanup();
        setState("idle");
        onDoneRef.current({
          blob: new Blob(chunks, { type: recorder.mimeType }),
          filename: `recording-${recordedAt.toISOString().replace(/[:.]/g, "-")}.${ext}`,
          durationMs,
          recordedAt,
          peaks: [...peaksRef.current],
        });
      };

      // Timer + waveform samples, driven by one animation loop
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      let windowPeak = 0;
      let lastSample = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        for (const v of buf) windowPeak = Math.max(windowPeak, Math.abs(v - 128) / 128);
        const now = Date.now();
        if (now - lastSample >= PEAK_INTERVAL_MS) {
          peaksRef.current.push(Math.min(1, windowPeak * 2.2));
          windowPeak = 0;
          lastSample = now;
        }
        setElapsedMs(now - startedRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };

      peaksRef.current = [];
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

  return { state, error, elapsedMs, peaksRef, start, stop };
}
