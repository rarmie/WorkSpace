-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN     "matchScore" INTEGER,
ADD COLUMN     "matchSummary" TEXT,
ADD COLUMN     "matchVerdict" JSONB,
ADD COLUMN     "matchedAt" TIMESTAMP(3);
