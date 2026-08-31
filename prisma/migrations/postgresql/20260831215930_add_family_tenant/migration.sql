-- A tenant — one homeschooling family (see MULTI_FAMILY_SPEC.md). Every
-- family-owned table below gets a familyId defaulting to 'seed-family' —
-- the one row this migration seeds for the existing production family —
-- purely so every existing insert across the app keeps working unchanged
-- until real per-family login and scoping lands and that default is
-- dropped in favor of every write passing its own family's id explicitly.

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plan" TEXT NOT NULL DEFAULT 'beta',

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Family_slug_key" ON "Family"("slug");

-- Seed the one family every "seed-family" default below points at — this
-- must exist before any column's FOREIGN KEY constraint is added.
INSERT INTO "Family" ("id", "name", "slug", "plan") VALUES ('seed-family', 'Seed Family', 'seed-family', 'beta');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "familyId" TEXT NOT NULL DEFAULT 'seed-family';
ALTER TABLE "Subject" ADD COLUMN "familyId" TEXT NOT NULL DEFAULT 'seed-family';
ALTER TABLE "Project" ADD COLUMN "familyId" TEXT NOT NULL DEFAULT 'seed-family';
ALTER TABLE "ProjectIdea" ADD COLUMN "familyId" TEXT NOT NULL DEFAULT 'seed-family';
ALTER TABLE "AssignmentSeries" ADD COLUMN "familyId" TEXT NOT NULL DEFAULT 'seed-family';
ALTER TABLE "AssignmentInstance" ADD COLUMN "familyId" TEXT NOT NULL DEFAULT 'seed-family';
ALTER TABLE "SchoolDay" ADD COLUMN "familyId" TEXT NOT NULL DEFAULT 'seed-family';
ALTER TABLE "LearningPeriod" ADD COLUMN "familyId" TEXT NOT NULL DEFAULT 'seed-family';
ALTER TABLE "DaySeparator" ADD COLUMN "familyId" TEXT NOT NULL DEFAULT 'seed-family';
ALTER TABLE "FamilyCalendarSettings" ADD COLUMN "familyId" TEXT NOT NULL DEFAULT 'seed-family';
ALTER TABLE "DismissedCalendarEvent" ADD COLUMN "familyId" TEXT NOT NULL DEFAULT 'seed-family';
ALTER TABLE "CalendarEventAssignment" ADD COLUMN "familyId" TEXT NOT NULL DEFAULT 'seed-family';
ALTER TABLE "UndoLogEntry" ADD COLUMN "familyId" TEXT NOT NULL DEFAULT 'seed-family';

-- DropIndex (global uniqueness is replaced by per-family uniqueness below)
DROP INDEX "Student_name_key";
DROP INDEX "Subject_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "Student_familyId_name_key" ON "Student"("familyId", "name");
CREATE UNIQUE INDEX "Subject_familyId_name_key" ON "Subject"("familyId", "name");
CREATE UNIQUE INDEX "FamilyCalendarSettings_familyId_key" ON "FamilyCalendarSettings"("familyId");

CREATE INDEX "Project_familyId_idx" ON "Project"("familyId");
CREATE INDEX "ProjectIdea_familyId_idx" ON "ProjectIdea"("familyId");
CREATE INDEX "AssignmentSeries_familyId_idx" ON "AssignmentSeries"("familyId");
CREATE INDEX "AssignmentInstance_familyId_idx" ON "AssignmentInstance"("familyId");
CREATE INDEX "SchoolDay_familyId_idx" ON "SchoolDay"("familyId");
CREATE INDEX "LearningPeriod_familyId_idx" ON "LearningPeriod"("familyId");
CREATE INDEX "DaySeparator_familyId_idx" ON "DaySeparator"("familyId");
CREATE INDEX "DismissedCalendarEvent_familyId_idx" ON "DismissedCalendarEvent"("familyId");
CREATE INDEX "CalendarEventAssignment_familyId_idx" ON "CalendarEventAssignment"("familyId");
CREATE INDEX "UndoLogEntry_familyId_idx" ON "UndoLogEntry"("familyId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectIdea" ADD CONSTRAINT "ProjectIdea_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentSeries" ADD CONSTRAINT "AssignmentSeries_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentInstance" ADD CONSTRAINT "AssignmentInstance_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolDay" ADD CONSTRAINT "SchoolDay_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningPeriod" ADD CONSTRAINT "LearningPeriod_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DaySeparator" ADD CONSTRAINT "DaySeparator_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FamilyCalendarSettings" ADD CONSTRAINT "FamilyCalendarSettings_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DismissedCalendarEvent" ADD CONSTRAINT "DismissedCalendarEvent_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CalendarEventAssignment" ADD CONSTRAINT "CalendarEventAssignment_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UndoLogEntry" ADD CONSTRAINT "UndoLogEntry_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
