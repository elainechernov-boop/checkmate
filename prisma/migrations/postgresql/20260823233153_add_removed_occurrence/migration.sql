-- The negative-space counterpart to AssignmentInstance: records a series
-- occurrence deliberately deleted ("this assignment only") so the next
-- materialization pass doesn't quietly recreate it.

-- CreateTable
CREATE TABLE "RemovedOccurrence" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemovedOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RemovedOccurrence_seriesId_idx" ON "RemovedOccurrence"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "RemovedOccurrence_seriesId_date_key" ON "RemovedOccurrence"("seriesId", "date");

-- AddForeignKey
ALTER TABLE "RemovedOccurrence" ADD CONSTRAINT "RemovedOccurrence_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "AssignmentSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
