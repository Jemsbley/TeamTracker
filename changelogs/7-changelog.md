# Filter fixes, trade stats, and a Players table overhaul

This branch started as a hotfix: the Stats page's date range didn't reach
every view, so a sub who only played in September still showed up, with his
all-time numbers, when filtering to the current month. Fixing that turned into
a sweep of every filtered page.

On top of that:

- **Trade stats.** Four new rates are worked out from the tracker.gg kill
  timeline and shown everywhere stats appear.
- **Players tab overhaul.** Header tooltips, a column picker, clickable Best
  map, map colours, tighter columns and dividers.
- **Scouting heatmap by player.** Click a name on the scoreboard to see only
  that player's engagements.
- **Crosshair hover.** On the Players and Maps tables, the hovered cell, row
  and column highlight.

Version `1.4.0` → `1.4.1` (set by request rather than a minor bump), with a
four-bullet entry at the top of `src/utils/changelog.ts` for the version chip.

---

## Branch base

Branched off `78ee803`, the PR #6 merge on `main`. Nothing is committed yet;
all changes are in the working tree.

---

# Part 1: Filters apply to everything

## The bug

On `main`, the Stats page date range only narrowed the main list of filtered
maps (`filteredGames`). Several views rebuild their numbers from the full
roster list (`scopedGames`) plus the `StatFilters` object, which had no dates.
So the range was silently ignored by:

- the **Overall** scoreboard (`PlayerStatsTable`), for every player, not just
  the sub. Other players looked filtered only because most of their maps were
  from the current month anyway
- **Examine closer** in By series mode
- the series views on **When we win / When we lose**, and their scoreboards

## What changed

- **`StatFilters` gained `startDate` / `endDate`**, checked in `gameMatches`.
  Every caller of `gameMatches`, `collectStats` and `aggregateFor*` now
  respects the range without extra plumbing. `StatsPage` builds the filter
  object with `useMemo` (it was rebuilt every render, which also reset
  Examine closer's slider bounds).
- **The Overall scoreboard reads `filteredGames`** directly instead of relying
  on the filter being re-applied inside it.
- **Scoreboards only list players with at least one game** in what they were
  given. Previously a player with zero games got a row of dashes and sorted
  last.
- **Agents and Maps tabs** applied the date range to the series' date; every
  other page uses each map's own date. Both now filter games by `g.date`. The
  Maps tab's pick/ban counts still go by series date, since a veto belongs to
  the series.
- **Series tab:** the "N series · N games" header count now follows the
  roster filter.
- **The hidden `player` filter** on the Stats page (only set by deep links from
  the Players tab) now always means "only maps this player played". Before, it
  only narrowed the agent-lineup check and did nothing on its own.

Verified by rendering the real `PlayerStatsTable` against local data with a
fake March-only sub: present for "all dates" and "March", absent for "April".

## The deliberate exception

A series' result and score always count all of its maps. Filter to Ascent and
a 2–1 series still shows as 2–1 (and counts toward Series W%) even if only the
Ascent map matched.

---

# Part 2: Trade stats

## Definitions

A kill is **traded** when the victim's team kills the killer within **5
seconds**, in the same round. 5s is tracker.gg's own window.

| Stat | Meaning | Better |
|---|---|---|
| FD traded% | our first deaths a teammate traded | higher |
| FB traded% | our first bloods the enemy traded back | lower |
| Death trade% | our deaths a teammate traded | higher |
| Kill trade% | our kills the enemy traded back | lower |

The Kill trade% and FB traded% readings ("traded back by the enemy") were
chosen over "our kills that were themselves trades".

## How it works

- **`src/utils/trades.ts`** holds the pure logic. `computeTrades(kills, teamOf)`
  walks each round's kills in time order and returns per-player
  `TradeCounts`: kills, deaths, first kills and first deaths, each with a
  traded count. Kills with no killer (spike, falls) and team kills are
  skipped.
- **Shared labels and helpers:** `tradeRates`, `tradeFraction`, `sumTrades`,
  `addTrades`, and `TRADE_STAT_INFO` (labels, short labels, tooltips,
  lower-is-better flags).
- **Tracker imports:** `deriveTrackerPlayers` builds the kill timeline from
  `player-round-kills` segments, and `withTrackerDerived` attaches
  `GameStat.trades` when games load. Like VLR and abilities, it's never
  saved: the server's zod schema strips it. So every existing tracker import
  gets trades with no backfill, and no migration is needed.
- **Scouting:** new uploads store `trades` on each `ScoutMatch` stat line
  (scouting has no `rawJson` to rederive from). Older uploads with heatmap
  data get trades rebuilt from the heatmap's kill and death points in
  `scoutGames`.
- **Team totals:** `RoundEconomy` gained a `trades` field, summed in
  `gameEconomy` / `mergeEconomy`.
- **Per-player and per-team rates:** `Aggregate` gained `fdTradedPct`,
  `fbTradedPct`, `deathTradePct` and `killTradePct`, `NaN` when there's no
  trade data. They're also in `STAT_DEFS`, which feeds Examine closer, Win/Loss
  rankings and series ranking.

## Checked against tracker.gg

Across all 5 local games with a full export (50 player lines), `deathsTraded`
matches tracker's `traded` stat exactly. `firstKills` and `firstDeaths` match
tracker's own counts too.

The heatmap-based scouting fallback matched the full timeline for 49 of 50
player lines. The miss was one kill tracker recorded without a position,
which the heatmap leaves out.

## Where it shows

- **Engagements** (Stats → Overall, series and map pages): a second row with
  all four, including the comparison arrows on map pages.
- **Scoreboards** (`PlayerStatsTable`, used by the Stats tabs, series and map
  pages, and scouting): four columns, `FD Tr%`, `FB Tr%`, `D Tr%` and
  `K Tr%`, with header tooltips. To fit, the table lost its 900px minimum
  width and now sizes to its content, with 4px cell padding, 13px values and
  10px headers.
- **Players tab:** four columns per agent and in the All row.
- **Maps tab:** Kill trade% and Death trade%, plus new team **FB%** / **FD%**
  (first kills / first deaths ÷ rounds played, same definition as the
  Players tab, so the two sum to about 100%). All sortable.
- **Agents tab:** a Trades line on each agent card.
- **Examine closer:** four sliders. **When we win / When we lose:** ranked
  metrics, and the trade stats count toward series ranking (missing values
  rank last). **Progression:** chartable weekly.
- **Scouting reports:** four tiles for the opponent after the round tiles,
  plus the scoreboard columns.

---

# Part 3: Players tab

- **Reset filters** button, like the other pages. It clears map, date range and
  series; roster and player stay, because they're what's being viewed.
- **Header tooltips** on every column except Agent, with a short definition or
  formula.
- **Labels:** Clutch% → **CL%**, Abilities → **Abil** (its "(per round · ult
  per map)" note moved into the tooltip).
- **Best map:**
  - The icon and the "· N games" counter are gone. The name is coloured with
    `MAP_COLORS` in `constants.ts`, a hand-picked pastel per map. Average
    colours of the loading screens were tried first, but came out
    indistinguishable.
  - It's now a link. From an agent's row it opens Stats for that player, agent
    and map; from the All row, for that player and map on any agent. The Agent
    link shares the same `statsLink` builder, and both carry the series and
    date filters.
- **Abilities** render as a compact 2×2 grid (`AbilityUsageStrip` `grid`
  prop, 14px icons).
- **Column picker:** a gear in its own narrow header cell.
  - It lists every column except Agent, in table order, with **Show all**.
  - The menu is `position: fixed`, so the table's scroll container doesn't
    clip it, and it closes on scroll or resize.
  - Hidden columns are stored in `localStorage` (`players-table-hidden-columns`)
    as the *hidden* set, so columns added later show by default. This is a
    deliberate exception to the "view state in the URL" convention: it's a
    personal display preference, not a shareable view.
  - Hiding the column the table is sorted by resets the sort.
- **Density:** no minimum width; cell side padding is 4px, the extra right
  padding on number columns is gone, and header letter spacing is normal. Faint column dividers use the row-divider colour
  (`white/5`).

---

# Part 4: Maps tab

- The raw "(x/y)" counts are gone from every rate cell. They're in each
  cell's hover title instead.
- **Avg VLR** and **Avg ACS** moved between Opp Ban% and Atk Round.
- The same faint column dividers as Players. Number columns' right padding
  dropped from 20px to 16px, and the minimum width is now 1150px (it was 1200px
  before this branch, briefly 1500px).

---

# Part 5: Scouting heatmap by player

- With a map selected, the scoreboard's Player header gets an **Any** button
  and rows with games become clickable. This is opt-in props on
  `PlayerStatsTable`: `onSelectPlayer` and `selectedPlayerId`.
- Picking a player filters the heatmap to events whose `scoutKey(e.player)`
  matches. The choice is URL state (`hplayer`), cleared whenever the map
  changes.

---

# Part 6: Crosshair hover

`src/components/useTableCrosshair.tsx` tracks the hovered cell's section, row
and column index, and emits a scoped `<style>` that tints:

- that row and column: `white` at 2.5%
- the cell itself: `white` at 6%

It's used by the Players and Maps tables. The Maps table's old row-only hover
was removed. Columns are matched by position, so the hook assumes no
colspans.

---

## Verifying

`npm run build` (`tsc -b`) is clean.

Run outside the browser against local data:

- Date-filtered scoreboard rendering with a fake out-of-range sub
  (`renderToString` of `PlayerStatsTable`).
- Trade counts against tracker.gg's `traded`, `firstKills` and `firstDeaths`
  for 5 games and 50 player lines.
- The scouting heatmap fallback against the full timeline (via `vite-node`,
  since `scouting.ts` uses `import.meta.glob`).

**Not verified by clicking.** Worth a pass:

- **Stats → Overall:**
  - Set the date range to this month; an out-of-range sub is gone.
  - The Engagements second row; four new scoreboard columns.
- **Examine closer → By series:** the date range narrows the list.
- **Players tab:**
  - Header tooltips, then the gear: hide columns, reload, Show all.
  - Click a Best map in an agent row and in the All row.
  - Check for horizontal scroll with everything shown.
  - Crosshair hover.
- **Maps tab:**
  - No sideways scroll; hover a cell for its x/y.
  - Sort by FB%; crosshair hover.
- **Agents tab:** the Trades line on a card.
- **Progression:** chart Death trade%.
- **A scouting report:** trade tiles; pick a map, click a player, then Any.
- **Version chip:** reads **v1.4.1**, with four plain bullets.

---

## Deliberately not done

- **Trade filters on Round% and the Heatmap page** (e.g. "only traded
  deaths"). Natural follow-ups, but not asked for.
- **Series results limited to matching maps.** Offered, not taken; series
  outcomes stay whole-series.
- **Hiding subs from Examine closer / Round% player dropdowns** when "Include
  substitutes" is off. Those are inputs, not data.
- **Agent filter on Maps tab pick/ban counts.** Vetoes are series-level.

## Things to flag

- **Trades need a tracker.gg export.** Hand-entered maps show "–" and don't
  count toward the trade stats. The 5s window is fixed in `TRADE_WINDOW_MS`.
- **Older scouting uploads without heatmap data have no trades.** Uploading
  the files again fills them in.
- **No minimum widths on the scoreboard or Players table.** Both size to their
  content with 4px cell padding. The scoreboard needs about 730px (estimated,
  not measured), so When we win/lose stacks its metrics above the scoreboard
  below the `xl` breakpoint. The Players table needs about 1150px with every
  column shown, so it could still scroll below roughly 1280px. Hiding columns
  with the gear fixes that.
- **The Players column choice is per browser.** It's in `localStorage`, so it
  doesn't follow you across devices and isn't in shared links.
- **`MAP_COLORS` needs a new entry** whenever a map is added (TypeScript will
  complain if it's missing).
- **`useTableCrosshair` assumes no colspans or rowspans.** Adding one to
  either table would misalign the column highlight.
