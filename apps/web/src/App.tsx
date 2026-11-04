import { useCallback, useEffect, useState } from "react";
import { getHealth, transcribe, type Health, type Transcript } from "./api";
import { HealthBanner } from "./components/HealthBanner";
import { Recorder } from "./components/Recorder";
import { TranscriptView } from "./components/TranscriptView";
import type { Recording } from "./hooks/useRecorder";
import { peaksFromBlob } from "./lib/peaks";

interface Memo {
  recording: Recording;
  audioUrl: string;
  transcript: Transcript | null;
}

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memo, setMemo] = useState<Memo | null>(null);

  useEffect(() => {
    getHealth().then(setHealth, () => setUnreachable(true));
  }, []);

  useEffect(() => () => {
    if (memo) URL.revokeObjectURL(memo.audioUrl);
  }, [memo?.audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRecording = useCallback(async (recording: Recording) => {
    setBusy(true);
    setError(null);
    setMemo({ recording, audioUrl: URL.createObjectURL(recording.blob), transcript: null });
    try {
      const transcript = await transcribe(recording.blob, recording.filename);
      setMemo((m) => (m ? { ...m, transcript } : m));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleUpload = useCallback(
    async (file: File) => {
      const { peaks, durationMs } = await peaksFromBlob(file).catch(() => ({ peaks: [], durationMs: 0 }));
      await handleRecording({ blob: file, filename: file.name, durationMs, peaks, recordedAt: new Date(file.lastModified) });
    },
    [handleRecording],
  );

  return (
    <main className="notebook">
      <header className="masthead">
        <h1>Voice Out</h1>
        <p>Ramble freely. Voice Out keeps what you meant and drops the "um, like, you know."</p>
      </header>

      <HealthBanner health={health} unreachable={unreachable} />
      <Recorder busy={busy} onRecording={handleRecording} onUpload={handleUpload} />

      {error && <p className="notice is-error" role="alert">{error}</p>}

      {memo?.transcript ? (
        <TranscriptView
          transcript={memo.transcript}
          audioUrl={memo.audioUrl}
          durationMs={memo.recording.durationMs}
          recordedAt={memo.recording.recordedAt}
          peaks={memo.recording.peaks}
        />
      ) : (
        !busy &&
        !error && (
          <p className="quiet empty">
            Talk for 20 or 30 seconds the way you'd leave yourself a voice memo, fillers and all. It'll be written down here.
          </p>
        )
      )}
    </main>
  );
}
