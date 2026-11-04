import { useCallback, useEffect, useRef } from "react";

/** Plays a slice of the recording: "let me hear where I said that." */
export function useClipPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const stopAtRef = useRef<number | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      if (stopAtRef.current !== null && audio.currentTime >= stopAtRef.current) {
        audio.pause();
        stopAtRef.current = null;
      }
    };
    const onSeek = () => {
      if (stopAtRef.current !== null && audio.currentTime > stopAtRef.current) stopAtRef.current = null;
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("seeking", onSeek);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("seeking", onSeek);
    };
  });

  const playRange = useCallback((startMs: number, endMs: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    // A little air on either side so the first and last words aren't clipped
    audio.currentTime = Math.max(0, startMs / 1000 - 0.15);
    stopAtRef.current = endMs / 1000 + 0.25;
    void audio.play().catch(() => undefined);
  }, []);

  return { audioRef, playRange };
}
