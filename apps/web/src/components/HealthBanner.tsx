import type { Health } from "../api";

interface Props {
  health: Health | null;
  unreachable: boolean;
}

export function HealthBanner({ health, unreachable }: Props) {
  if (unreachable) {
    return (
      <p className="notice" role="status">
        The server isn't responding. Start everything with <code>npm run dev</code> from the repo root.
      </p>
    );
  }
  if (!health) return null;
  if (health.demo) {
    return (
      <p className="notice" role="status">
        Demo mode: any recording becomes a sample memo with a recorded cleanup. The fact check runs for real. Run{" "}
        <code>npm run dev</code> to use your own voice.
      </p>
    );
  }

  const missing = [
    !health.ffmpeg && "ffmpeg",
    !health.whisper && "whisper-cli",
    !health.model && `the model file (${health.modelPath})`,
  ].filter(Boolean);

  return (
    <>
      {missing.length > 0 && (
        <p className="notice" role="status">
          Missing {missing.join(", ")}. Run <code>npm run setup:whisper</code>, then restart <code>npm run dev</code>.
        </p>
      )}
      {!health.cleanup && (
        <p className="notice" role="status">
          Transcription works, but the clean note needs an API key. Add a free <code>GEMINI_API_KEY</code> (or{" "}
          <code>ANTHROPIC_API_KEY</code>) to <code>.env</code> and restart <code>npm run dev</code>.
        </p>
      )}
    </>
  );
}
