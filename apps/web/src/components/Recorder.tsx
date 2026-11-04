import { useRef } from "react";
import { useRecorder, type Recording } from "../hooks/useRecorder";
import { formatTime } from "../lib/format";
import { InkWave } from "./InkWave";

interface Props {
  busy: boolean;
  onRecording: (rec: Recording) => void;
  onUpload: (file: File) => void;
}

export function Recorder({ busy, onRecording, onUpload }: Props) {
  const { state, error, elapsedMs, peaksRef, start, stop } = useRecorder(onRecording);
  const fileRef = useRef<HTMLInputElement>(null);
  const recording = state === "recording";

  return (
    <section className={`recorder${recording ? " is-recording" : ""}`} aria-label="Recorder">
      <button
        type="button"
        className="mic"
        onClick={recording ? stop : start}
        disabled={busy}
        aria-label={recording ? "Stop recording" : "Start recording"}
        aria-pressed={recording}
      >
        <span className="mic-capsule" aria-hidden="true">
          <span className="mic-grille" />
        </span>
        <span className="mic-stand" aria-hidden="true" />
      </button>

      <div className="recorder-body">
        <div className="recorder-line">
          <span className="recorder-state">{recording ? "Listening" : busy ? "Writing it down…" : "Tap the mic and talk"}</span>
          <span className="recorder-time">{formatTime(recording ? elapsedMs : 0)}</span>
        </div>
        {recording ? (
          <InkWave liveRef={peaksRef} live height={44} inkVar="--rec" />
        ) : (
          <div className="recorder-rule" aria-hidden="true" />
        )}
        <div className="recorder-line">
          <button type="button" className="link" onClick={() => fileRef.current?.click()} disabled={busy || recording}>
            or upload a voice memo
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,video/mp4"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />
        {error && <p className="recorder-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}
