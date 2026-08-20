-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "seriesId" TEXT NOT NULL,
    "map" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "order" INTEGER,
    "scoreFor" INTEGER,
    "scoreAgainst" INTEGER,
    "startingSide" TEXT,
    "rounds" JSONB,
    "stats" JSONB NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "rosterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isMainRoster" BOOLEAN NOT NULL,
    "linkedUserId" TEXT,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roster" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "Roster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "createdBy" TEXT NOT NULL,
    "acceptedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterMembership" (
    "rosterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterMembership_pkey" PRIMARY KEY ("rosterId","userId")
);

-- CreateTable
CREATE TABLE "ScoutingReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "teamName" TEXT NOT NULL,
    "note" TEXT,
    "maps" JSONB,
    "rosterId" TEXT,
    "createdAt" TEXT,

    CONSTRAINT "ScoutingReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "rosterId" TEXT NOT NULL,
    "opponent" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "format" TEXT,
    "pickBan" JSONB,
    "videos" JSONB,
    "vodReviews" JSONB,
    "notes" TEXT,
    "scoutingReportId" TEXT,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountType" TEXT NOT NULL DEFAULT 'user',
    "googleId" TEXT,
    "username" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Game_seriesId_idx" ON "Game"("seriesId" ASC);

-- CreateIndex
CREATE INDEX "Game_userId_idx" ON "Game"("userId" ASC);

-- CreateIndex
CREATE INDEX "Player_rosterId_idx" ON "Player"("rosterId" ASC);

-- CreateIndex
CREATE INDEX "Player_userId_idx" ON "Player"("userId" ASC);

-- CreateIndex
CREATE INDEX "Roster_userId_idx" ON "Roster"("userId" ASC);

-- CreateIndex
CREATE INDEX "RosterInvite_rosterId_idx" ON "RosterInvite"("rosterId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RosterInvite_token_key" ON "RosterInvite"("token" ASC);

-- CreateIndex
CREATE INDEX "RosterMembership_rosterId_idx" ON "RosterMembership"("rosterId" ASC);

-- CreateIndex
CREATE INDEX "RosterMembership_userId_idx" ON "RosterMembership"("userId" ASC);

-- CreateIndex
CREATE INDEX "ScoutingReport_rosterId_idx" ON "ScoutingReport"("rosterId" ASC);

-- CreateIndex
CREATE INDEX "ScoutingReport_userId_idx" ON "ScoutingReport"("userId" ASC);

-- CreateIndex
CREATE INDEX "Series_rosterId_idx" ON "Series"("rosterId" ASC);

-- CreateIndex
CREATE INDEX "Series_userId_idx" ON "Series"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId" ASC);

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "Roster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roster" ADD CONSTRAINT "Roster_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterInvite" ADD CONSTRAINT "RosterInvite_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "Roster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterMembership" ADD CONSTRAINT "RosterMembership_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "Roster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterMembership" ADD CONSTRAINT "RosterMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutingReport" ADD CONSTRAINT "ScoutingReport_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "Roster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutingReport" ADD CONSTRAINT "ScoutingReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Series" ADD CONSTRAINT "Series_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "Roster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Series" ADD CONSTRAINT "Series_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

