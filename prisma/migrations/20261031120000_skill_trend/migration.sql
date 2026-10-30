-- CreateTable
CREATE TABLE "SkillTrend" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "skill" TEXT NOT NULL,
    "postings" INTEGER NOT NULL,
    "totalPostings" INTEGER NOT NULL,

    CONSTRAINT "SkillTrend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SkillTrend_weekStart_skill_key" ON "SkillTrend"("weekStart", "skill");

