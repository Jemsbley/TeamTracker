# Round% tab, plus the multikill and ban-rate fixes

Three things that happen to ship together. The headline is a new **Round%**
tab on the Stats page — pick a set of round-level circumstances, see what share
of rounds we win under them. Alongside it are two stat corrections that were
the original reason for the branch: tracker.gg imports were counting 2k rounds
as multikills, and Ban% / Opp Ban% on the Maps page were dividing by the wrong
denominator.

Version `1.1.1` → `1.2.0`, with a matching entry at the top of
`src/utils/changelog.ts` so the in-app version chip shows it.

---

## Branch base

Branched cleanly off `main` at `2361e64` (the merge of PR #2). No upstream
merge, no conflicts.

The changelog entry for this release was initially split in two — `1.1.2` for
the stat fixes and `1.2.0` for the tab — then collapsed into a single `1.2.0`
entry, since it's all one merge. `1.1.2` never existed as a shipped version, so
the reference to it in the backfill script's header comment was repointed to
`1.2.0`.

---

# Part 1 — The Round% tab

## What it does

A fifth tab on the Stats page, between **Examine closer** and **Progression**.
It answers questions of the form *"what percentage of rounds do we win when
…"*. Every filter narrows a pool of rounds; the tab reports that pool's win
rate against the win rate of every round in scope.

The filters:

| Filter | Options |
|---|---|
| Side | Both / Attack / Defense |
| First blood / death | Any / First blood / First death, each optionally narrowed to a player, agent, or agent class |
| Maps | Multi-select, any combination |
| Spike plant | Any / Planted / No plant; when Planted, optionally narrowed to sites A, B, C |
| Multikill by | One player, agent, or agent class |
| Got a kill | Any number of players / agents / agent classes |
| Died | Same |
| Got an assist | Same |

"Planted" means *either* side planted, as specified.

It sits underneath the page-level Stats filters (roster, map, date range,
agents, series), so those still scope everything.

## The data problem, and where the numbers come from

This is the part worth reading before touching the code.

`Round` in [`src/types.ts`](../src/types.ts) stores only: `result`,
`firstBlood`, `firstBloodPlayerId`, `firstDeathPlayerId`, `clutch`,
`clutchPlayerId`, `clutchWon`, `planted`, `category`. There is **no per-round
kill/death/assist/multikill data and no plant site** in the domain model.

So the filters split into two groups:

- **Side, first blood/death (with subject), maps, plant yes/no** — answerable
  from `Round[]` alone. These work on every map, including hand-entered ones.
- **Plant site, multikill, kill, death, assist** — not in `Round[]`. These read
  the verbatim tracker.gg response kept in `Game.rawJson`, the same source the
  heatmap page already parses.

I chose to read `rawJson` rather than widen the `Round` type and write a
migration, because:

1. It works **retroactively** on every match already imported, with no
   backfill. Adding fields to `Round` would only populate them going forward.
2. It adds no schema change, no migration, and no new JSON columns.
3. There is precedent — `HeatmapPage` does exactly this via
   `isHeatmapRawExport` / `buildHeatmapMatchFromRawExport`.

The cost: **maps with no tracker.gg import can't satisfy those five filters.**
They're excluded from both numerator and denominator, and the tab says so
underneath the stat row, with a count (`"N of M maps were skipped —"`). The
other filters are unaffected.

If per-round detail ever becomes worth having as first-class data, the
extraction in `roundPct.ts` is the thing to lift into the importer.

## Changes by file

### New: `src/utils/roundPct.ts` (431 lines)

All the logic. Four parts.

**Subjects.** A "who" for a filter — a roster player, a specific agent, or a
whole agent class — encoded as one string (`p:<playerId>`, `a:<Agent>`,
`c:<class>`). One flat token means a subject can live in a URL array and sit in
a single multi-select next to the other two kinds, which is what lets "Died"
accept `[Jett, sentinel, Player3]` in one control.

**Per-round detail extraction.** `gameRoundDetail(game)` turns a stored
tracker.gg response into a `RoundDetail[]` index-aligned with `game.rounds`,
each holding the plant site and our five players' kills/deaths/assists for that
round. Sources: `round-summary.metadata.plant.site` for the site,
`player-round` segments' `kills` / `deaths` / `assists` stats for the rest.
Multikill is `kills >= 3`, consistent with the fix in Part 2.

Two identity problems had to be solved per game:

- **Which tracker team is us?** Primary signal is round-by-round agreement:
  compare each `round-summary`'s `winningTeam` against our `Round.result`. 24
  coin flips don't agree by accident, so a ≥90% match settles it. If too few
  rounds were entered, fall back to which side's agents appear in the game's
  imported stat lines.
- **Which roster player is each tracker identifier?** Matched by agent —
  `Game.stats` carries `(playerId, agent)` and agents are unique within a team
  in a match. This is resolved **per game** from that game's own data, which is
  more accurate than `Player.lastSeenIgn` (the heatmap's approach), since
  `lastSeenIgn` only records the *most recent* import and goes stale as tags
  change.

Results are memoized in a `WeakMap` keyed on the `Game` object. Without it,
every keystroke on a filter would re-parse a ~1 MB blob per game. Game objects
are replaced wholesale by the store on mutation, so they're safe keys.
`buildGameDetail` is only called when a filter actually needs it.

**Filters and evaluation.** `evaluateRoundPct(games, filters)` walks every
played round once and returns the overall tally, the unfiltered baseline, an
Attack/Defense split, a per-map breakdown, and the list of matching rounds per
game.

**Multi-select semantics are AND.** Picking `[duelist, sentinel]` under "Died"
means *a duelist died **and** a sentinel died in that round*, not either. This
matches how every other filter in the app composes, and it's stated in the
card's subtitle. It was a genuine fork in the road — worth knowing it was a
decision and not an accident.

### New: `src/components/SubjectPicker.tsx` (205 lines)

The player / agent / agent-class dropdown, in single- and multi-select modes.
Modeled on `MultiAgentPicker` — same outside-click and Escape handling, same
right-edge viewport nudge, same `input`-classed trigger — with a five-column
body: Players and Roles in the first column, then the four agent classes.

Selections are named inline in the trigger button (`"Jett, Sage"`, truncated to
one line, full list on hover) rather than listed as chips underneath, so the
control is always exactly one row tall.

Takes a `disabled` prop, which greys it out and prevents it opening.

### New: `src/pages/stats/RoundPctTab.tsx` (508 lines)

The tab. Laid out like Examine closer: a filter `card` on top, then results —
a `stat-grid` headline (Round W%, baseline, delta in points, Attack, Defense),
a per-map bar breakdown, and a list of matching maps with the specific round
numbers that matched.

All ten filters are URL state via `nuqs` (`rpSide`, `rpFirst`, `rpFirstWho`,
`rpMaps`, `rpPlant`, `rpSites`, `rpMk`, `rpKills`, `rpDeaths`, `rpAssists`), so
a configured view is shareable and survives a reload.

**The filter card never changes shape.** Controls that aren't valid yet — the
first blood/death subject picker, the A/B/C site buttons — are always rendered
and greyed out rather than mounted conditionally, with a tooltip saying what
enables them. Inert selections are preserved: set sites, flip to Any, flip back
to Planted, and your sites are still there. The normalization is also applied
to the filter object, so an inert value in the URL never silently filters
anything.

### `src/pages/StatsPage.tsx`

Tab registered as `roundpct` between `examine` and `progression`; the tab's
props are the already-computed `rosterScopedPlayers`, `rosterScopedSeries`, and
`filteredGames`.

---

# Part 2 — The multikill fix

## The bug

`parseTrackerMatchJson` computed a player's multikills as:

```ts
num(seg, 'doubleKills') + num(seg, 'tripleKills') +
num(seg, 'quadraKills') + num(seg, 'pentaKills')
```

Tracker buckets a player's rounds by **exact** kill count, so `doubleKills` is
"rounds with exactly 2 kills". A 2k is not a multikill, so every 2k round was
inflating the number — and 2k rounds are common, so the MK column was roughly
double what it should have been.

## The fix

`src/utils/trackerImport.ts` now prefers tracker's own `multiKills` stat, which
already means 3k+, and falls back to summing only the 3k/4k/5k buckets when
that stat is absent:

```ts
const multikills =
  optNum(seg, 'multiKills') ??
  num(seg, 'tripleKills') + num(seg, 'quadraKills') + num(seg, 'pentaKills');
```

This needed a `num` that can report "absent" rather than coercing to `0`, since
`0` is a legitimate `multiKills` value and would otherwise be indistinguishable
from a missing stat. `num` was split into `optNum` (returns `undefined`) and
`num` (`optNum(…) ?? 0`), with every existing call site keeping the old
behavior.

## New: `server/src/scripts/backfillMultikills.ts` (245 lines)

The fix only helps future imports. Games already in the database carry the
inflated number — but they also keep the tracker response verbatim in
`rawJson`, so the correct value can be recomputed without re-collecting
anything.

The awkward part: **stored stat rows don't record which tracker player they
came from.** There's a `playerId` (ours) but no tracker identifier. So the
script fingerprints each stored row against the `player-summary` segments by
its full stat line — agent, ACS, HS%, K/D/A, damage delta, ADR, KAST, FK, FD,
everything except the field being corrected. A row matching exactly one segment
is fixed; anything ambiguous is left alone and reported:

- **no matching tracker player** — the row was hand-edited after import, so its
  stat line no longer matches anything. Not safe to touch.
- **matches multiple tracker players** — the fingerprint didn't disambiguate.
- **ties with another row** — two stored rows resolved to the same tracker
  player, so both are dropped rather than guessed at.

`adr` is skipped in the comparison when absent, since games imported before
that field existed don't have it.

Mirrors the number-reading helpers from `trackerImport.ts` deliberately, so the
values it derives are byte-for-byte what the importer would have written.

**Dry run by default.** Registered as a script in `server/package.json`:

```bash
cd server && npm run backfill:multikills            # preview
cd server && npm run backfill:multikills -- --apply # write
```

It prints a per-game list of every change and every skip, then a summary. Run
the preview first and read the skip list — anything skipped needs fixing by
hand or leaving alone deliberately.

---

# Part 3 — The ban-rate fix

## The bug

Ban% and Opp Ban% on the Maps page were *"this map's bans ÷ that team's total
bans"*. Because the denominator was the total number of ban **moves**, the
column summed to 100% across all maps by construction, and the number answered
a question nobody asks. In a BO3 each team bans twice, so a map banned in every
single series showed as ~50%.

## The fix

Both are now **the share of series in which the map was banned**: *"series
where we banned this map ÷ all series with recorded bans by us"*. A map banned
in every series now reads 100%, which is what the column looks like it means.

In `src/utils/mapStats.ts`, `ourBanTotal` / `enemyBanTotal` (counting moves)
became `ourBanSeriesTotal` / `enemyBanSeriesTotal` (counting series), tracked
with a per-series `sawOurBan` / `sawEnemyBan` flag rather than incrementing per
move. The per-map numerators (`ourBanCount`, `enemyBanCount`) are unchanged —
a team can't ban the same map twice in one series, so they were already
series counts.

`src/pages/MapsPage.tsx` is renames plus the new denominators, in the table
cells and in the sort comparators for the `banRate` / `oppBanRate` columns —
the sort was using the same wrong denominator, so column ordering was also
subtly wrong. The footnote under the table was reworded to describe the new
definition.

---

## Verifying

`npm run build` (`tsc -b`) is clean.

**The Round% extraction was checked against real data.** The four tracker.gg
match exports that used to live in `public/samples/havens` were pulled back out
of git history (`1146516^`) and run through `gameRoundDetail`, for **both**
possible "us" team assignments in each — eight cases. In every one:

- the us-team resolver picked the right side
- per-round kills/deaths/assists summed **exactly** to each player's summary
  stat line
- 3k+ round counts matched tracker's own `multiKills`
- every planted round produced a site
- every tracker identifier resolved back to a roster player

The filter math is self-consistent on the same data: Attack + Defense,
Planted + No-plant, sites A + B + C, and First-blood + First-death each sum to
the full round count; a map with `rawJson` stripped is correctly skipped by a
kill filter while still being counted by the plant filter.

**Not verified by clicking.** I had no browser automation available in this
session and the app is behind Google OAuth, so the UI has not been exercised by
hand. Worth a pass:

- **Stats → Round%** — try Defense + Planted + site C, then add a duelist under
  *Died* and watch the skipped-maps note appear
- Confirm the filter card doesn't change height as you select things
- Copy the URL into a new tab and check the filters come back
- **Maps** — Ban% / Opp Ban% should now read much higher, and sorting by those
  columns should match the displayed order
- The version chip should read **v1.2.0** and open the changelog modal

And the backfill, which touches the database:

```bash
cd server && npm run backfill:multikills
```

Read the skip list before running it with `--apply`.

---

## Deliberately not done

- **No change to `Round` or `schema.prisma`.** Per-round kills/deaths/assists
  and plant site are read from `rawJson` rather than persisted. No migration in
  this PR.
- **No backfill of per-round detail into the domain model.** If the `rawJson`
  dependency ever becomes a problem, the extraction in `roundPct.ts` is what
  you'd move into the importer.
- **Opponent-side round detail is parsed but discarded.** `buildGameDetail`
  only keeps our team's actors. Filtering on what the *enemy* did in a round
  (their multikills, their deaths) would be a small change to that function and
  a bigger one to the UI.
- **No ANY/ALL toggle on the multi-selects.** They're AND-only. If "any of
  these players died" turns out to be the more useful question, that's a
  per-field toggle.
- **Results sections still mount conditionally.** The skipped-maps note and the
  by-map breakdown appear and disappear with the data. Only the *filter card*
  was made fixed-shape.

## Things to flag

- **The AND semantics on Died / Got a kill / Got an assist are a real design
  choice**, and the one most likely to surprise. Selecting two agents under
  "Died" narrows to rounds where *both* died, which can collapse to very few
  rounds fast. The subtitle says so, but small denominators are easy to
  over-read.
- **Small-sample percentages have no guard.** A filter combination matching 3
  rounds will happily display "67%". There's no minimum-N warning and no
  greying of thin cells; the `wins/total` fraction under each number is the
  only cue. Worth adding if this tab gets used for real decisions.
- **The us-team resolver can return null**, in which case the game is treated
  as having no detail and is skipped. That needs both too few entered rounds
  (<5) *and* an even agent-overlap split between the two sides — effectively a
  mirror comp on a barely-entered map. Unlikely, but it fails closed rather
  than guessing.
- **The backfill's fingerprint matching will skip hand-edited stat rows.** If
  anyone has manually corrected a stat line after importing, that row won't
  match its tracker segment and keeps its inflated MK. The script reports each
  one — those need doing by hand.
- **Ban% is not comparable to previously-screenshotted numbers.** The
  definition changed, so every historical Ban% / Opp Ban% figure means
  something different now. Nothing is stored, so there's nothing to migrate,
  but don't compare old notes against the new column.
