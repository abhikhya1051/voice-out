export interface Word {
  text: string;
  startMs: number;
  endMs: number;
}

export interface Segment {
  startMs: number;
  endMs: number;
  text: string;
  firstWord: number;
  endWord: number;
}

export interface Transcript {
  text: string;
  words: Word[];
  segments: Segment[];
  elapsedMs: number;
}

export type CutReason = "filler" | "false_start" | "repeat" | "self_correction";
export interface Span {
  from: number;
  to: number;
}
export interface NoteItem extends Span {
  text: string;
}

export interface Cleanup {
  title: string;
  type: string;
  cuts: (Span & { reason: CutReason })[];
  sentences: NoteItem[];
  keyPoints: NoteItem[];
  todos: (NoteItem & { due?: string })[];
}

export type ItemKind = "sentence" | "keyPoint" | "todo";
export interface Flag {
  kind: ItemKind;
  index: number;
  fact: string;
  problem: "not_said" | "corrected" | "negation_dropped" | "negation_added";
  message: string;
}

export interface FactCheck {
  checked: number;
  supported: number;
  flags: Flag[];
  factWords: number[];
}

export interface CleanResult {
  cleanup: Cleanup;
  check: FactCheck;
  model: string;
  elapsedMs: number;
}

export interface Health {
  ok: boolean;
  ffmpeg: boolean;
  whisper: boolean;
  model: boolean;
  modelPath: string;
  claude: boolean;
  demo: boolean;
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

export async function clean(words: string[], mustKeep: number[] = []): Promise<CleanResult> {
  const res = await fetch("/api/clean", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ words, mustKeep }),
  });
  if (!res.ok) throw await errorFrom(res);
  return res.json() as Promise<CleanResult>;
}
