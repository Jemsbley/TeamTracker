-- CreateTable
CREATE TABLE "AccountInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "acceptedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountInvite_token_key" ON "AccountInvite"("token");

-- CreateIndex
CREATE INDEX "AccountInvite_createdBy_idx" ON "AccountInvite"("createdBy");
