/*
  Warnings:

  - You are about to drop the column `matchVerdict` on the `JobApplication` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "JobApplication" RENAME COLUMN "matchVerdict" TO "matchVerdicts";
