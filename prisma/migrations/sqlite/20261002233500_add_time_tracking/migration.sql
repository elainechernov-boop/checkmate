-- §15 time tracking: the TimeEntry table (one row per continuous run on a
-- task) plus two additive Family columns. Plain ADD COLUMNs rather than a
-- table redefine — nothing needs backfilling, and the family gate's FK
-- references into Family stay untouched.

-- AlterTable
ALTER TABLE "Family" ADD COLUMN "timeTrackingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Family" ADD COLUMN "schoolDayStartTime" TEXT;

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL DEFAULT 'seed-family',
    "studentId" TEXT NOT NULL,
    "instanceId" TEXT,
    "title" TEXT NOT NULL,
    "subjectId" TEXT,
    "date" DATETIME NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "lastPingAt" DATETIME NOT NULL,
    "endReason" TEXT,
    "editedByParent" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "TimeEntry_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "AssignmentInstance" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TimeEntry_familyId_date_idx" ON "TimeEntry"("familyId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_studentId_date_idx" ON "TimeEntry"("studentId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_instanceId_idx" ON "TimeEntry"("instanceId");
