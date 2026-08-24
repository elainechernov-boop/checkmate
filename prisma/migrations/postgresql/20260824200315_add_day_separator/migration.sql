-- A parent-placed "Morning / Afternoon / Evening" divider within one day's
-- column (§6). Shares the AssignmentInstance sortOrder numbering space for
-- that day so the two interleave into one ordered list.

-- CreateEnum
CREATE TYPE "DaySeparatorLabel" AS ENUM ('morning', 'afternoon', 'evening');

-- CreateTable
CREATE TABLE "DaySeparator" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "label" "DaySeparatorLabel" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DaySeparator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DaySeparator_studentId_date_idx" ON "DaySeparator"("studentId", "date");

-- AddForeignKey
ALTER TABLE "DaySeparator" ADD CONSTRAINT "DaySeparator_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
