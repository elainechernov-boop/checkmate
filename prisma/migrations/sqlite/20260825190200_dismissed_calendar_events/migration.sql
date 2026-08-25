-- CreateTable
CREATE TABLE "DismissedCalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "DismissedCalendarEvent_eventKey_key" ON "DismissedCalendarEvent"("eventKey");
