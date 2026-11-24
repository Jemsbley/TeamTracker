# Scouting rework, VLR rating, ability usage, and Hush

The headline is a rebuilt **Scouting** report. Instead of hand-entering records,
you paste the opponent's Riot IDs. The report generates a browser script to run
on their tracker.gg pages, and you upload the files it downloads. The report
then fills in their map record, round and pistol rates, comps, a player
scoreboard, a per-map heatmap, and ability usage. A markdown **Notes** section
sits at the bottom. Reports made before this branch keep the old editor.

Alongside that:

- **VLR rating** next to ACS everywhere ACS is shown.
- **Ability usage** (C/Q/E per round, ult per map) on series pages and the
  Players and Agents tabs.
- A fix for tracker.gg matches that report **0 ADR**.
- **Hush** added, and **KAY/O** shown and matched correctly.

Version `1.3.0` → `1.4.0`, with a matching entry at the top of
`src/utils/changelog.ts` so the in-app version chip shows it.

---

## Branch base

Branched off `ff7cfb5`, the PR #5 merge on `main`. The first change on the
branch adds `aiscout/` and `mobile-samples/` to `.gitignore`.

---

# Part 1: VLR rating

## What changed

A **VLR** column (an estimate of vlr.gg's Rating 2.0, credited to Gabraf in
the version chip) now sits to the left of ACS in:

- the player stats table on series pages and the Overall / Win-Loss tabs
- the **Players** tab, including its Best Map cell
- the **Agents** tab cards (agent average and best player)
- the **Maps** tab (new **Avg VLR** column)
- the tracker.gg import preview

The manual stat-entry form is left alone. VLR is also in `STAT_DEFS`, so it
appears in Examine Closer's sliders and the Win/Loss ranked metrics, and it
counts toward their rankings.

## How it works

- `src/utils/vlrRating.ts` is a TypeScript port of `vlr-rating/vlr_rating.js`.
  It reproduces `example_expected.json` for every player to within 1e-6.
- The rating needs the kill feed, so it's worked out from each game's stored
  tracker.gg `rawJson` when games enter the store (`withTrackerDerived` in
  `src/utils/trackerDerived.ts`). The store applies it on load, in the admin
  view, for the guest sample, on state import, and on `addGame` / `updateGame`.
- Stat lines are matched to tracker players by agent on our side, using
  `resolveUsTeam` and `playerIdByAgent`, now exported from `roundPct.ts`.
- `GameStat.vlrRating` is never saved: the server's zod schema strips it. So
  every game imported before this branch gets a rating with no backfill.
- Games entered by hand have no rating. Their aggregate value is `NaN`, which
  renders as "–" and is skipped by averages and rankings.
- Averages are the mean of per-map ratings, the same way ACS is averaged.
  vlr.gg instead pools a series' totals before rating.

---

# Part 2: 0-ADR fix

Some tracker.gg matches report `damage: 0` for every player. That gives 0 ADR,
and a damage delta of just minus damage received, even though the
`player-round-damage` entries are all there. Summing the enemy-only entries
matches tracker's own `damage` exactly on healthy matches. In the
`aiscout` samples, it matched all 180 healthy player-maps; 110 player-maps
were bugged.

- **New imports:** the parser rebuilds ADR and damage delta whenever tracker's
  damage is 0 and the round feed shows otherwise.
- **Old imports:** repaired the same way when games load, but only when the
  stored ADR is 0 or missing, so a hand-entered ADR wins. The database keeps
  the 0 until someone re-saves that map.

---

# Part 3: Ability usage

- **Icons:** C/Q/E/X icons for all 30 agents, from valorant-api.com, in
  `src/assets/abilities/<Agent>/<slot>.png`. Ability names are in
  `AGENT_ABILITIES` in `constants.ts`.
- **Slot mapping:** tracker's `grenadeCasts` is C, `ability1Casts` is Q,
  `ability2Casts` is E, `ultimateCasts` is X. This was spot-checked against
  sample casts: Brimstone's Sky Smoke about 2 a round, Jett's Tailwind once a
  round, Clove's Ruse 85 casts in 30 rounds.
- **Data:** casts come from `rawJson` like VLR, as `GameStat.abilities` (never
  saved).
- **`AbilityUsageStrip`** shows the four icons with C/Q/E per round and the
  ult per map (or the raw count on a single map). Exact counts are in each
  icon's tooltip.
- **Where it shows:**
  - an **Abilities** section under each map card on series pages
  - an **Abilities** column per agent row on the **Players** tab. That table's
    text was shrunk (13px cells, 11px headers) so it fits without side
    scrolling.
  - an average on each **Agents** tab card

---

# Part 4: Hush and KAY/O

- **Hush** is in `AGENTS_BY_CLASS` as a Duelist, matching Riot's data. Her icon
  and abilities are in place, so she appears in every agent picker and filter.
- **KAY/O:** tracker reports the agent as "KAY/O", but the app listed "Kayo",
  so imported KAY/O games showed a "?" icon and no class.
  - The app's name is now **KAY/O**.
  - The new `src/utils/agentName.ts` gives `agentKey()`, a lookup key that
    ignores case and punctuation; icon and ability lookups use it.
  - It also gives `canonicalAgent()`, which every raw tracker read goes
    through: the importer, heatmap, Round%, derived stats and scouting.
  - Stored "Kayo" stat lines and old scouting comps are renamed to KAY/O as
    they load.

---

# Part 5: Scouting rework

## Setup

A new report opens to a form:

- **Opponent Riot IDs:** one box for 5–10 IDs, one per line or
  comma-separated. Names with spaces work.
- **Matches since:** defaults to Sep 1 if today is past it, otherwise Jan 1,
  of the current year.
- **Include MR24:** counts matches played out to all 24 rounds.
- **Minimum players in a match:** 3–5, with a "?" explaining it.
- **Generate script** saves the list and shows:
  - the console script, with a copy button and four steps (including the
    Chrome "allow pasting" note)
  - a link to each player's tracker.gg Customs tab, plus **Open all**, which
    reports how many tabs the pop-up blocker stopped
  - a drop zone for the downloaded files

**The script** (`buildScoutScript` in `src/utils/scouting.ts`) is a
rewrite of `aiscout/playoffs3/download-matches.js`:

- It lists the profile's custom matches newest-first until it passes the date.
- It keeps standard (`bomb`) matches where at least the minimum number of the
  roster are on one team and none are on the other.
- It downloads one bundle per profile.
- It passes `node --check`, but hasn't been run against tracker.gg in this
  branch.

**Uploads** are parsed in the browser down to a `ScoutMatch`: the scouted
team's rounds, five stat lines (with VLR and abilities), Riot IDs, and heatmap
points.

- Matches are deduplicated by tracker match id, since the same match shows up
  in every player's file.
- Re-uploading fills in heatmap data on matches uploaded before heatmaps
  existed, instead of skipping them as duplicates.
- **Roster & data** reopens the form, and **Remove all** clears the uploads.

The date, MR24 and minimum-player settings are applied when the results are
shown, so tightening them needs no re-download.

## Results (top to bottom)

1. **Nine tiles:** map record, attack and defense pistol win %, attack and
   defense round win %, plant %, postplant win %, plant allowed % (green when
   low), retake win %.
2. **Player scoreboard:** the same `PlayerStatsTable` as your own team, fed
   pseudo-Games and pseudo-Players. Non-listed teammates show as subs.
3. **Map record + heatmap**, side by side.
   - The map table takes 40% of the width. Each map's record, win %, and most
     picked comp (with picks and record).
   - Clicking a map filters the whole page to it (URL `map`). **Any** in the
     header is gold when no map is picked; the picked map's name turns gold.
   - The heatmap shows the opponent's kills and deaths on that map, with a
     filter column on the right: Side, Spike (Both/Pre/Post plus A/B/C), Round
     time, and Display (Show points / Just points). The filters are URL state:
     `hside`, `hplant`, `hsites`, `hstart`, `hend`.
   - Both boxes share the table's height, at least ten rows (442px). The map
     scales to the largest square that fits (CSS container queries).
4. **Abilities:** each player's usage on their most picked comp for the
   selected map, counting only matches with exactly that comp.
5. **Notes:** a markdown editor with Write/Preview tabs.
   - It uses `react-markdown` and `remark-gfm`, lazy-loaded, so only report
     pages download them.
   - Raw HTML is never rendered.
   - Saved to a new `notes` column, capped at 200KB.

With no map selected, the heatmap and abilities boxes show blurred filler
(`src/utils/scoutFiller.ts`) under the "Click on a map…" prompt. The
placeholder uses the same `HeatmapView` layout as the real heatmap.

## Data model and old reports

- **`ScoutingReport`** gains `tags`, `includeMR24`, `minPlayers`, `since`,
  `matches` and `notes`.
- **Migration** `20261124000000_scouting_rework` only **adds** columns. The old
  `maps` column stays.
- **Old reports:** a report with no `tags` is in the original format and opens
  in `src/pages/LegacyScoutingReport.tsx`. That's the old editor restored from
  git, with its helpers in `src/utils/legacyScouting.ts` and `RecordStepper`
  kept for it. Every report created from the new form starts with
  `tags: []`, so the split is exact.
- **Guest mode:** the sample reports are filled with generated matches.

## Checked against real data

The five `aiscout/playoffs3` (Ball State) bundles produced:

- the same 16 matches the old Python pipeline kept
- one 18–6 match correctly flagged as MR24
- a record, plant rate (81% vs 82% with the MR24 match), retake rate (35%) and
  pistol count that agree with the old written report
- about 46KB per match with heatmap points
- Haven's top comp (4 of 5 matches) giving sensible ability numbers for all
  five players

---

# Part 6: Smaller pieces

- **Shared components** pulled out of the Heatmap page: `HelpTip` (the "?"
  badge), `Segmented` (pill toggles), and `heatmap/TimelineRange` (the
  two-handle slider). The Heatmap page uses them unchanged.
- **Heatmap tooltip** hides its Series row when there isn't one.
- **Changelog modal:** text wrapped in `{{double braces}}` renders gold. That's
  how "credit Gabraf" is styled.
- **`parseTrackerMatchJson`** now wraps a new `parseTrackerMatch(root)`, which
  takes already-parsed JSON (bundles hold many matches).
- **`scripts/dev.sh`** prints Prisma's output when `db push` fails, instead of
  `npm start` exiting silently.

---

## Verifying

`npm run build` (`tsc -b`) and the server's `tsc` are clean. The Prisma schema
validates, and the local database is in sync via `db push`.

Run outside the browser against real data:

- The VLR port against `example_expected.json`.
- The ADR and damage-delta rebuild against 180 healthy player-maps.
- The parser and the load-time repair on a bugged match.
- Scouting ingest, analysis and comp abilities on the `playoffs3` bundles.

**Not verified by clicking.** Worth a pass:

- **A series page:** VLR before ACS in the stats table, and an Abilities
  section under each imported map.
- **Players tab:** VLR column, VLR in Best Map, and the Abilities column with
  no horizontal scroll.
- **Agents tab:** VLR in each card, and the ability strip. **Maps tab:** Avg
  VLR.
- **Hush** is in an agent picker with the Duelists; **KAY/O** shows its icon.
- **A new scouting report:**
  - Paste five IDs, generate, and try **Open all**.
  - Run the script on one profile and upload the file.
  - Click a map, then try each heatmap filter and the round-time slider.
  - Check that the Abilities section and the blurred placeholders look right.
- **Notes:** write some markdown with a table, preview it, and save.
- **An old scouting report** still opens in the original editor.
- The version chip reads **v1.4.0**, with "credit Gabraf" in gold.

---

## Deliberately not done

- **Claude-generated scouting reports.** Discussed and dropped. As far as I
  know, there's no way for a site to bill a user's Claude.ai subscription, and
  an app-wide API key would cost about $0.50–$1 per report. The Notes section
  takes a pasted write-up instead.
- **First engagement win %** on the Players tab. Built, then removed on
  request.
- **A per-match list on scouting reports.** Proposed and declined.
- **Plant-time clamping on the scouting round-time slider.** The Heatmap page
  narrows the slider to plant times; scouting matches don't store them, so the
  slider is always 0:00–2:30.
- **Pooled series VLR**, vlr.gg's method. Averages are per-map means, like ACS.

## Things to flag

- **Deploying** runs the scouting migration on Railway. It only adds columns,
  so no data is lost.
- **`vlr-rating/` is now tracked.** It's the reference kit the rating code is
  ported from, kept so the port can be re-checked against
  `example_expected.json`. `aiscout/` stays ignored.
- **VLR was fitted on pro matches.** In scrims and lower tiers the lobby
  average won't sit at exactly 1.00.
- **Derived stats need a unique agent per stat line.** If a stat line's agent
  is edited by hand so it no longer matches tracker, that player loses VLR,
  abilities and the ADR repair for that map.
- **Report size:** about 46KB per scouting match, and every report is loaded
  with the app's state. The server's 5MB body limit caps a report at roughly
  100 matches. Scouting matches uploaded before heatmaps existed need their
  files uploaded again to show on the heatmap.
- **The script uses tracker.gg's internal API** (the same one the old
  `aiscout` script used), so it can break without notice. **Open all** depends
  on the browser allowing pop-ups for the site.
- **MR24 is a heuristic:** exactly 24 rounds played with neither team on 13.
  A real 13–11 is never flagged.
- **The 442px minimum height** for the map/heatmap row is ten rows at today's
  row size. It needs updating if the rows change.
- **Bundle size:** the main JS bundle is about 659KB (240KB gzipped). The
  markdown renderer is split out.
