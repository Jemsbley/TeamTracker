# Map pool autofill, plus the import/fill button swap

A small branch with two changes that both make entering a series faster. New
series now start with the map pool from the most recent series already filled
in, and on the series page, **Import from tracker.gg** is now the primary
button.

Version `1.2.0` → `1.2.1`, with a matching entry at the top of
`src/utils/changelog.ts` so the in-app version chip shows it.

---

## Branch base

Branched cleanly off `main` at `8898d8d` (the merge of PR #3). No upstream
merge, no conflicts.

---

# Part 1: Map pool autofill

## What it does

When you add a series from the Series page, its map veto starts with the pool
from the most recent series that has a full pool. You'll see **Pool 7/7** with
those maps already selected. The competitive pool usually changes only one or
two maps at a time, so updating it means deselecting the maps that left and
selecting the ones that came in. You no longer have to pick all seven.

Which series it copies from:

- **Most recent by `date`.** The copy comes from the latest series by its
  date, not by when it was entered.
- **Full pools only.** It only copies pools with all 7 (`POOL_SIZE`) maps, so
  a veto you gave up on halfway won't carry forward.
- **Across all rosters.** The competitive map pool is the same for every
  roster, so a series on another roster counts too.
- **Nothing to copy, nothing seeded.** If no series has a full pool yet, the
  new series is created with no `pickBan`, exactly as before.

The pool is **copied** into the new series when it's created. It isn't a live
reference, so editing one series's pool never changes another's.

## Changes by file

### `src/utils/pickBan.ts`

New `latestMapPool(series)` returns a copy of the pool from the latest-dated
series with a full pool, or `[]` if there isn't one. It's in `utils/` with the
rest of the pick/ban logic, so the page stays presentational.

### `src/pages/SeriesListPage.tsx`

`onAdd` calls `latestMapPool` and, if it returns a pool, passes
`pickBan: { pool, team1: 'us', moves: [] }` into `addSeries`. That is the same
shape `PickBanCard`'s `blankPB()` produces, with the pool filled in, so the veto
card treats it like a veto that was started by hand.

It goes through the existing `addSeries` mutation, so it stays optimistic and
rolls back through `runSync` like any other create. The server's series schema
already accepts `pickBan` as opaque JSON on create
(`server/src/routes/series.ts`), so there are no backend changes.

---

# Part 2: Button swap

## What changed

In each map slot on a series page, the two buttons swapped places and styles:

| Before | After |
|---|---|
| **Fill in stats →** (top, `btn-primary`, red) | **Import from tracker.gg** (top, `btn-primary`, red) |
| **Import from tracker.gg** (bottom, `btn-ghost`, dark) | **Fill in stats →** (bottom, `btn-ghost`, dark) |

Importing is now the usual way to enter a map, so it gets the primary slot. The
only file touched is `src/pages/SeriesDetailPage.tsx`, where the two
`WriteButton`s swapped their `onClick` handlers and labels.

---

## Verifying

`npm run build` (`tsc -b`) is clean.

**Not verified by clicking.** Worth a pass:

- **Series**: add a new series and open it. The map veto should show
  **Pool 7/7** with the previous series's maps selected.
- Deselect a map and select a different one. Then open the *previous* series
  and confirm its pool didn't change.
- On a fresh database, or with no full pools anywhere, a new series should
  still start with an empty veto.
- On any unplayed map slot, **Import from tracker.gg** should be the red
  button on top.
- The version chip should read **v1.2.1** and open the changelog modal.

---

## Deliberately not done

- **Existing series are not backfilled.** Only series created after this
  change get a seeded pool. Older series with an empty veto stay empty.
- **No "current map pool" setting.** The pool comes from past series rather
  than a stored setting, so there's no schema change and no migration. If
  the pool comes from the wrong series too often, a per-account setting would
  be the next step.
- **No seeding of veto moves or side choices.** Only the pool is copied. Bans,
  picks, and sides are specific to each series.

## Things to flag

- **Tie-breaking on the same date is effectively arbitrary.** When two series
  share the latest date, the one later in the store's array wins. The
  `GET /series` query has no `orderBy`, so after a reload that order is
  whatever Postgres returns. It only matters if two same-day series had
  *different* full pools, which is rare, but it's not deterministic.
- **A backdated series can win.** Because it goes by `date` and not by when a
  series was entered, entering an old series with a future date, or
  mistyping a date, makes that series's pool the source until a later-dated
  series exists.
- **Guest mode is unchanged.** `addSeries` doesn't persist in guest mode, so
  the seeding does nothing there, just like any other create.
