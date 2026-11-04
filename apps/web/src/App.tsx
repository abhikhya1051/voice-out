import { useCallback, useEffect, useState } from "react";
import { clean, getHealth, transcribe, type CleanResult, type Health, type Span, type Transcript } from "./api";
import { EntryHead } from "./components/EntryHead";
import { HealthBanner } from "./components/HealthBanner";
import { NoteView } from "./components/NoteView";
import { Recorder } from "./components/Recorder";
import { TranscriptView } from "./components/TranscriptView";
import type { Recording } from "./hooks/useRecorder";
import { useClipPlayer } from "./hooks/useClipPlayer";
import { localYmd } from "./lib/dates";
import { peaksFromBlob } from "./lib/peaks";

type Stage = "idle" | "transcribing" | "cleaning";

interface Memo {
  recording: Recording;
  audioUrl: string;
  transcript: Transcript | null;
  result: CleanResult | null;
}

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  /** The last failure was the cleanup (not transcription), so it can be retried without re-recording. */
  const [cleanFailed, setCleanFailed] = useState(false);
  const [memo, setMemo] = useState<Memo | null>(null);
  const [restoring, setRestoring] = useState<ReadonlySet<number>>(new Set());
  /** Words restored in earlier re-cleans stay protected in later ones. */
  const [kept, setKept] = useState<ReadonlySet<number>>(new Set());
  const [activeSpan, setActiveSpan] = useState<Span | null>(null);
  const { audioRef, playRange } = useClipPlayer();

  useEffect(() => {
    getHealth().then(setHealth, () => setUnreachable(true));
  }, []);

  useEffect(() => () => {
    if (memo) URL.revokeObjectURL(memo.audioUrl);
  }, [memo?.audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const runClean = useCallback(async (transcript: Transcript, mustKeep: number[], recordedAt: Date) => {
    setStage("cleaning");
    setError(null);
    setCleanFailed(false);
    try {
      const result = await clean(transcript.words.map((w) => w.text), mustKeep, localYmd(recordedAt));
      setMemo((m) => (m ? { ...m, result } : m));
      setRestoring(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed.");
      setCleanFailed(true);
    } finally {
      setStage("idle");
    }
  }, []);

  const handleRecording = useCallback(
    async (recording: Recording) => {
      setStage("transcribing");
      setError(null);
      setCleanFailed(false);
      setRestoring(new Set());
      setKept(new Set());
      setActiveSpan(null);
      setMemo({ recording, audioUrl: URL.createObjectURL(recording.blob), transcript: null, result: null });
      let transcript: Transcript;
      try {
        transcript = await transcribe(recording.blob, recording.filename);
        setMemo((m) => (m ? { ...m, transcript } : m));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transcription failed.");
        setStage("idle");
        return;
      }
      if (transcript.words.length === 0) return setStage("idle");
      if (health && !health.cleanup) return setStage("idle");
      await runClean(transcript, [], recording.recordedAt);
    },
    [health, runClean],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      const { peaks, durationMs } = await peaksFromBlob(file).catch(() => ({ peaks: [], durationMs: 0 }));
      await handleRecording({ blob: file, filename: file.name, durationMs, peaks, recordedAt: new Date(file.lastModified) });
    },
    [handleRecording],
  );

  const toggleRestore = useCallback((i: number) => {
    setRestoring((r) => {
      const next = new Set(r);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  const reclean = useCallback(() => {
    if (!memo?.transcript) return;
    const mustKeep = new Set([...kept, ...restoring]);
    setKept(mustKeep);
    void runClean(memo.transcript, [...mustKeep].sort((a, b) => a - b), memo.recording.recordedAt);
  }, [memo, kept, restoring, runClean]);

  const retryClean = useCallback(() => {
    if (!memo?.transcript) return;
    void runClean(memo.transcript, [...kept].sort((a, b) => a - b), memo.recording.recordedAt);
  }, [memo, kept, runClean]);

  const playSpan = useCallback(
    (span: Span) => {
      const words = memo?.transcript?.words;
      const first = words?.[span.from];
      const last = words?.[span.to];
      if (first && last) playRange(first.startMs, last.endMs);
    },
    [memo, playRange],
  );

  const playFromWord = useCallback(
    (i: number) => {
      const w = memo?.transcript?.words[i];
      if (w) playRange(w.startMs, Number.MAX_SAFE_INTEGER);
    },
    [memo, playRange],
  );

  const busy = stage !== "idle";

  return (
    <main className="notebook">
      <header className="masthead">
        <h1>Voice Out</h1>
        <p>Ramble freely. Cleaned up, never made up.</p>
      </header>

      <HealthBanner health={health} unreachable={unreachable} />
      <Recorder busy={busy} onRecording={handleRecording} onUpload={handleUpload} />

      {error && (
        <div className="notice is-error" role="alert">
          <p>{error}</p>
          {cleanFailed && memo?.transcript && (
            <button type="button" className="retry" onClick={retryClean} disabled={busy}>
              Try cleanup again
            </button>
          )}
        </div>
      )}

      {memo && (
        <article className="entry" aria-label="Memo">
          <EntryHead recordedAt={memo.recording.recordedAt} peaks={memo.recording.peaks} audioUrl={memo.audioUrl} audioRef={audioRef} />

          {stage === "transcribing" && <p className="quiet" role="status">Writing down what you said…</p>}

          {memo.transcript &&
            (memo.transcript.words.length ? (
              <TranscriptView
                transcript={memo.transcript}
                result={memo.result}
                restoring={restoring}
                onToggleRestore={toggleRestore}
                activeSpan={activeSpan}
                onPlayWord={playFromWord}
              />
            ) : (
              <p className="quiet">Nothing written down. Whisper heard no speech, so try speaking closer to the mic.</p>
            ))}

          {stage === "cleaning" && <p className="quiet" role="status">Cleaning it up, then checking every fact against your words…</p>}

          {memo.result && (
            <NoteView
              result={memo.result}
              onPoint={setActiveSpan}
              onPlay={playSpan}
              restoringCount={restoring.size}
              onReclean={reclean}
              busy={busy}
            />
          )}

          {memo.transcript && memo.result && (
            <p className="legend">
              <s>struck</s> = cleaned up, tap to restore · <mark>highlighted</mark> = checked fact carried into your note · <span className="date-note">→ date</span> = worked
              out by code from when you recorded · tap any note line to hear it
            </p>
          )}
        </article>
      )}

      {!memo && (
        <p className="quiet empty">
          Talk for 20 or 30 seconds the way you'd leave yourself a voice memo, fillers and all. It'll be written down here, then cleaned up.
        </p>
      )}
    </main>
  );
}
