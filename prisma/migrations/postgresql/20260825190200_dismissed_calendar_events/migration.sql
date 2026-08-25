-- A dismissed family calendar occurrence (Parent Mode's CalendarEventRow
-- hover-X) — the feed itself is read-only, so "deleting" one just means
-- hiding that one occurrence from the overlay going forward.

-- CreateTable
CREATE TABLE "DismissedCalendarEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DismissedCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DismissedCalendarEvent_eventKey_key" ON "DismissedCalendarEvent"("eventKey");
