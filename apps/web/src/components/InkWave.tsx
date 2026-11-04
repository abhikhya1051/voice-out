import { useEffect, useRef, type RefObject } from "react";
import { resample } from "../lib/peaks";

interface Props {
  /** Static peaks (a finished memo) ... */
  peaks?: number[];
  /** ... or a live ref that grows while recording. */
  liveRef?: RefObject<number[]>;
  /** Live mode shows the most recent samples scrolling in from the right. */
  live?: boolean;
  height?: number;
  className?: string;
  /** CSS variable holding the ink color. */
  inkVar?: string;
}

const POINTS = 140;

/** Draws loudness as one continuous pen line, mirrored around the middle, like a sketch of the sound. */
export function InkWave({ peaks, liveRef, live = false, height = 56, className, inkVar = "--ink" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr) canvas.width = w * dpr;
      if (canvas.height !== h * dpr) canvas.height = h * dpr;
      const g = canvas.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const source = liveRef?.current ?? peaks ?? [];
      const pts = live
        ? [...new Array(Math.max(0, POINTS - source.length)).fill(0), ...source.slice(-POINTS)]
        : resample(source, POINTS);

      const ink = getComputedStyle(canvas).getPropertyValue(inkVar).trim() || "#333";
      const mid = h / 2;
      const amp = h / 2 - 3;
      const step = w / (POINTS - 1);

      // One stroke: across the top envelope, back along the bottom, so it reads as a single drawn shape
      g.beginPath();
      pts.forEach((p, i) => {
        const x = i * step;
        const y = mid - Math.max(0.6, p * amp);
        if (i === 0) g.moveTo(x, y);
        else {
          const px = (i - 1) * step;
          const py = mid - Math.max(0.6, (pts[i - 1] ?? 0) * amp);
          g.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
        }
      });
      for (let i = pts.length - 1; i >= 0; i--) g.lineTo(i * step, mid + Math.max(0.6, (pts[i] ?? 0) * amp * 0.85));
      g.closePath();
      g.globalAlpha = 0.12;
      g.fillStyle = ink;
      g.fill();
      g.globalAlpha = 1;
      g.lineWidth = 1.4;
      g.lineJoin = "round";
      g.strokeStyle = ink;
      g.stroke();

      if (live) raf = requestAnimationFrame(draw);
    };

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [peaks, liveRef, live, inkVar]);

  return <canvas ref={canvasRef} className={className} style={{ width: "100%", height }} aria-hidden="true" />;
}
