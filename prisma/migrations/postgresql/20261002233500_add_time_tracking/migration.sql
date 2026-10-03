-- §15 time tracking: the TimeEntry table (one row per continuous run on a
-- task) plus two additive Family columns. Off by default — a family turns
-- it on in Parent Mode's settings.

-- CreateEnum
CREATE TYPE "TimeEntryEndReason" AS ENUM ('paused', 'finished', 'switched', 'lapsed');

-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "schoolDayStartTime" TEXT,
ADD COLUMN     "timeTrackingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL DEFAULT 'seed-family',
    "studentId" TEXT NOT NULL,
    "instanceId" TEXT,
    "title" TEXT NOT NULL,
    "subjectId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "lastPingAt" TIMESTAMP(3) NOT NULL,
    "endReason" "TimeEntryEndReason",
    "editedByParent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeEntry_familyId_date_idx" ON "TimeEntry"("familyId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_studentId_date_idx" ON "TimeEntry"("studentId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_instanceId_idx" ON "TimeEntry"("instanceId");

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "AssignmentInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
