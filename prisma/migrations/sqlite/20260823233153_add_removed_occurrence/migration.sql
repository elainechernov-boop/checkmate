-- CreateTable
CREATE TABLE "RemovedOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    CONSTRAINT "RemovedOccurrence_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "AssignmentSeries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RemovedOccurrence_seriesId_idx" ON "RemovedOccurrence"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "RemovedOccurrence_seriesId_date_key" ON "RemovedOccurrence"("seriesId", "date");
