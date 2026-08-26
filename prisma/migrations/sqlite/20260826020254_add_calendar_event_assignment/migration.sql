-- CreateTable
CREATE TABLE "CalendarEventAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventKey" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CalendarEventAssignment_eventKey_idx" ON "CalendarEventAssignment"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventAssignment_eventKey_studentId_key" ON "CalendarEventAssignment"("eventKey", "studentId");
