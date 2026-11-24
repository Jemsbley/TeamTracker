-- Scouting rework: new reports are built from uploaded tracker.gg matches.
-- Existing reports keep their hand-entered `maps` data (and a null `tags`,
-- which marks them as the original format).
ALTER TABLE "ScoutingReport" ADD COLUMN "tags" JSONB,
ADD COLUMN "includeMR24" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "minPlayers" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "since" TEXT,
ADD COLUMN "matches" JSONB,
ADD COLUMN "notes" TEXT;
