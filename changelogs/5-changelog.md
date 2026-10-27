# Heatmap overhaul, plus the XvX filter and lower-is-better colors

The headline is a rework of the **Heatmap** page. The player, agent, and class
filters now take multiple picks. You can hover any dot to see who was involved,
when it happened, and which way the killer was facing. There's a pre/post-plant
selector with per-site toggles and an **Invert** mode that shows where the
enemy stood, and all the filters now sit in one panel beside the map.

Two smaller changes ride along. The **Round%** tab gets an **XvX** filter for
rounds that reached a given player-count layout (3v3, 2vX, …). Stats where
higher is worse (first deaths, plant allowed %) are now colored the right way.

Version `1.2.1` → `1.3.0`, with a matching entry at the top of
`src/utils/changelog.ts` so the in-app version chip shows it.

---

## Branch base

Branched off `8429223` (the last commit of the map-pool branch) rather than off
`main` after PR #4 merged. `origin/main` was merged in afterwards (`48f2819`).
The only thing it brought in was the PR #4 merge commit, which pointed at that
same commit, so the merge changed no files and had no conflicts.

---

# Part 1: Heatmap overhaul

## What changed

### Multi-select filters

**Player**, **Agent**, and **Agent class** are now dropdowns where you can
check several options, using the new shared `MultiSelect` component. Players
and agents show their agent icon. An empty pick still means "all".

- Agent and class are still **mutually exclusive**: picking any agent clears
  the class picks and vice versa, so the two never combine into an empty set.
- When the map changes, picks that the new map's data doesn't contain are
  dropped individually. Before, the single value was reset.
- The URL params keep their names (`player`, `agent`, `class`) but are now
  comma-separated lists. An old link with a single value still parses as a
  one-item list.

### Hover tooltips on dots

When points are visible (**Show points** or **Just points**), hovering within
8px of a dot selects the nearest one and shows:

- the player's name and agent, and whether the dot is a kill or a death
- the **date** and **series** ("vs. Opponent") of the game it came from
- side, round time, and pre/post-plant (with the site, if planted)
- who they killed or were killed by, with that player's agent icon

The map also draws the other player in the engagement as a **black dot**, with
a dashed line between the two. A white **facing arrow** comes from whoever got
the kill. If that's the hovered dot, the arrow follows the killer's recorded
view angle. If it's the black dot, it points straight at the hovered dot.
tracker.gg only records view angles for the killer, so a victim never gets a
facing arrow of their own.

The tooltip flips to the other side of the cursor in whichever quadrant it
would otherwise run off the map. Hover is off while the dots are hidden.

### Spike filter

The **After spike plant only** checkbox is now a **Both / Pre-plant /
Post-plant** selector (URL `plant`), plus site toggles for the current map
(URL `sites`). Most maps show **A / B**. Haven and Lotus show **A / B / C**,
from the new `MAP_SITES` table in `constants.ts`. A site pick keeps only
events from rounds where the spike was planted on that site. A **?** tooltip
explains this.

The round-time slider now clamps to the plant filter:

- **Pre-plant** caps the slider at the latest plant time in the data.
- **Post-plant** floors it at the earliest plant time.
- Only plants on the selected sites count toward these bounds.

The clamp applies to what's displayed and filtered. The URL values aren't
rewritten, so switching back to **Both** restores the range you had.

### Invert

A new **Invert** checkbox (URL `invert`) moves every dot to where the
**enemy** stood in that engagement, and swaps the player and opponent fields
so the tooltip describes the enemy ("Enemy · Jett · Kill"). Colors keep their
meaning: green is still "we got the kill", so inverted green dots are where
opponents stood when we killed them. Engagements with no recorded opponent
location are dropped.

### Layout

The two filter strips above the map are gone. Everything now sits in one card
beside the map: the kill/death counts (now large), then Player, Agent / Agent
class side by side, Round time, Spike, and Display. On wide screens the map
is capped at 720px or 60% of the width. On narrow screens the panel stacks
below the map.

## Changes by file

### `src/utils/heatmapData.ts`

- `HeatmapEvent` gains `gameId`, `plantSite`, `viewRadians`, and the opponent's
  identity, agent, location, and view angle (`opponent*`).
- `buildHeatmapMatchFromRawExport(raw, gameId)` takes the game id, records the
  plant site per round alongside the plant time, and keeps every plant on the
  match as `plants`. `mergeHeatmapMatches` concatenates them.
- New `invertHeatmapEvents` swaps each event onto its opponent.
- New `viewDirectionUV` projects a world-space yaw into minimap space through
  `gameToImageUV`, so each map's axis swap and sign flips apply without a
  separate rotation.

### `src/components/heatmap/HeatmapCanvas.tsx`

Adds hit-testing on mouse move, the SVG overlay (hover ring, opponent dot,
dashed line, facing arrow), and the `HoverTooltip`. New props:
`playerNames`, `gameInfo`, and `inverted`. The heatmap rendering itself is
unchanged.

### `src/pages/HeatmapPage.tsx`

Moves the filters to multi-value URL state and adds the plant, sites, and
invert params. Adds the timeline clamp, the `HelpTip` badge, and the new
single-panel layout. `TimelineRange` now takes a `min` as well as a `max`.

### `src/components/MultiSelect.tsx` (new)

A generic checkable dropdown for lists that aren't the full agent pool:
options with an optional icon, "Clear" at the top, and an "N players" summary
when several are picked. Also used by the XvX filter in Part 2, which added a
`disabled` prop.

### `src/constants.ts`

`MAP_SITES`: the bomb sites for each map.

---

# Part 2: Round% XvX filter

## What it does

A new **XvX** field at the end of the filters on **Stats → Round%**. It has
two dropdowns (X, 1–5) separated by a "v", and a player picker:

- **3v3**: rounds where, at some point, both teams were down to exactly 3
  alive at the same time.
- **2vX**: rounds where we were down to 2 alive, whatever the enemy count.
- **Xv1**: rounds where the enemy was down to their last player.
- **Players**: every picked player must be alive at that same moment. With
  2vX and two players picked, that means those two were our last alive.

The player picker is capped at our side's number: picking a third player on
2vX drops the oldest pick, and lowering our number trims the list. At XvX the
picker is greyed out, because "these players were alive at some point" would
just match every round they played.

URL params: `rpUs`, `rpThem`, `rpAlive`. **Reset** clears all three.

## How it works

`gameRoundDetail` in `src/utils/roundPct.ts` already parses each game's
tracker.gg response once and caches it. It now also replays each round's kill
feed (the `player-round-kills` segments, sorted by `roundTime`) into a list of
`AliveState`s: our alive count, their alive count, and which of our roster
players were alive. The list starts with the opening layout (normally 5v5) and
adds a new state after each kill.

- Kills that share a timestamp land together, so a same-tick trade doesn't
  record a layout that never existed (5v5 → 4v4, not 5v5 → 4v5 → 4v4).
- Team sizes come from the `player-summary` segments.
- A round matches when **any** of its states matches the pick.

Like the kill, death, assist, and multikill filters, XvX needs tracker.gg
detail, so `needsRoundDetail` includes it. Manually entered maps are skipped
and counted in the "N of M maps were skipped" note.

## Changes by file

- **`src/utils/roundPct.ts`**: new `AliveState` type and
  `RoundDetail.states`. `buildGameDetail` replays the kill feed.
  `RoundPctFilters` gains `aliveUs`, `aliveThem`, and `alivePlayers`, and
  `evaluateRoundPct` applies them.
- **`src/pages/stats/RoundPctTab.tsx`**: the XvX field and its URL state, an
  `AliveSelect` component, the player cap, and reset wiring. The skipped-maps
  note now mentions XvX.
- **`src/components/MultiSelect.tsx`**: the `disabled` prop.

---

# Part 3: Lower-is-better colors

Two places colored a stat as if higher were always better:

- **Player stats table**, on a series page with a comparison baseline. The
  delta under **FD** showed a green ▲ when first deaths went up. The
  table already had `bestIsLow` for FD (used for the best-value highlight). The
  delta now uses it too, so an FD rise is a red ▲ and a drop a green ▼. The
  arrow still shows the direction; only the color reflects good or bad.
- **Round economy panel** (series pages and Overall stats), the **Plant
  allowed** cell. Both the value's
  red-to-green scale and its delta arrow are inverted. A low plant-allowed
  rate now reads green.

The Win/Loss tab's ranked metric list already handled both through
`lowerIsBetter`, so it didn't change. A sweep turned up no other stat colored
the wrong way.

---

# Part 4: CLAUDE.md

- The release convention now says, explicitly, that every user-visible change
  gets a changelog entry without being asked, and spells out how. Bump
  `package.json` once per branch, or extend the top entry if the branch already
  bumped it. Keep the version equal to what the chip shows
  (`CHANGELOG[0].version`). Date the entry the day you last add to it. Write
  the lines for teammates, not developers.
- The end-of-branch write-up now points at `changelogs/<issue>-changelog.md`,
  which is where these have actually been going, instead of `PR.md`.

---

## Verifying

`npm run build` (`tsc -b`) is clean.

**XvX** was checked by running `gameRoundDetail` / `evaluateRoundPct` against
a real imported game in the local database. Every losing round's states ended
at 0vX and every winning round's at Xv0. 5v5 matched all 22 rounds. The 2vX
counts for each pair of players summed to the 2vX total (14).

**Not verified by clicking.** Worth a pass:

- **Heatmap**: pick two players and an agent class. Turn on **Show points**
  and hover a dot. You should see the tooltip, the black opponent dot, the
  dashed line, and a facing arrow on the killer.
- Switch the Spike selector to **Post-plant**. The time slider's left end
  should jump to the earliest plant. Toggle **A**, then switch to Haven and
  check **C** appears.
- Turn on **Invert**. The dots should move, and the tooltip should read
  "Enemy · …".
- **Stats → Round%**: set **2vX**, pick two players, then try picking a third
  (the oldest pick should drop). Set both sides to X and the player picker
  should grey out.
- **A series page** with a comparison baseline (e.g. previous series): a rise
  under **FD** should be red. **Plant allowed** should be green when low, both
  there and on **Stats → Overall**.
- The version chip should read **v1.3.0** and open the changelog modal.

---

## Deliberately not done

- **No XvX on the opponent's specific players.** Only our side can be pinned
  to named players. The opponent's per-round lines are never filtered on,
  which matches the rest of Round%.
- **No XvX for manually entered maps.** The alive counts only exist in
  tracker.gg's kill feed, and the rounds editor has no way to enter them.
- **No facing arrow for victims.** tracker.gg doesn't record their view angle,
  and guessing one from the killer's position would look like data.

## Things to flag

- **Post-round kills can create phantom XvX layouts.** Kills in the few
  seconds after a round is decided (after a detonation or defuse) are in the
  kill feed and get replayed like any other, so a round can briefly show a
  layout it never had while the round was live. It's rare and only adds
  matches, never removes them.
- **Deaths with no killer may be missing.** If tracker.gg leaves fall damage
  or spike deaths out of `player-round-kills`, the replay never sees them, and
  later states overcount the alive players on that team.
- **Disconnects count as alive.** Team size comes from the match's player
  list, so a player who left mid-match still counts toward their side until
  someone kills them.
- **Old heatmap links lose "after plant".** The `afterPlant` URL param was
  replaced by `plant`, so a shared link with `afterPlant=true` now opens on
  **Both**. The other heatmap params are backward compatible.
- **Players the import couldn't match to the roster** count toward our alive
  number but can't be picked in the XvX player filter.
