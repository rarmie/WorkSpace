-- CreateEnum
CREATE TYPE "WorkArrangement" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE');

-- CreateEnum
CREATE TYPE "Seniority" AS ENUM ('INTERN', 'JUNIOR', 'MID', 'SENIOR');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "attributesUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "country" TEXT,
ADD COLUMN     "remoteRegions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "seniority" "Seniority",
ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "workArrangements" "WorkArrangement"[] DEFAULT ARRAY[]::"WorkArrangement"[];
