export interface Segment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface Transcript {
  text: string;
  segments: Segment[];
  elapsedMs: number;
}

export interface Health {
  ok: boolean;
  ffmpeg: boolean;
  whisper: boolean;
  model: boolean;
  modelPath: string;
}

async function errorFrom(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new Error(body?.error ?? `Request failed (${res.status})`);
}

export async function getHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  if (!res.ok) throw await errorFrom(res);
  return res.json() as Promise<Health>;
}

export async function transcribe(audio: Blob, filename: string): Promise<Transcript> {
  const form = new FormData();
  form.append("audio", audio, filename);
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  if (!res.ok) throw await errorFrom(res);
  return res.json() as Promise<Transcript>;
}
