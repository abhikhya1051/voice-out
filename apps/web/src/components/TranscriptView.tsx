import type { CleanResult, Span, Transcript } from "../api";
import { formatTime } from "../lib/format";
import { inSpan, REASON_LABEL, wordMarks } from "../lib/marks";

interface Props {
  transcript: Transcript;
  result: CleanResult | null;
  restoring: ReadonlySet<number>;
  onToggleRestore: (index: number) => void;
  /** Source words of the note line you're pointing at, lit up here. */
  activeSpan: Span | null;
  onPlayWord: (index: number) => void;
}

/** What you actually said, on ruled lines: struck = cleaned up, highlighted = carried into the note. */
export function TranscriptView({ transcript, result, restoring, onToggleRestore, activeSpan, onPlayWord }: Props) {
  const marks = wordMarks(transcript.words.length, result, restoring);
  const dateEndingAt = new Map((result?.dates ?? []).map((d) => [d.to, d]));
  const segments = transcript.segments.length
    ? transcript.segments
    : [{ startMs: 0, endMs: 0, text: transcript.text, firstWord: 0, endWord: transcript.words.length }];

  return (
    <section aria-label="What you said">
      <h2 className="section-label">What you said</h2>
      <ol className="lines">
        {segments.map((seg) => (
          <li key={seg.firstWord}>
            <button type="button" className="margin-note" onClick={() => onPlayWord(seg.firstWord)} aria-label={`Play from ${formatTime(seg.startMs)}`}>
              {formatTime(seg.startMs)}
            </button>
            <p>
              {transcript.words.slice(seg.firstWord, seg.endWord).map((word, k) => {
                const i = seg.firstWord + k;
                const mark = marks[i]!;
                // The tint for "you said it here" sits on the wrapper (space included) so it reads as one continuous run
                const source = inSpan(i, activeSpan) ? "is-source" : undefined;
                const space = k > 0 ? " " : "";
                if (mark.kind === "cut") {
                  const label = REASON_LABEL[mark.reason];
                  return (
                    <span key={i} className={source}>
                      {space}
                      <button
                        type="button"
                        className={`cut${mark.restoring ? " is-restoring" : ""}`}
                        data-reason={label}
                        title={mark.restoring ? "Restored. Re-clean to keep it." : `Cut as ${label}. Tap to restore.`}
                        aria-pressed={mark.restoring}
                        aria-label={`${word.text}, cut as ${label}${mark.restoring ? ", restored" : ""}`}
                        onClick={() => onToggleRestore(i)}
                      >
                        {word.text}
                      </button>
                    </span>
                  );
                }
                const date = dateEndingAt.get(i);
                return (
                  <span key={i} className={source}>
                    {space}
                    {mark.kind === "fact" ? <mark className="fact">{word.text}</mark> : word.text}
                    {date && (
                      <span className="date-note is-inline" title={`Worked out: ${date.basis}`}>
                        → {date.label}
                      </span>
                    )}
                  </span>
                );
              })}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
