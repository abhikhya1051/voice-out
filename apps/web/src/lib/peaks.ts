/** Builds waveform peaks for an uploaded file, so it gets the same ink sketch as a live recording. */
export async function peaksFromBlob(blob: Blob, perSecond = 20): Promise<{ peaks: number[]; durationMs: number }> {
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = audio.getChannelData(0);
    const step = Math.max(1, Math.floor(audio.sampleRate / perSecond));
    const peaks: number[] = [];
    for (let i = 0; i < data.length; i += step) {
      let peak = 0;
      for (let j = i; j < Math.min(i + step, data.length); j++) peak = Math.max(peak, Math.abs(data[j] ?? 0));
      peaks.push(peak);
    }
    const max = Math.max(0.05, ...peaks);
    return { peaks: peaks.map((p) => p / max), durationMs: audio.duration * 1000 };
  } finally {
    void ctx.close();
  }
}

/** Shrinks or stretches peaks to a fixed number of points (max per bucket). */
export function resample(peaks: number[], points: number): number[] {
  if (peaks.length === 0) return new Array(points).fill(0);
  return Array.from({ length: points }, (_, i) => {
    const from = Math.floor((i * peaks.length) / points);
    const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / points));
    let m = 0;
    for (let j = from; j < to; j++) m = Math.max(m, peaks[j] ?? 0);
    return m;
  });
}
