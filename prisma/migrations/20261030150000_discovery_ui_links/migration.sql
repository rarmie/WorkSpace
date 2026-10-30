-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN     "postingId" TEXT;

-- CreateTable
CREATE TABLE "DismissedPosting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DismissedPosting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DismissedPosting_userId_postingId_key" ON "DismissedPosting"("userId", "postingId");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_userId_postingId_key" ON "JobApplication"("userId", "postingId");

-- AddForeignKey
ALTER TABLE "DismissedPosting" ADD CONSTRAINT "DismissedPosting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DismissedPosting" ADD CONSTRAINT "DismissedPosting_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "DiscoveredPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "DiscoveredPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
