-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plan" TEXT NOT NULL DEFAULT 'beta'
);

-- Seed the one family every existing row's "seed-family" familyId default
-- (see MULTI_FAMILY_SPEC.md) is about to point at — every table below is
-- rebuilt with a FOREIGN KEY to Family("id"), so this row must exist before
-- that happens or every backfilled row ends up with a dangling reference.
INSERT INTO "Family" ("id", "name", "slug", "plan") VALUES ('seed-family', 'Seed Family', 'seed-family', 'beta');

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssignmentInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL DEFAULT 'seed-family',
    "seriesId" TEXT,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT,
    "projectId" TEXT,
    "createdBy" TEXT NOT NULL,
    "dueDate" DATETIME,
    "originalDueDate" DATETIME,
    "rolledCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "isTimeSensitive" BOOLEAN NOT NULL DEFAULT false,
    "scheduledTime" TEXT,
    "reminderMinutesBefore" INTEGER,
    "estimatedMinutes" INTEGER,
    "completedAt" DATETIME,
    "reviewedAt" DATETIME,
    "isWorkSample" BOOLEAN NOT NULL DEFAULT false,
    "workSampleNote" TEXT,
    "returnNote" TEXT,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssignmentInstance_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssignmentInstance_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "AssignmentSeries" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AssignmentInstance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssignmentInstance_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssignmentInstance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AssignmentInstance" ("completedAt", "createdAt", "createdBy", "details", "dueDate", "estimatedMinutes", "id", "isOverride", "isTimeSensitive", "isWorkSample", "originalDueDate", "projectId", "reminderMinutesBefore", "requiresReview", "returnNote", "reviewedAt", "rolledCount", "scheduledTime", "seriesId", "sortOrder", "status", "studentId", "subjectId", "title", "updatedAt", "workSampleNote") SELECT "completedAt", "createdAt", "createdBy", "details", "dueDate", "estimatedMinutes", "id", "isOverride", "isTimeSensitive", "isWorkSample", "originalDueDate", "projectId", "reminderMinutesBefore", "requiresReview", "returnNote", "reviewedAt", "rolledCount", "scheduledTime", "seriesId", "sortOrder", "status", "studentId", "subjectId", "title", "updatedAt", "workSampleNote" FROM "AssignmentInstance";
DROP TABLE "AssignmentInstance";
ALTER TABLE "new_AssignmentInstance" RENAME TO "AssignmentInstance";
CREATE INDEX "AssignmentInstance_familyId_idx" ON "AssignmentInstance"("familyId");
CREATE INDEX "AssignmentInstance_studentId_dueDate_idx" ON "AssignmentInstance"("studentId", "dueDate");
CREATE INDEX "AssignmentInstance_seriesId_idx" ON "AssignmentInstance"("seriesId");
CREATE TABLE "new_AssignmentSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL DEFAULT 'seed-family',
    "title" TEXT NOT NULL,
    "details" TEXT,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT,
    "projectId" TEXT,
    "createdBy" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endCondition" TEXT NOT NULL DEFAULT 'never',
    "endDate" DATETIME,
    "endCount" INTEGER,
    "estimatedMinutes" INTEGER,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "isTimeSensitive" BOOLEAN NOT NULL DEFAULT false,
    "scheduledTime" TEXT,
    "reminderMinutesBefore" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssignmentSeries_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssignmentSeries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssignmentSeries_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssignmentSeries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AssignmentSeries" ("createdAt", "createdBy", "details", "endCondition", "endCount", "endDate", "estimatedMinutes", "id", "isTimeSensitive", "projectId", "reminderMinutesBefore", "requiresReview", "scheduledTime", "startDate", "studentId", "subjectId", "title", "updatedAt") SELECT "createdAt", "createdBy", "details", "endCondition", "endCount", "endDate", "estimatedMinutes", "id", "isTimeSensitive", "projectId", "reminderMinutesBefore", "requiresReview", "scheduledTime", "startDate", "studentId", "subjectId", "title", "updatedAt" FROM "AssignmentSeries";
DROP TABLE "AssignmentSeries";
ALTER TABLE "new_AssignmentSeries" RENAME TO "AssignmentSeries";
CREATE INDEX "AssignmentSeries_familyId_idx" ON "AssignmentSeries"("familyId");
CREATE INDEX "AssignmentSeries_studentId_idx" ON "AssignmentSeries"("studentId");
CREATE TABLE "new_CalendarEventAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL DEFAULT 'seed-family',
    "eventKey" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarEventAssignment_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CalendarEventAssignment" ("createdAt", "eventKey", "id", "studentId") SELECT "createdAt", "eventKey", "id", "studentId" FROM "CalendarEventAssignment";
DROP TABLE "CalendarEventAssignment";
ALTER TABLE "new_CalendarEventAssignment" RENAME TO "CalendarEventAssignment";
CREATE INDEX "CalendarEventAssignment_familyId_idx" ON "CalendarEventAssignment"("familyId");
CREATE INDEX "CalendarEventAssignment_eventKey_idx" ON "CalendarEventAssignment"("eventKey");
CREATE UNIQUE INDEX "CalendarEventAssignment_eventKey_studentId_key" ON "CalendarEventAssignment"("eventKey", "studentId");
CREATE TABLE "new_DaySeparator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL DEFAULT 'seed-family',
    "studentId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DaySeparator_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DaySeparator_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DaySeparator" ("date", "id", "label", "sortOrder", "studentId") SELECT "date", "id", "label", "sortOrder", "studentId" FROM "DaySeparator";
DROP TABLE "DaySeparator";
ALTER TABLE "new_DaySeparator" RENAME TO "DaySeparator";
CREATE INDEX "DaySeparator_familyId_idx" ON "DaySeparator"("familyId");
CREATE INDEX "DaySeparator_studentId_date_idx" ON "DaySeparator"("studentId", "date");
CREATE TABLE "new_DismissedCalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL DEFAULT 'seed-family',
    "eventKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DismissedCalendarEvent_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DismissedCalendarEvent" ("createdAt", "eventKey", "id") SELECT "createdAt", "eventKey", "id" FROM "DismissedCalendarEvent";
DROP TABLE "DismissedCalendarEvent";
ALTER TABLE "new_DismissedCalendarEvent" RENAME TO "DismissedCalendarEvent";
CREATE UNIQUE INDEX "DismissedCalendarEvent_eventKey_key" ON "DismissedCalendarEvent"("eventKey");
CREATE INDEX "DismissedCalendarEvent_familyId_idx" ON "DismissedCalendarEvent"("familyId");
CREATE TABLE "new_FamilyCalendarSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL DEFAULT 'seed-family',
    "icsUrl" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FamilyCalendarSettings_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_FamilyCalendarSettings" ("icsUrl", "id", "timeZone", "updatedAt") SELECT "icsUrl", "id", "timeZone", "updatedAt" FROM "FamilyCalendarSettings";
DROP TABLE "FamilyCalendarSettings";
ALTER TABLE "new_FamilyCalendarSettings" RENAME TO "FamilyCalendarSettings";
CREATE UNIQUE INDEX "FamilyCalendarSettings_familyId_key" ON "FamilyCalendarSettings"("familyId");
CREATE TABLE "new_LearningPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL DEFAULT 'seed-family',
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "hstMeetingDate" DATETIME,
    CONSTRAINT "LearningPeriod_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_LearningPeriod" ("endDate", "hstMeetingDate", "id", "name", "startDate") SELECT "endDate", "hstMeetingDate", "id", "name", "startDate" FROM "LearningPeriod";
DROP TABLE "LearningPeriod";
ALTER TABLE "new_LearningPeriod" RENAME TO "LearningPeriod";
CREATE INDEX "LearningPeriod_familyId_idx" ON "LearningPeriod"("familyId");
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL DEFAULT 'seed-family',
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetDate" DATETIME,
    "subjectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("createdAt", "id", "name", "sortOrder", "status", "studentId", "subjectId", "targetDate", "updatedAt") SELECT "createdAt", "id", "name", "sortOrder", "status", "studentId", "subjectId", "targetDate", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_familyId_idx" ON "Project"("familyId");
CREATE INDEX "Project_studentId_idx" ON "Project"("studentId");
CREATE TABLE "new_ProjectIdea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL DEFAULT 'seed-family',
    "studentId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectIdea_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectIdea_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProjectIdea" ("createdAt", "id", "studentId", "text") SELECT "createdAt", "id", "studentId", "text" FROM "ProjectIdea";
DROP TABLE "ProjectIdea";
ALTER TABLE "new_ProjectIdea" RENAME TO "ProjectIdea";
CREATE INDEX "ProjectIdea_familyId_idx" ON "ProjectIdea"("familyId");
CREATE INDEX "ProjectIdea_studentId_idx" ON "ProjectIdea"("studentId");
CREATE TABLE "new_SchoolDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL DEFAULT 'seed-family',
    "date" DATETIME NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'schoolDay',
    "attendanceClaimed" BOOLEAN NOT NULL DEFAULT false,
    "activityNote" TEXT,
    CONSTRAINT "SchoolDay_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SchoolDay_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SchoolDay" ("activityNote", "attendanceClaimed", "date", "id", "studentId", "type") SELECT "activityNote", "attendanceClaimed", "date", "id", "studentId", "type" FROM "SchoolDay";
DROP TABLE "SchoolDay";
ALTER TABLE "new_SchoolDay" RENAME TO "SchoolDay";
CREATE INDEX "SchoolDay_familyId_idx" ON "SchoolDay"("familyId");
CREATE INDEX "SchoolDay_studentId_idx" ON "SchoolDay"("studentId");
CREATE UNIQUE INDEX "SchoolDay_date_studentId_key" ON "SchoolDay"("date", "studentId");
CREATE TABLE "new_Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL DEFAULT 'seed-family',
    "name" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL,
    CONSTRAINT "Student_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Student" ("accentColor", "gradeLevel", "id", "name") SELECT "accentColor", "gradeLevel", "id", "name" FROM "Student";
DROP TABLE "Student";
ALTER TABLE "new_Student" RENAME TO "Student";
CREATE UNIQUE INDEX "Student_familyId_name_key" ON "Student"("familyId", "name");
CREATE TABLE "new_Subject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL DEFAULT 'seed-family',
    "name" TEXT NOT NULL,
    "workSampleCategory" TEXT NOT NULL DEFAULT 'none',
    "isFaithIntegrated" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Subject_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Subject" ("id", "isFaithIntegrated", "name", "workSampleCategory") SELECT "id", "isFaithIntegrated", "name", "workSampleCategory" FROM "Subject";
DROP TABLE "Subject";
ALTER TABLE "new_Subject" RENAME TO "Subject";
CREATE UNIQUE INDEX "Subject_familyId_name_key" ON "Subject"("familyId", "name");
CREATE TABLE "new_UndoLogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL DEFAULT 'seed-family',
    "actionType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" DATETIME,
    CONSTRAINT "UndoLogEntry_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UndoLogEntry" ("actionType", "createdAt", "id", "payload", "summary", "undoneAt") SELECT "actionType", "createdAt", "id", "payload", "summary", "undoneAt" FROM "UndoLogEntry";
DROP TABLE "UndoLogEntry";
ALTER TABLE "new_UndoLogEntry" RENAME TO "UndoLogEntry";
CREATE INDEX "UndoLogEntry_familyId_idx" ON "UndoLogEntry"("familyId");
CREATE INDEX "UndoLogEntry_createdAt_idx" ON "UndoLogEntry"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Family_slug_key" ON "Family"("slug");
