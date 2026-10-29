-- CreateEnum
CREATE TYPE "ApplicationSource" AS ENUM ('LINKEDIN', 'INDEED', 'JOBSTREET', 'COMPANY_SITE', 'REFERRAL', 'OTHER');

-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN     "nextAction" TEXT,
ADD COLUMN     "nextActionAt" TIMESTAMP(3),
ADD COLUMN     "source" "ApplicationSource";
