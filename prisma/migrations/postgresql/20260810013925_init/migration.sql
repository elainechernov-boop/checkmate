-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkSampleCategory" AS ENUM ('math', 'languageArts', 'science', 'socialStudies', 'none');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "CreatedBy" AS ENUM ('parent', 'student');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('daily', 'weekdays', 'weekly', 'biweekly', 'monthly');

-- CreateEnum
CREATE TYPE "EndCondition" AS ENUM ('never', 'onDate', 'afterNCount');

-- CreateEnum
CREATE TYPE "InstanceStatus" AS ENUM ('open', 'pendingReview', 'done', 'excused');

-- CreateEnum
CREATE TYPE "SchoolDayType" AS ENUM ('schoolDay', 'offDay', 'fieldTrip', 'sick', 'holiday');

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workSampleCategory" "WorkSampleCategory" NOT NULL DEFAULT 'none',
    "isFaithIntegrated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3),
    "subjectId" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentSeries" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT,
    "projectId" TEXT,
    "createdBy" "CreatedBy" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endCondition" "EndCondition" NOT NULL DEFAULT 'never',
    "endDate" TIMESTAMP(3),
    "endCount" INTEGER,
    "estimatedMinutes" INTEGER,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurrenceRule" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "frequency" "Frequency" NOT NULL,
    "daysOfWeek" TEXT,
    "interval" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RecurrenceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentInstance" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT,
    "projectId" TEXT,
    "createdBy" "CreatedBy" NOT NULL,
    "dueDate" TIMESTAMP(3),
    "originalDueDate" TIMESTAMP(3),
    "rolledCount" INTEGER NOT NULL DEFAULT 0,
    "status" "InstanceStatus" NOT NULL DEFAULT 'open',
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "isWorkSample" BOOLEAN NOT NULL DEFAULT false,
    "workSampleNote" TEXT,
    "returnNote" TEXT,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolDay" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "SchoolDayType" NOT NULL DEFAULT 'schoolDay',
    "attendanceClaimed" BOOLEAN NOT NULL DEFAULT false,
    "activityNote" TEXT,

    CONSTRAINT "SchoolDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningPeriod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "hstMeetingDate" TIMESTAMP(3),

    CONSTRAINT "LearningPeriod_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSeries" ADD CONSTRAINT "AssignmentSeries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSeries" ADD CONSTRAINT "AssignmentSeries_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSeries" ADD CONSTRAINT "AssignmentSeries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "AssignmentSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentInstance" ADD CONSTRAINT "AssignmentInstance_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "AssignmentSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentInstance" ADD CONSTRAINT "AssignmentInstance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentInstance" ADD CONSTRAINT "AssignmentInstance_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentInstance" ADD CONSTRAINT "AssignmentInstance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

