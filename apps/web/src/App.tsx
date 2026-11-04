import { useCallback, useEffect, useState } from "react";
import { getHealth, transcribe, type Health, type Transcript } from "./api";
import { HealthBanner } from "./components/HealthBanner";
import { Recorder } from "./components/Recorder";
import { TranscriptView } from "./components/TranscriptView";
import type { Recording } from "./hooks/useRecorder";

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);

  useEffect(() => {
    getHealth().then(setHealth, () => setUnreachable(true));
  }, []);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const handleRecording = useCallback(async (rec: Recording) => {
    setBusy(true);
    setError(null);
    setTranscript(null);
    setAudioUrl(URL.createObjectURL(rec.blob));
    setDurationMs(rec.durationMs);
    try {
      setTranscript(await transcribe(rec.blob, rec.filename));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <main className="app">
      <header className="masthead">
        <h1>Voice Out</h1>
        <p>Ramble freely. Voice Out keeps what you meant and drops the "um, like, you know."</p>
      </header>

      <HealthBanner health={health} unreachable={unreachable} />
      <Recorder busy={busy} onRecording={handleRecording} />

      {busy && <p className="working" role="status">Transcribing on your Mac…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {transcript && <TranscriptView transcript={transcript} audioUrl={audioUrl} durationMs={durationMs} />}

      {!busy && !transcript && !error && (
        <p className="empty">
          Press Record and talk for 20–30 seconds the way you'd leave yourself a voice memo, fillers and all.
          Or upload a voice memo from your phone.
        </p>
      )}
    </main>
  );
}
