-- CreateTable
CREATE TABLE "DiscoveredPosting" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "level" TEXT,
    "location" TEXT NOT NULL,
    "isRemote" BOOLEAN NOT NULL,
    "regions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "url" TEXT NOT NULL,
    "requirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "postedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "DiscoveredPosting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveredPosting_source_sourceId_key" ON "DiscoveredPosting"("source", "sourceId");
