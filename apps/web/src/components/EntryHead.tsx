import type { RefObject } from "react";
import { InkWave } from "./InkWave";

interface Props {
  recordedAt: Date;
  peaks: number[];
  audioUrl: string;
  audioRef: RefObject<HTMLAudioElement>;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function EntryHead({ recordedAt, peaks, audioUrl, audioRef }: Props) {
  return (
    <header className="entry-head">
      <p className="entry-date">
        {dateFmt.format(recordedAt)} · {timeFmt.format(recordedAt)}
      </p>
      <InkWave peaks={peaks} height={48} className="entry-wave" inkVar="--ink-soft" />
      <audio ref={audioRef} controls src={audioUrl} className="player" />
    </header>
  );
}
