/**
 * One-off backfill: recompute `multikills` on games imported from tracker.gg.
 *
 * Imports before v1.2.0 summed tracker's `doubleKills + tripleKills +
 * quadraKills + pentaKills`, but those buckets count rounds by *exact* kill
 * total, so every 2k was counted as a multikill. The correct value is rounds
 * with 3+ kills (tracker's own `multiKills`).
 *
 * Games keep the tracker response verbatim in `rawJson`, so the right value
 * can be recovered without re-collecting anything. Stored stat rows don't
 * record which tracker player they came from, so each row is matched back to a
 * `player-summary` segment by its full stat line (everything except
 * multikills). A row that doesn't match exactly one segment — because it was
 * hand-edited after import, say — is left alone and reported.
 *
 * Dry run by default; pass --apply to write.
 *
 *   cd server && npm run backfill:multikills           # preview
 *   cd server && npm run backfill:multikills -- --apply
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

type TrackerSegment = {
  type?: unknown;
  attributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  stats?: Record<string, { value?: unknown } | undefined>;
};

/** One tracker player-summary, reduced to the stat line the importer produces. */
type SummaryStat = {
  identifier: string;
  agent: string;
  acs: number;
  hsPercent: number;
  kills: number;
  deaths: number;
  assists: number;
  damageDelta: number;
  adr: number;
  kastPercent: number;
  firstKills: number;
  firstDeaths: number;
  multikills: number;
};

type StoredStat = Record<string, unknown> & { playerId?: unknown; multikills?: unknown };

// Mirrors src/utils/trackerImport.ts so the numbers derived here are
// byte-for-byte what the importer wrote.
function optNum(seg: TrackerSegment, key: string): number | undefined {
  const v = seg.stats?.[key]?.value;
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}

function num(seg: TrackerSegment, key: string): number {
  return optNum(seg, key) ?? 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Extracts every player-summary stat line from a stored tracker.gg response. */
export function summariesFrom(rawJson: unknown): SummaryStat[] {
  const segments = (rawJson as { data?: { segments?: unknown } } | null)?.data?.segments;
  if (!Array.isArray(segments)) return [];
  return (segments as TrackerSegment[])
    .filter((s) => s?.type === 'player-summary')
    .map((seg) => ({
      identifier: String(seg.attributes?.platformUserIdentifier ?? ''),
      agent: typeof seg.metadata?.agentName === 'string' ? seg.metadata.agentName : '',
      acs: Math.round(num(seg, 'scorePerRound')),
      hsPercent: round1(num(seg, 'hsAccuracy')),
      kills: num(seg, 'kills'),
      deaths: num(seg, 'deaths'),
      assists: num(seg, 'assists'),
      damageDelta: Math.round(num(seg, 'damageDeltaPerRound')),
      adr: Math.round(num(seg, 'damagePerRound')),
      kastPercent: round1(num(seg, 'kast')),
      firstKills: num(seg, 'firstKills'),
      firstDeaths: num(seg, 'firstDeaths'),
      // The fix: 3k+ rounds only, from tracker's own counter where present.
      multikills:
        optNum(seg, 'multiKills') ??
        num(seg, 'tripleKills') + num(seg, 'quadraKills') + num(seg, 'pentaKills'),
    }));
}

const FLOAT_EPSILON = 1e-6;

function sameNumber(stored: unknown, derived: number): boolean {
  return typeof stored === 'number' && Math.abs(stored - derived) < FLOAT_EPSILON;
}

/**
 * True if a stored stat row is the same line the importer wrote for this
 * tracker player, ignoring multikills (the field being corrected). `adr` is
 * skipped when absent, since games imported before that field existed omit it.
 */
function isSameStatLine(stored: StoredStat, summary: SummaryStat): boolean {
  if (stored.agent !== summary.agent) return false;
  if (stored.adr !== undefined && !sameNumber(stored.adr, summary.adr)) return false;
  const numeric = [
    'acs',
    'hsPercent',
    'kills',
    'deaths',
    'assists',
    'damageDelta',
    'kastPercent',
    'firstKills',
    'firstDeaths',
  ] as const;
  return numeric.every((key) => sameNumber(stored[key], summary[key]));
}

type Change = { index: number; from: number; to: number; identifier: string };
type Skip = { index: number; playerId: string; reason: string };

/** Pairs each stored stat row with its tracker summary and lists the fixes. */
export function planGame(stats: StoredStat[], summaries: SummaryStat[]) {
  const changes: Change[] = [];
  const skips: Skip[] = [];
  const matchedBy = new Map<string, number[]>(); // identifier -> stat indexes

  stats.forEach((stat, index) => {
    const playerId = typeof stat.playerId === 'string' ? stat.playerId : '';
    if (!playerId) return; // blank padding row
    const candidates = summaries.filter((s) => isSameStatLine(stat, s));
    if (candidates.length !== 1) {
      skips.push({
        index,
        playerId,
        reason: candidates.length === 0 ? 'no matching tracker player' : 'matches multiple tracker players',
      });
      return;
    }
    const summary = candidates[0];
    const claims = matchedBy.get(summary.identifier) ?? [];
    claims.push(index);
    matchedBy.set(summary.identifier, claims);
    if (!sameNumber(stat.multikills, summary.multikills)) {
      changes.push({
        index,
        from: typeof stat.multikills === 'number' ? stat.multikills : NaN,
        to: summary.multikills,
        identifier: summary.identifier,
      });
    }
  });

  // Two rows resolving to the same tracker player means the fingerprint didn't
  // actually disambiguate them — drop both rather than guess.
  const contested = new Set<number>();
  for (const [identifier, indexes] of matchedBy) {
    if (indexes.length < 2) continue;
    for (const index of indexes) {
      contested.add(index);
      skips.push({
        index,
        playerId: String(stats[index]?.playerId ?? ''),
        reason: `ties with another row for ${identifier}`,
      });
    }
  }

  return { changes: changes.filter((c) => !contested.has(c.index)), skips };
}

async function main() {
  const apply = process.argv.includes('--apply');

  // Every game is read and then filtered in memory: JSON-null filtering has
  // enough Prisma sharp edges (DbNull vs JsonNull) that it isn't worth it for
  // a table this size, and non-tracker rawJson has to be skipped anyway.
  const games = await prisma.game.findMany({
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    select: { id: true, date: true, map: true, stats: true, rawJson: true },
  });

  let gamesWithTrackerJson = 0;
  let gamesChanged = 0;
  let statsChanged = 0;
  let statsSkipped = 0;

  for (const game of games) {
    const summaries = summariesFrom(game.rawJson);
    if (summaries.length === 0) continue; // rawJson isn't a tracker.gg response
    gamesWithTrackerJson++;

    const stats = (Array.isArray(game.stats) ? game.stats : []) as StoredStat[];
    const { changes, skips } = planGame(stats, summaries);
    if (changes.length === 0 && skips.length === 0) continue;

    console.log(`\n${game.date}  ${game.map}  (${game.id})`);
    for (const c of changes) {
      console.log(`  ${c.identifier.padEnd(24)} multikills ${c.from} -> ${c.to}`);
    }
    for (const s of skips) {
      console.log(`  [skipped] stat #${s.index} (player ${s.playerId}): ${s.reason}`);
    }
    statsSkipped += skips.length;
    if (changes.length === 0) continue;

    gamesChanged++;
    statsChanged += changes.length;

    if (apply) {
      const next = stats.map((stat, index) => {
        const change = changes.find((c) => c.index === index);
        return change ? { ...stat, multikills: change.to } : stat;
      });
      await prisma.game.update({
        where: { id: game.id },
        data: { stats: next as unknown as Prisma.InputJsonValue },
      });
    }
  }

  console.log(
    [
      '',
      `Games with a tracker.gg response: ${gamesWithTrackerJson}`,
      `Games needing a fix:              ${gamesChanged}`,
      `Stat rows corrected:              ${statsChanged}`,
      `Stat rows skipped:                ${statsSkipped}`,
      '',
      apply ? 'Applied.' : 'Dry run — re-run with --apply to write these changes.',
    ].join('\n')
  );
}

// Only run when invoked directly, so the pure helpers above can be imported.
if (process.argv[1] && process.argv[1].includes('backfillMultikills')) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
