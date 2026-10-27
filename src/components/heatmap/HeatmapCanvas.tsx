import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  gameToImageUV,
  viewDirectionUV,
  type HeatmapEvent,
  type MapDetails,
} from '../../utils/heatmapData';
import AgentIcon from '../AgentIcon';

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

// Point dot radius in grid units, and how close (in screen px) the cursor
// has to be to a dot to count as hovering it.
const DOT_RADIUS = 4;
const HOVER_PX = 8;
// Length of the facing indicator drawn from a hovered dot, in grid units.
const FACING_LEN = 48;
const FACING_HEAD = 14;

function formatRoundTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

function formatGameDate(iso: string): string {
  // T00:00:00 forces local-time parsing so the date doesn't shift a day.
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export type HeatmapGameInfo = { date: string; series: string };

type Props = {
  imageUrl: string;
  mapDetails: MapDetails;
  events: HeatmapEvent[];
  /** Whether the blurred heatmap layer renders at all. */
  heatmapEnabled: boolean;
  /** Alpha (0..1) for the raw point dots; 0 hides them entirely. Dots are
   * only hoverable while visible. */
  pointsOpacity: number;
  /** Display name per raw tracker.gg identifier, for the hover tooltip. */
  playerNames: ReadonlyMap<string, string>;
  /** Date and series label per Game id, for the hover tooltip. */
  gameInfo: ReadonlyMap<string, HeatmapGameInfo>;
  /** Events have been re-centered on the opponent (invertHeatmapEvents), so
   * each dot is an enemy and the black dot is our player. */
  inverted: boolean;
};

export default function HeatmapCanvas({
  imageUrl,
  mapDetails,
  events,
  heatmapEnabled,
  pointsOpacity,
  playerNames,
  gameInfo,
  inverted,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    index: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const points = useMemo(
    () =>
      events.map((e) => {
        const { u, v } = gameToImageUV(e.x, e.y, mapDetails);
        return { kind: e.kind, u, v };
      }),
    [events, mapDetails]
  );

  // Drop a stale hover when the filtered set changes underneath it or the
  // dots get hidden.
  useEffect(() => setHover(null), [points, pointsOpacity]);

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (pointsOpacity <= 0 || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best = -1;
    let bestD = HOVER_PX;
    for (let i = 0; i < points.length; i++) {
      const d = Math.hypot(points[i].u * rect.width - x, points[i].v * rect.height - y);
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best >= 0 ? { index: best, x, y, w: rect.width, h: rect.height } : null);
  };

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
        ctx.arc(px, py, DOT_RADIUS, 0, Math.PI * 2);
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

  const hovered = hover ? events[hover.index] : null;
  const hoveredPoint = hover ? points[hover.index] : null;
  const opponentPoint =
    hovered && hovered.opponentX !== undefined && hovered.opponentY !== undefined
      ? gameToImageUV(hovered.opponentX, hovered.opponentY, mapDetails)
      : null;
  // The arrow always comes from the killer. When the killer is the hovered
  // dot it follows their recorded view angle; when it's the black dot it
  // points straight at the hovered dot.
  const dotIsKiller = !!hovered && (hovered.kind === 'kill') !== inverted;
  const towardDot = (() => {
    if (!opponentPoint || !hoveredPoint) return null;
    const du = hoveredPoint.u - opponentPoint.u;
    const dv = hoveredPoint.v - opponentPoint.v;
    const len = Math.hypot(du, dv);
    return len > 0 ? { du: du / len, dv: dv / len } : null;
  })();
  const arrow = (() => {
    if (!hovered || !hoveredPoint) return null;
    if (dotIsKiller) {
      const dir =
        hovered.viewRadians !== undefined
          ? viewDirectionUV(hovered.x, hovered.y, hovered.viewRadians, mapDetails)
          : towardDot && { du: -towardDot.du, dv: -towardDot.dv };
      return dir ? { u: hoveredPoint.u, v: hoveredPoint.v, ...dir } : null;
    }
    return opponentPoint && towardDot
      ? { u: opponentPoint.u, v: opponentPoint.v, ...towardDot }
      : null;
  })();

  return (
    <div
      ref={wrapRef}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHover(null)}
      className={`relative w-full aspect-square rounded-lg overflow-hidden border border-white/10 bg-valorant-panel2 ${
        hovered ? 'cursor-pointer' : ''
      }`}
    >
      <img
        src={imageUrl}
        alt="Map minimap"
        className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
        draggable={false}
      />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {hovered && hoveredPoint && (
        <svg
          viewBox={`0 0 ${RES} ${RES}`}
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          {opponentPoint && (
            <>
              <line
                x1={hoveredPoint.u * RES}
                y1={hoveredPoint.v * RES}
                x2={opponentPoint.u * RES}
                y2={opponentPoint.v * RES}
                stroke="white"
                strokeOpacity={0.6}
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
            </>
          )}
          {arrow && <FacingArrow {...arrow} />}
          {opponentPoint && (
            <circle
              cx={opponentPoint.u * RES}
              cy={opponentPoint.v * RES}
              r={DOT_RADIUS + 1.5}
              fill="black"
              stroke="white"
              strokeWidth={1.5}
            />
          )}
          <circle
            cx={hoveredPoint.u * RES}
            cy={hoveredPoint.v * RES}
            r={DOT_RADIUS + 3}
            fill="none"
            stroke="white"
            strokeWidth={2}
          />
        </svg>
      )}

      {hover && hovered && (
        <HoverTooltip
          event={hovered}
          playerNames={playerNames}
          game={gameInfo.get(hovered.gameId)}
          inverted={inverted}
          dotIsKiller={dotIsKiller}
          x={hover.x}
          y={hover.y}
          flipX={hover.x > hover.w / 2}
          flipY={hover.y > hover.h / 2}
        />
      )}
    </div>
  );
}

/** White arrow from a hovered dot along the player's view direction, with a
 * dark outline so it reads over both the heatmap and the minimap art. */
function FacingArrow({ u, v, du, dv }: { u: number; v: number; du: number; dv: number }) {
  const x0 = u * RES;
  const y0 = v * RES;
  const tipX = x0 + du * FACING_LEN;
  const tipY = y0 + dv * FACING_LEN;
  const baseX = tipX - du * FACING_HEAD;
  const baseY = tipY - dv * FACING_HEAD;
  // Perpendicular, for the arrowhead's two back corners.
  const px = -dv * FACING_HEAD * 0.6;
  const py = du * FACING_HEAD * 0.6;
  const head = `${tipX},${tipY} ${baseX + px},${baseY + py} ${baseX - px},${baseY - py}`;
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <line x1={x0} y1={y0} x2={baseX} y2={baseY} stroke="black" strokeOpacity={0.7} strokeWidth={7} />
      <polygon points={head} fill="black" fillOpacity={0.7} stroke="black" strokeOpacity={0.7} strokeWidth={3} />
      <line x1={x0} y1={y0} x2={baseX} y2={baseY} stroke="white" strokeWidth={4} />
      <polygon points={head} fill="white" />
    </g>
  );
}

function HoverTooltip({
  event,
  playerNames,
  game,
  inverted,
  dotIsKiller,
  x,
  y,
  flipX,
  flipY,
}: {
  event: HeatmapEvent;
  playerNames: ReadonlyMap<string, string>;
  game: HeatmapGameInfo | undefined;
  inverted: boolean;
  dotIsKiller: boolean;
  x: number;
  y: number;
  flipX: boolean;
  flipY: boolean;
}) {
  const offset = 14;
  const isKill = event.kind === 'kill';
  const nameOf = (id: string) => playerNames.get(id) ?? id.split('#')[0];
  return (
    <div
      className="absolute z-10 pointer-events-none rounded-md border border-white/10 bg-valorant-panel/95 shadow-lg px-3 py-2 text-xs w-52"
      style={{
        left: x,
        top: y,
        transform: `translate(${flipX ? `calc(-100% - ${offset}px)` : `${offset}px`}, ${
          flipY ? `calc(-100% - ${offset}px)` : `${offset}px`
        })`,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <AgentIcon agent={event.agent} size={28} className="shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">
            {nameOf(event.player)}
          </div>
          <div className="text-valorant-muted truncate">
            {inverted && 'Enemy · '}
            {event.agent} ·{' '}
            <span className={isKill ? 'text-[#0ca30c]' : 'text-[#d03b3b]'}>
              {dotIsKiller ? 'Kill' : 'Death'}
            </span>
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {game && (
          <>
            <dt className="text-valorant-muted">Date</dt>
            <dd className="text-white">{formatGameDate(game.date)}</dd>
            <dt className="text-valorant-muted">Series</dt>
            <dd className="text-white truncate">{game.series}</dd>
          </>
        )}
        <dt className="text-valorant-muted">Side</dt>
        <dd className="text-white">{event.side === 'attacker' ? 'Attack' : 'Defense'}</dd>
        <dt className="text-valorant-muted">Time</dt>
        <dd className="text-white tabular-nums">{formatRoundTime(event.roundTime)}</dd>
        <dt className="text-valorant-muted">Spike</dt>
        <dd className="text-white">
          {event.afterPlant ? 'Post-plant' : 'Pre-plant'}
          {event.plantSite && (
            <span className="text-valorant-muted"> ({event.plantSite} site)</span>
          )}
        </dd>
        <dt className="text-valorant-muted">{dotIsKiller ? 'Killed' : 'Killed by'}</dt>
        <dd className="text-white flex items-center gap-1.5 min-w-0">
          {event.opponentAgent && (
            <AgentIcon agent={event.opponentAgent} size={16} className="shrink-0" />
          )}
          <span className="truncate">{nameOf(event.opponent)}</span>
        </dd>
      </dl>
    </div>
  );
}
