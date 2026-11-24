# VLR Rating 2.0 estimate — implementation kit

An estimate of the vlr.gg player rating (Rating 2.0) for any Valorant match that has a kill feed.
It rebuilds the design VLR published (vlr.gg/160667, vlr.gg/381456), with constants fitted to
vlr.gg's own ratings. It is not VLR's official code.

**Accuracy.** Tested on 470 Champions 2026 player-maps, with each match predicted by a fit that
never saw it: average error 0.017 rating points (about 2% of a typical rating). 96% of player-maps
are within ±0.05 and the largest miss is 0.077. Caveats are at the bottom.

## Files

| File | What it is |
|---|---|
| `vlr_rating.js` | Reference implementation in plain JavaScript (browser or Node), no dependencies |
| `vlr_rating.py` | The same in Python 3.8+, no dependencies |
| `example_match.json` | A small made-up match in the generic input format, with a trade, an eco round, a team kill, a fall and a spike death |
| `example_expected.json` | The correct output for that match (kc, dc, rounds died, rating per player) |

## Quick start

```js
// tracker.gg match file -> ratings for every player
const ratings = VlrRating.rateMatch(VlrRating.fromTracker(trackerJson));
// series rating across several maps (vlr.gg adds the per-map stats, then applies the formula)
const series = VlrRating.seriesRatings(maps.map(VlrRating.fromTracker));
```

```python
from vlr_rating import rate_match, from_tracker
ratings = rate_match(from_tracker(tracker_json))
```

If your app already parses match data into its own objects, skip the adapters and build the
generic format below directly, or port `matchTotals` / `match_totals` (about 50 lines) to your
language.

## Input: the generic match format

```json
{
  "players": [
    {"id": "a1", "team": "A", "rounds": 24, "kills": 18, "assists": 5, "damage": 3400}
  ],
  "rounds": [
    {"number": 1, "loadout": {"A": 4000, "B": 3900},
     "kills": [{"t_ms": 10000, "killer": "a1", "victim": "b1", "spike": false}]}
  ]
}
```

| Field | Meaning |
|---|---|
| `players[].team` | Any team identifier. Exactly two teams. |
| `players[].rounds` | Rounds the player played on this map |
| `players[].kills` | Kills on **enemies** only (no team kills or suicides) |
| `players[].assists` | Assists |
| `players[].damage` | Total damage to **enemies** only (leave out damage to teammates and self) |
| `rounds[].loadout` | Each team's total loadout value at the start of the round (sum of its 5 players), in credits |
| `rounds[].kills` | **Every** death in the round, including falls, suicides, team kills and spike deaths |
| `kills[].t_ms` | Time of the death since the round started, in milliseconds |
| `kills[].killer` | Player id of the killer. For a fall or suicide, the victim's own id (or null). |
| `kills[].spike` | true if the player died to the spike detonation |

### Where the fields come from

**tracker.gg** (`data.segments`): `fromTracker` handles it. Players and their kills, assists and
damage come from `player-summary` (its damage total already excludes team damage). Rounds played
and loadouts come from `player-round` (`loadoutValue`, `teamId`). Deaths come from
`player-round-kills`: `platformUserIdentifier` is the killer, `opponentPlatformUserIdentifier` the
victim, `metadata.roundTime` the time, and `finishingDamage.damageType == "Bomb"` marks a spike
death.

**Riot API (VAL-MATCH-V1) or other sources.** These are untested, so check the field names against
your own data. Riot's match JSON appears to carry the same information: `roundResults[].playerStats[].kills[]`
(with `timeSinceRoundStartMillis`, `killer`, `victim`, `finishingDamage.damageType`),
`playerStats[].economy.loadoutValue` and `players[].teamId` / `stats`. Damage comes from
`playerStats[].damage[]`, where you should sum only the entries whose receiver is an enemy.

## The algorithm

For every map:

1. **Walk each round's deaths in time order**, tracking how many players each team has alive
   (both start at 5). For each death, note the alive counts just before it, `n_k` (killer's team)
   and `n_v` (victim's team). For a fall or suicide, treat the enemy team as the "killer's team".
2. **Skip spike detonation deaths**. They cost nothing, but the player still counts as having
   died that round (step 6).
3. **Team kill** (killer and victim on the same team, different players): add `kappa = 1.0` to
   the killer's death total `dc`. The victim is not charged. Stop here for this death.
4. **Fight weight** for every other death:
   ```
   d   = min(|n_k − n_v|, |n_k − n_v + 1|), capped at 3        distance from an even fight, before or after
   gap = (killer team's round loadout − victim team's) / 1000
   w   = b[d] · exp(−beta · gap)
   ```
   **Trade**: if the killer dies within 3,000 ms after the kill, look at the alive counts after
   the last death in that 3-second window. If the killer's team is not ahead (`killer team ≤
   victim team`), multiply `w` by `tau`.
5. Add `w` to the killer's `kc` (kill contribution) and to the victim's `dc` (death
   contribution). Falls and suicides add to the victim's `dc` only.
6. Count `rounds_died`: the rounds in which the player died for any reason.
7. **Rating** for each player, with `r` = rounds played:
   ```
   rating = a + C1·kc/r − C2·dc/r + C3·assists/r + C4·damage/r + C5·kills/r + C6·(r − rounds_died)/r
   rating = max(rating, 0.01)
   ```

**Series / several maps:** add each player's `rounds`, `kills`, `assists`, `damage`, `kc`, `dc`
and `rounds_died` across the maps, then apply step 7 once. Don't average the per-map ratings.

**Revives:** if a player dies after the game already counted their team as fully dead (a revived
player), set that team's alive count back to 1 before processing the death.

### Constants

| Name | Value | Role |
|---|---|---|
| `a` | 0.4504593877 | intercept |
| `C1` | 0.9461549127 | kill contribution per round |
| `C2` | 0.956890235 | death contribution per round |
| `C3` | 0.2676775021 | assists per round |
| `C4` | 0.0019872721 | damage per round |
| `C5` | 0.1298035295 | kills per round |
| `C6` | 0.4267176739 | share of rounds survived |
| `b` | 1.0, 0.7435459502, 0.5506887977, 0.2272827339 | fight weight for d = 0, 1, 2, 3+ |
| `beta` | 0.0212970312 | economy, per $1000 of loadout advantage |
| `tau` | 0.7231253772 | traded fight multiplier |
| `kappa` | 1.0 | cost of a team kill to the killer |
| trade window | 3000 ms | |

## Checking your implementation

Run your version on `example_match.json` and compare with `example_expected.json`. Every value
should agree to within 0.000001. The example exercises every rule: a trade (round 1), an eco round
(round 2), a team kill (a3 kills a4: a3 gets +1.0 death, a4 gets nothing), a fall (a2), a spike
death (a5: no cost, but it counts as a death for survival) and a 3+ player advantage.

```
python vlr_rating.py example_match.json
```

## Caveats

- Fitted and tested on top-tier pro matches (20 matches, 47 maps). In scrims, ranked or lower
  tiers, the lobby average won't sit exactly at 1.00.
- A kill feed with timestamps is required. Without one, only a rougher scoreboard-only formula is
  possible (error about 0.05).
- The team-kill rule rests on only 5 team kills in the data. The cost of 1.0 is an assumption
  that matched vlr.gg on the one big case.
- VLR's published 2.0 design says survival was removed, but a survival term still improves the
  fit, so it is included. If VLR changes its formula, the constants would need refitting.
