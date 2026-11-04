import { useMemo, useState } from "react";
import type { Transcript } from "../api";
import { countFillers, markFillers } from "../lib/fillers";
import { formatSeconds, formatTime } from "../lib/format";

interface Props {
  transcript: Transcript;
  audioUrl: string | null;
  durationMs: number;
}

export function TranscriptView({ transcript, audioUrl, durationMs }: Props) {
  const [showSegments, setShowSegments] = useState(false);
  const tokens = useMemo(() => markFillers(transcript.text), [transcript.text]);
  const fillers = countFillers(tokens);
  const words = transcript.text.split(/\s+/).filter(Boolean).length;

  return (
    <section className="panel" aria-label="Raw transcript">
      <header className="panel-head">
        <h2>Raw transcript</h2>
        <div className="stats">
          <span>{words} words</span>
          <span>{fillers} fillers kept</span>
          <span>transcribed in {formatSeconds(transcript.elapsedMs)}</span>
          {durationMs > 0 && <span>{formatTime(durationMs)} audio</span>}
        </div>
      </header>

      {audioUrl && <audio controls src={audioUrl} className="player" />}

      {transcript.text ? (
        <p className="transcript">
          {tokens.map((t, i) => (t.filler ? <mark key={i}>{t.text}</mark> : <span key={i}>{t.text}</span>))}
        </p>
      ) : (
        <p className="muted">Whisper heard no speech. Try speaking closer to the mic.</p>
      )}

      <p className="hint">
        Highlighted words are fillers Whisper kept. If you said "um" and it's missing here, Whisper dropped it.
        Step 3 replaces this simple highlighter with Claude's context-aware cleanup.
      </p>

      {transcript.segments.length > 0 && (
        <>
          <button type="button" className="ghost small" onClick={() => setShowSegments((v) => !v)} aria-expanded={showSegments}>
            {showSegments ? "Hide" : "Show"} timestamps ({transcript.segments.length} segments)
          </button>
          {showSegments && (
            <ol className="segments">
              {transcript.segments.map((s, i) => (
                <li key={i}>
                  <time>{formatTime(s.startMs)}</time>
                  <span>{s.text}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
