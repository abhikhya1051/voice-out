import { useRef } from "react";
import { useRecorder, type Recording } from "../hooks/useRecorder";
import { formatTime } from "../lib/format";

interface Props {
  busy: boolean;
  onRecording: (rec: Recording) => void;
}

export function Recorder({ busy, onRecording }: Props) {
  const { state, error, elapsedMs, level, start, stop } = useRecorder(onRecording);
  const fileRef = useRef<HTMLInputElement>(null);
  const recording = state === "recording";

  return (
    <section className={`recorder${recording ? " is-recording" : ""}`} aria-label="Recorder">
      <button
        type="button"
        className="rec-btn"
        onClick={recording ? stop : start}
        disabled={busy}
        aria-pressed={recording}
      >
        <span className="rec-dot" aria-hidden="true" />
        {recording ? "Stop" : "Record"}
      </button>

      <div className="rec-meter" aria-hidden="true">
        <div className="rec-meter-fill" style={{ transform: `scaleX(${recording ? Math.min(1, level * 2.5) : 0})` }} />
      </div>

      <span className="rec-time">{formatTime(recording ? elapsedMs : 0)}</span>

      <button type="button" className="ghost" onClick={() => fileRef.current?.click()} disabled={busy || recording}>
        Upload audio
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,video/mp4"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onRecording({ blob: file, filename: file.name, durationMs: 0 });
          e.target.value = "";
        }}
      />

      {error && <p className="rec-error" role="alert">{error}</p>}
    </section>
  );
}
