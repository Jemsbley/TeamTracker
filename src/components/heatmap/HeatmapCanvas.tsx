import { useEffect, useMemo, useRef } from 'react';
import { gameToImageUV, type HeatmapEvent, type MapDetails } from '../../utils/heatmapData';

// Internal accumulation grid resolution (square). Higher = smoother but
// slower; this is plenty for the point counts a single match produces.
const RES = 800;

// Status-palette "good"/"critical" — already validated for contrast in both
// modes, and their good/bad semantics line up with kill/death directly.
const GREEN: [number, number, number] = [12, 163, 12];
const RED: [number, number, number] = [208, 59, 59];

// Locked-in design values from prototyping — no longer exposed as sliders.
const RADIUS = 50;
const FALLOFF_POWER = 3.0;
const GAMMA = 0.65;
const MAX_ALPHA = 1.0;

type Props = {
  imageUrl: string;
  mapDetails: MapDetails;
  events: HeatmapEvent[];
  /** Whether the blurred heatmap layer renders at all. */
  heatmapEnabled: boolean;
  /** Alpha (0..1) for the raw point dots; 0 hides them entirely. */
  pointsOpacity: number;
};

export default function HeatmapCanvas({
  imageUrl,
  mapDetails,
  events,
  heatmapEnabled,
  pointsOpacity,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const points = useMemo(
    () =>
      events.map((e) => {
        const { u, v } = gameToImageUV(e.x, e.y, mapDetails);
        return { kind: e.kind, u, v };
      }),
    [events, mapDetails]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = RES;
    canvas.height = RES;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, RES, RES);

    if (heatmapEnabled) {
      const grid = new Float32Array(RES * RES);

      for (const p of points) {
        const px = p.u * RES;
        const py = p.v * RES;
        const sign = p.kind === 'kill' ? 1 : -1;
        const minX = Math.max(0, Math.floor(px - RADIUS));
        const maxX = Math.min(RES - 1, Math.ceil(px + RADIUS));
        const minY = Math.max(0, Math.floor(py - RADIUS));
        const maxY = Math.min(RES - 1, Math.ceil(py + RADIUS));
        for (let yy = minY; yy <= maxY; yy++) {
          const rowBase = yy * RES;
          const dy = yy + 0.5 - py;
          for (let xx = minX; xx <= maxX; xx++) {
            const dx = xx + 0.5 - px;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > RADIUS) continue;
            const t = 1 - d / RADIUS;
            grid[rowBase + xx] += sign * Math.pow(t, FALLOFF_POWER);
          }
        }
      }

      let maxAbs = 0;
      for (let i = 0; i < grid.length; i++) {
        const a = Math.abs(grid[i]);
        if (a > maxAbs) maxAbs = a;
      }
      if (maxAbs === 0) maxAbs = 1;

      const imgData = ctx.createImageData(RES, RES);
      const data = imgData.data;
      for (let i = 0; i < grid.length; i++) {
        const v = grid[i] / maxAbs;
        const idx = i * 4;
        if (v > 0.0005) {
          const t = Math.pow(Math.min(1, v), GAMMA);
          data[idx] = GREEN[0];
          data[idx + 1] = GREEN[1];
          data[idx + 2] = GREEN[2];
          data[idx + 3] = Math.round(t * MAX_ALPHA * 255);
        } else if (v < -0.0005) {
          const t = Math.pow(Math.min(1, -v), GAMMA);
          data[idx] = RED[0];
          data[idx + 1] = RED[1];
          data[idx + 2] = RED[2];
          data[idx + 3] = Math.round(t * MAX_ALPHA * 255);
        } else {
          data[idx + 3] = 0;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    if (pointsOpacity > 0) {
      for (const p of points) {
        const px = p.u * RES;
        const py = p.v * RES;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle =
          p.kind === 'kill'
            ? `rgba(140,255,140,${pointsOpacity})`
            : `rgba(255,140,140,${pointsOpacity})`;
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(0,0,0,${pointsOpacity * 0.6})`;
        ctx.fill();
        ctx.stroke();
      }
    }
  }, [points, heatmapEnabled, pointsOpacity]);

  return (
    <div className="relative w-full aspect-square rounded-lg overflow-hidden border border-white/10 bg-valorant-panel2">
      <img
        src={imageUrl}
        alt="Map minimap"
        className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
        draggable={false}
      />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
