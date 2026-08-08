-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssignmentInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "completedAt" DATETIME,
    "reviewedAt" DATETIME,
    "isWorkSample" BOOLEAN NOT NULL DEFAULT false,
    "workSampleNote" TEXT,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssignmentInstance_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "AssignmentSeries" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AssignmentInstance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssignmentInstance_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssignmentInstance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AssignmentInstance" ("completedAt", "createdAt", "createdBy", "details", "dueDate", "id", "isOverride", "isWorkSample", "originalDueDate", "projectId", "requiresReview", "reviewedAt", "rolledCount", "seriesId", "status", "studentId", "subjectId", "title", "updatedAt", "workSampleNote") SELECT "completedAt", "createdAt", "createdBy", "details", "dueDate", "id", "isOverride", "isWorkSample", "originalDueDate", "projectId", "requiresReview", "reviewedAt", "rolledCount", "seriesId", "status", "studentId", "subjectId", "title", "updatedAt", "workSampleNote" FROM "AssignmentInstance";
DROP TABLE "AssignmentInstance";
ALTER TABLE "new_AssignmentInstance" RENAME TO "AssignmentInstance";
CREATE INDEX "AssignmentInstance_studentId_dueDate_idx" ON "AssignmentInstance"("studentId", "dueDate");
CREATE INDEX "AssignmentInstance_seriesId_idx" ON "AssignmentInstance"("seriesId");
CREATE TABLE "new_AssignmentSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssignmentSeries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssignmentSeries_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssignmentSeries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AssignmentSeries" ("createdAt", "createdBy", "details", "endCondition", "endCount", "endDate", "estimatedMinutes", "id", "projectId", "requiresReview", "startDate", "studentId", "subjectId", "title", "updatedAt") SELECT "createdAt", "createdBy", "details", "endCondition", "endCount", "endDate", "estimatedMinutes", "id", "projectId", "requiresReview", "startDate", "studentId", "subjectId", "title", "updatedAt" FROM "AssignmentSeries";
DROP TABLE "AssignmentSeries";
ALTER TABLE "new_AssignmentSeries" RENAME TO "AssignmentSeries";
CREATE INDEX "AssignmentSeries_studentId_idx" ON "AssignmentSeries"("studentId");
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetDate" DATETIME,
    "subjectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("createdAt", "id", "name", "status", "studentId", "subjectId", "targetDate", "updatedAt") SELECT "createdAt", "id", "name", "status", "studentId", "subjectId", "targetDate", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_studentId_idx" ON "Project"("studentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
