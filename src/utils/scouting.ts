import { MAPS } from '../constants';
import type { Game, GameStat, Player, ScoutMatch, ScoutingReport, ValorantMap } from '../types';
import { aggregateAbilities, type AbilityUsage } from './abilities';
import { buildHeatmapMatchFromRawExport, isHeatmapRawExport } from './heatmapData';
import { aggregateEconomy, type RoundEconomy } from './rounds';
import { gameOutcome } from './stats';
import { parseTrackerMatch, projectRoundsForTeam } from './trackerImport';

export const MIN_TAGS = 5;
export const MAX_TAGS = 10;
export const MIN_PLAYERS_OPTIONS = [3, 4, 5] as const;
export const DEFAULT_MIN_PLAYERS = 5;

/** Default match cutoff: Sep 1 of this year once it has passed, otherwise
 * Jan 1 of this year — whichever start date is most recent. */
export function defaultScoutSince(today = new Date()): string {
  const y = today.getFullYear();
  return today >= new Date(y, 8, 1) ? `${y}-09-01` : `${y}-01-01`;
}

/** Reports made before the tracker.gg rework have no player list and use
 * the original hand-entered format (LegacyScoutingReport). */
export function isLegacyReport(report: ScoutingReport): boolean {
  return report.tags == null;
}

export function scoutSince(report: ScoutingReport): string {
  return report.since || defaultScoutSince();
}

/* ------------------------------------------------------------------ Riot IDs */

/**
 * Comparison key for a Riot ID: lowercase, single spaces, no spaces around the
 * '#'. The generated script uses the same rule, so keep the two in step.
 */
export function scoutKey(riotId: string): string {
  return riotId.trim().toLowerCase().replace(/\s*#\s*/, '#').replace(/\s+/g, ' ');
}

/** A Riot ID is "name#tag": exactly one '#', with something on both sides. */
export function isRiotId(s: string): boolean {
  return /^[^#]+#[^#]+$/.test(s.trim());
}

/** Splits pasted text into Riot IDs: one per line, or separated by commas,
 * semicolons or tabs. Duplicates (by scoutKey) are dropped. Names can contain
 * spaces, so spaces never split. */
export function parseTagList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n\r,;\t]+/)) {
    const tag = raw.trim().replace(/\s*#\s*/, '#');
    if (!tag) continue;
    const key = scoutKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** A player's Customs tab on tracker.gg (the '#' in the Riot ID is encoded). */
export function trackerCustomsUrl(riotId: string): string {
  return `https://tracker.gg/valorant/profile/riot/${encodeURIComponent(riotId.trim())}/customs`;
}

/* ------------------------------------------------------------ console script */

// Plain JS pasted into the browser console on tracker.gg. No backticks or
// "${" inside, so it can sit in a template literal; __PLACEHOLDERS__ are
// filled with JSON-encoded config by buildScoutScript.
const SCRIPT_BODY = String.raw`// TeamTracker scouting script for __TEAM_LABEL__.
// Paste into the browser console while on the tracker.gg profile page of any
// player on this roster. The player is read from the page URL, so the same
// script works on every roster player's page.
(async () => {
  const TEAM = __TEAM__;
  const ROSTER = __ROSTER__;
  const MIN_ON_TEAM = __MIN__;
  const SINCE = __SINCE__; // ignore matches before this date
  const CUTOFF = new Date(SINCE + 'T00:00:00').getTime();
  const API = 'https://api.tracker.gg/api/v2/valorant/standard/matches';
  const DELAY_MS = 800;

  const m = location.pathname.match(/\/profile\/riot\/([^/]+)/);
  if (!m) {
    alert('Open one of the players\' tracker.gg profile pages first, then run this again.');
    return;
  }
  const PROFILE = decodeURIComponent(m[1]);
  const key = (h) => String(h || '').trim().toLowerCase().replace(/\s*#\s*/, '#').replace(/\s+/g, ' ');
  const roster = new Set(ROSTER);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const listedTime = (x) => {
    const t = Date.parse((x && x.metadata && (x.metadata.timestamp || x.metadata.dateStarted)) || '');
    return Number.isNaN(t) ? null : t;
  };
  console.log('%cScouting ' + TEAM + ' from ' + PROFILE + ' since ' + SINCE, 'font-weight:bold');

  async function get(url, tries = 6) {
    for (let i = 0; i < tries; i++) {
      const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (res.ok) return res.json();
      if (res.status === 429 || res.status >= 500) {
        console.warn(res.status + ', retrying in ' + 4 * (i + 1) + 's');
        await sleep(4000 * (i + 1));
        continue;
      }
      throw new Error(res.status + ' ' + res.statusText + ' for ' + url);
    }
    throw new Error('Gave up after ' + tries + ' tries: ' + url);
  }

  // 1. List custom matches on this profile, newest first, until past SINCE.
  const listed = new Map();
  let next = null;
  for (let page = 0; page < 500; page++) {
    const qs = new URLSearchParams({ type: 'custom' });
    if (next != null) qs.set('next', String(next));
    const res = await get(API + '/riot/' + encodeURIComponent(PROFILE) + '?' + qs);
    const matches = (res && res.data && res.data.matches) || [];
    let added = 0;
    for (const x of matches) {
      const id = x && x.attributes && x.attributes.id;
      if (id && !listed.has(id)) { listed.set(id, x); added++; }
    }
    next = (res && res.data && res.data.metadata && res.data.metadata.next) ?? null;
    console.log('Listing page ' + (page + 1) + ': ' + listed.size + ' custom matches so far');
    if (next == null || added === 0) break;
    const times = matches.map(listedTime).filter((t) => t != null);
    if (times.length && Math.min(...times) < CUTOFF) break;
    await sleep(DELAY_MS);
  }
  for (const [id, x] of listed) {
    const t = listedTime(x);
    if (t != null && t < CUTOFF) listed.delete(id);
  }

  // 2. Keep standard matches with MIN_ON_TEAM+ roster players on one team and
  //    none on the other (roster on both sides = internal practice).
  const kept = {};
  let failed = 0;
  let i = 0;
  for (const id of listed.keys()) {
    i++;
    let detail;
    try {
      detail = await get(API + '/' + id);
    } catch (e) {
      failed++;
      console.error('Failed ' + id + ': ' + e.message);
      continue;
    }
    const d = detail && detail.data;
    const mode = d && d.metadata && d.metadata.modeKey;
    const started = Date.parse((d && d.metadata && d.metadata.dateStarted) || '');
    const counts = {};
    for (const s of (d && d.segments) || []) {
      if (s.type !== 'player-summary') continue;
      const team = s.metadata && s.metadata.teamId;
      const isRoster = roster.has(key(s.attributes && s.attributes.platformUserIdentifier));
      counts[team] = (counts[team] || 0) + (isRoster ? 1 : 0);
    }
    const n = Object.values(counts);
    const keep =
      mode === 'bomb' && !(started < CUTOFF) && n.length === 2 && n.filter((c) => c > 0).length === 1 && Math.max(...n) >= MIN_ON_TEAM;
    if (keep) kept[id] = detail;
    console.log(i + '/' + listed.size + ' ' + ((d && d.metadata && d.metadata.mapName) || '?') + (keep ? '  ✓ kept' : ''));
    await sleep(DELAY_MS);
  }

  // 3. Download one file for this profile.
  const bundle = {
    source: 'teamtracker-scout',
    team: TEAM,
    profile: PROFILE,
    fetchedAt: new Date().toISOString(),
    roster: ROSTER,
    minOnTeam: MIN_ON_TEAM,
    since: SINCE,
    listedCount: listed.size,
    keptCount: Object.keys(kept).length,
    failedCount: failed,
    matches: kept,
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: 'application/json' }));
  a.download = ('scout-' + TEAM + '-' + PROFILE).replace(/[\\/:*?"<>|#\s]+/g, '_') + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  console.log(
    '%cDone: ' + listed.size + ' custom matches checked, ' + bundle.keptCount + ' kept, ' + failed + ' failed. Upload the downloaded file to TeamTracker.',
    'font-weight:bold;color:#5EA444'
  );
})();
`;

/** The console script for a report's roster, ready to copy. */
export function buildScoutScript(opts: {
  teamName: string;
  tags: string[];
  minPlayers: number;
  since: string;
}): string {
  return SCRIPT_BODY.replace('__TEAM_LABEL__', opts.teamName.replace(/[\r\n]+/g, ' '))
    .replace('__TEAM__', JSON.stringify(opts.teamName))
    .replace('__ROSTER__', JSON.stringify(opts.tags.map(scoutKey)))
    .replace('__MIN__', String(opts.minPlayers))
    .replace('__SINCE__', JSON.stringify(opts.since));
}

/* ------------------------------------------------------------------- uploads */

export type IngestSummary = {
  /** Existing matches plus the new ones. */
  matches: ScoutMatch[];
  added: number;
  /** Already uploaded, but re-read to add data the old copy lacked (heatmap). */
  updated: number;
  duplicates: number;
  /** Matches in the files that don't qualify for this roster. */
  skipped: number;
  /** Per-file problems, e.g. a file that isn't JSON. */
  errors: string[];
};

/** Match responses in an uploaded file: a script bundle ({ matches: { id:
 * response } }) or a single tracker.gg match response. */
function responsesIn(doc: unknown): unknown[] {
  const d = doc as { matches?: unknown; data?: { segments?: unknown } } | null;
  if (d && d.matches && typeof d.matches === 'object') return Object.values(d.matches as object);
  if (d && Array.isArray(d.data?.segments)) return [d];
  return [];
}

function toScoutMatch(response: unknown, rosterKeys: Set<string>): ScoutMatch | null {
  const data = (response as { data?: { attributes?: { id?: unknown }; metadata?: { modeKey?: unknown } } })
    ?.data;
  const id = typeof data?.attributes?.id === 'string' ? data.attributes.id : null;
  if (!id || data?.metadata?.modeKey !== 'bomb') return null;
  let result;
  try {
    result = parseTrackerMatch(response);
  } catch {
    return null;
  }
  if (!result.map || result.rounds.length === 0) return null;

  const count = { Red: 0, Blue: 0 };
  for (const p of result.players) if (rosterKeys.has(scoutKey(p.identifier))) count[p.team] += 1;
  if (count.Red > 0 && count.Blue > 0) return null; // both sides = internal practice
  const team = count.Red >= count.Blue ? 'Red' : 'Blue';
  if (count[team] < MIN_PLAYERS_OPTIONS[0]) return null;

  const teamPlayers = result.players.filter((p) => p.team === team);
  const assignments = Object.fromEntries(teamPlayers.map((p) => [p.identifier, scoutKey(p.identifier)]));
  const { rounds, startingSide } = projectRoundsForTeam(result, team, assignments);

  let heatmap: ScoutMatch['heatmap'];
  if (isHeatmapRawExport(response) && response.data.metadata.mapDetails) {
    const hm = buildHeatmapMatchFromRawExport(response, id);
    heatmap = {
      mapDetails: hm.mapDetails,
      events: hm.events
        .filter((e) => e.team === team)
        .map(({ gameId: _g, team: _t, ...e }) => ({
          ...e,
          // Facing angles only drive the hover arrow; 3 decimals is plenty.
          viewRadians: e.viewRadians === undefined ? undefined : Math.round(e.viewRadians * 1000) / 1000,
          opponentViewRadians:
            e.opponentViewRadians === undefined
              ? undefined
              : Math.round(e.opponentViewRadians * 1000) / 1000,
        })),
    };
  }

  return {
    id,
    map: result.map,
    date: result.date,
    startingSide,
    rounds,
    stats: teamPlayers.map((p) => ({ ...p.stat, playerId: scoutKey(p.identifier) })),
    names: Object.fromEntries(teamPlayers.map((p) => [scoutKey(p.identifier), p.identifier])),
    heatmap,
  };
}

/** Adds the qualifying matches in the uploaded files to `existing`, skipping
 * ones already there (the same match shows up in every player's file). */
export function ingestScoutFiles(
  files: Array<{ name: string; text: string }>,
  tags: string[],
  existing: ScoutMatch[]
): IngestSummary {
  const rosterKeys = new Set(tags.map(scoutKey));
  const byId = new Map(existing.map((m) => [m.id, m]));
  const summary: IngestSummary = {
    matches: [],
    added: 0,
    updated: 0,
    duplicates: 0,
    skipped: 0,
    errors: [],
  };
  for (const file of files) {
    let doc: unknown;
    try {
      doc = JSON.parse(file.text);
    } catch {
      summary.errors.push(`${file.name} isn't valid JSON.`);
      continue;
    }
    const responses = responsesIn(doc);
    if (responses.length === 0) {
      const kept = (doc as { keptCount?: unknown })?.keptCount;
      summary.errors.push(
        kept === 0
          ? `${file.name} has no matches in it — the script found none for this roster on that profile.`
          : `${file.name} isn't a scouting script download or a tracker.gg match.`
      );
      continue;
    }
    for (const response of responses) {
      const match = toScoutMatch(response, rosterKeys);
      if (!match) {
        summary.skipped += 1;
        continue;
      }
      const prior = byId.get(match.id);
      if (prior) {
        if (!prior.heatmap && match.heatmap) {
          byId.set(match.id, match);
          summary.updated += 1;
        } else {
          summary.duplicates += 1;
        }
        continue;
      }
      byId.set(match.id, match);
      summary.added += 1;
    }
  }
  summary.matches = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
  return summary;
}

/* ------------------------------------------------------------------ analysis */

/** Played out to all 24 rounds rather than first to 13 — a scrim format.
 * A regular match ends at 13 (24 rounds only as 13–11) or goes past 24 in OT. */
export function isMR24(m: ScoutMatch): boolean {
  const played = m.rounds.filter((r) => r.result).length;
  if (played !== 24) return false;
  const wins = m.rounds.filter((r) => r.result === 'W').length;
  return wins !== 13 && played - wins !== 13;
}

/** How many of the report's players were on the scouted team. */
export function rosterCount(m: ScoutMatch, tags: string[]): number {
  const keys = new Set(tags.map(scoutKey));
  return m.stats.filter((s) => keys.has(s.playerId)).length;
}

/** The uploaded matches the report's settings let through. */
export function visibleScoutMatches(report: ScoutingReport): ScoutMatch[] {
  const tags = report.tags ?? [];
  const min = report.minPlayers ?? DEFAULT_MIN_PLAYERS;
  const since = scoutSince(report);
  return (report.matches ?? []).filter(
    (m) => m.date >= since && rosterCount(m, tags) >= min && (report.includeMR24 || !isMR24(m))
  );
}

/** Matches as Games, so the team's own stat and round helpers apply. */
export function scoutGames(matches: ScoutMatch[]): Game[] {
  return matches.map((m) => ({
    id: m.id,
    seriesId: '',
    map: m.map,
    date: m.date,
    startingSide: m.startingSide,
    rounds: m.rounds,
    stats: m.stats,
  }));
}

/** Scoreboard rows: the report's players first, then anyone else who played
 * for the team in these matches (shown as subs). Names drop the #tag. */
export function scoutPlayers(report: ScoutingReport, matches: ScoutMatch[]): Player[] {
  const displayById = new Map<string, string>();
  for (const m of matches) for (const [id, name] of Object.entries(m.names)) displayById.set(id, name);
  const label = (riotId: string) => riotId.split('#')[0] || riotId;
  const rosterKeys = new Set<string>();
  const players: Player[] = [];
  for (const tag of report.tags ?? []) {
    const id = scoutKey(tag);
    rosterKeys.add(id);
    players.push({ id, rosterId: report.id, name: label(displayById.get(id) ?? tag), isMainRoster: true });
  }
  for (const [id, riotId] of displayById) {
    if (rosterKeys.has(id)) continue;
    players.push({ id, rosterId: report.id, name: label(riotId), isMainRoster: false });
  }
  return players;
}

export type ScoutSummary = {
  wins: number;
  losses: number;
  /** MR24 matches can end level. */
  draws: number;
  economy: RoundEconomy;
};

export function scoutSummary(games: Game[]): ScoutSummary {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const g of games) {
    const o = gameOutcome(g);
    if (o === 'W') wins += 1;
    else if (o === 'L') losses += 1;
    else draws += 1;
  }
  return { wins, losses, draws, economy: aggregateEconomy(games) };
}

export type ScoutCompPick = { agents: string[]; picks: number; wins: number; losses: number };

export type ScoutMapRow = {
  map: ValorantMap;
  plays: number;
  wins: number;
  losses: number;
  /** Most played 5-agent comp on this map; ties go to the better record. */
  topComp: ScoutCompPick | null;
};

/** One row per map played, most played first. */
export function scoutMapRows(games: Game[]): ScoutMapRow[] {
  const rows: ScoutMapRow[] = [];
  for (const map of MAPS) {
    const onMap = games.filter((g) => g.map === map);
    if (onMap.length === 0) continue;
    const comps = new Map<string, ScoutCompPick>();
    let wins = 0;
    let losses = 0;
    for (const g of onMap) {
      const o = gameOutcome(g);
      if (o === 'W') wins += 1;
      if (o === 'L') losses += 1;
      const agents = g.stats.map((s) => s.agent).filter(Boolean).sort();
      if (agents.length !== 5) continue;
      const key = agents.join('|');
      const c = comps.get(key) ?? { agents, picks: 0, wins: 0, losses: 0 };
      c.picks += 1;
      if (o === 'W') c.wins += 1;
      if (o === 'L') c.losses += 1;
      comps.set(key, c);
    }
    const topComp =
      [...comps.values()].sort(
        (a, b) =>
          b.picks - a.picks ||
          b.wins / b.picks - a.wins / a.picks ||
          a.agents.join().localeCompare(b.agents.join())
      )[0] ?? null;
    rows.push({ map, plays: onMap.length, wins, losses, topComp });
  }
  return rows.sort((a, b) => b.plays - a.plays || a.map.localeCompare(b.map));
}

/** The map this opponent has played most in the counted matches, if any. */
export function favoriteMap(report: ScoutingReport): ValorantMap | null {
  return scoutMapRows(scoutGames(visibleScoutMatches(report)))[0]?.map ?? null;
}

export type CompAbilityRow = {
  playerId: string;
  /** Riot ID without the #tag. */
  name: string;
  agent: string;
  usage: AbilityUsage;
};

/** Each player's ability usage on one 5-agent comp, over the matches where
 * the team ran exactly that comp. One row per player-and-agent pairing, in
 * the comp's agent order. */
export function compAbilityRows(matches: ScoutMatch[], comp: string[]): CompAbilityRow[] {
  const key = [...comp].sort().join('|');
  const groups = new Map<string, { playerId: string; name: string; agent: string; casts: GameStat['abilities'][] }>();
  for (const m of matches) {
    if (m.stats.map((s) => s.agent).sort().join('|') !== key) continue;
    for (const s of m.stats) {
      const id = `${s.playerId}|${s.agent}`;
      const g = groups.get(id) ?? {
        playerId: s.playerId,
        name: (m.names[s.playerId] ?? s.playerId).split('#')[0],
        agent: s.agent,
        casts: [],
      };
      g.casts.push(s.abilities);
      groups.set(id, g);
    }
  }
  const rows: CompAbilityRow[] = [];
  for (const g of groups.values()) {
    const usage = aggregateAbilities(g.casts);
    if (usage) rows.push({ playerId: g.playerId, name: g.name, agent: g.agent, usage });
  }
  const order = new Map(comp.map((a, i) => [a, i]));
  return rows.sort(
    (a, b) => (order.get(a.agent) ?? 99) - (order.get(b.agent) ?? 99) || b.usage.maps - a.usage.maps
  );
}
