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
  if (!health || health.ok) return null;

  const missing = [
    !health.ffmpeg && "ffmpeg",
    !health.whisper && "whisper-cli",
    !health.model && `the model file (${health.modelPath})`,
  ].filter(Boolean);

  return (
    <p className="notice" role="status">
      Missing {missing.join(", ")}. Run <code>npm run setup:whisper</code>, then restart <code>npm run dev</code>.
    </p>
  );
}
