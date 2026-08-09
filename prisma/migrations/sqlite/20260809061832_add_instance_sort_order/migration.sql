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
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
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
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
