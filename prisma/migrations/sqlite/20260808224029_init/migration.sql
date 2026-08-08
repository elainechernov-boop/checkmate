-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "workSampleCategory" TEXT NOT NULL DEFAULT 'none',
    "isFaithIntegrated" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetDate" DATETIME,
    "subjectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssignmentSeries" (
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
    CONSTRAINT "AssignmentSeries_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AssignmentSeries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecurrenceRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "daysOfWeek" TEXT,
    "interval" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "RecurrenceRule_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "AssignmentSeries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssignmentInstance" (
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
    CONSTRAINT "AssignmentInstance_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AssignmentInstance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchoolDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'schoolDay',
    "attendanceClaimed" BOOLEAN NOT NULL DEFAULT false,
    "activityNote" TEXT
);

-- CreateTable
CREATE TABLE "LearningPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "hstMeetingDate" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_name_key" ON "Student"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");

-- CreateIndex
CREATE INDEX "Project_studentId_idx" ON "Project"("studentId");

-- CreateIndex
CREATE INDEX "AssignmentSeries_studentId_idx" ON "AssignmentSeries"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurrenceRule_seriesId_key" ON "RecurrenceRule"("seriesId");

-- CreateIndex
CREATE INDEX "AssignmentInstance_studentId_dueDate_idx" ON "AssignmentInstance"("studentId", "dueDate");

-- CreateIndex
CREATE INDEX "AssignmentInstance_seriesId_idx" ON "AssignmentInstance"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolDay_date_key" ON "SchoolDay"("date");
