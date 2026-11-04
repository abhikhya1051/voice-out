import { useMemo } from "react";
import type { Transcript } from "../api";
import { countFillers, markFillers } from "../lib/fillers";
import { formatSeconds, formatTime } from "../lib/format";
import { InkWave } from "./InkWave";

interface Props {
  transcript: Transcript;
  audioUrl: string | null;
  durationMs: number;
  recordedAt: Date;
  peaks: number[];
}

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** One memo as a notebook entry: date, ink sketch of the audio, then the words on ruled lines. */
export function TranscriptView({ transcript, audioUrl, durationMs, recordedAt, peaks }: Props) {
  const allTokens = useMemo(() => markFillers(transcript.text), [transcript.text]);
  const fillers = countFillers(allTokens);
  const words = transcript.text.split(/\s+/).filter(Boolean).length;
  const lines = transcript.segments.length
    ? transcript.segments
    : [{ startMs: 0, endMs: durationMs, text: transcript.text }];

  return (
    <article className="entry" aria-label="Memo">
      <header className="entry-head">
        <p className="entry-date">
          {dateFmt.format(recordedAt)} · {timeFmt.format(recordedAt)}
        </p>
        <InkWave peaks={peaks} height={48} className="entry-wave" inkVar="--ink-soft" />
        {audioUrl && <audio controls src={audioUrl} className="player" />}
      </header>

      {transcript.text ? (
        <ol className="lines">
          {lines.map((seg, i) => (
            <li key={i}>
              <time className="margin-note">{formatTime(seg.startMs)}</time>
              <p>
                {markFillers(seg.text).map((t, j) =>
                  t.filler ? <mark key={j}>{t.text}</mark> : <span key={j}>{t.text}</span>,
                )}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="quiet">Nothing written down. Whisper heard no speech, so try speaking closer to the mic.</p>
      )}

      <footer className="entry-foot">
        <span>{words} words</span>
        <span>
          <mark>{fillers} fillers</mark> kept by Whisper
        </span>
        <span>transcribed in {formatSeconds(transcript.elapsedMs)}</span>
        {durationMs > 0 && <span>{formatTime(durationMs)} of audio</span>}
      </footer>
    </article>
  );
}
