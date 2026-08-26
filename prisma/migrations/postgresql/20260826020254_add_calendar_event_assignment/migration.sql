-- The redesign's durable "this calendar event belongs to this student"
-- relation — an assigned event stays a calendar event (never becomes an
-- AssignmentInstance), disappearing from the shared agenda and rendering
-- under that student's board instead.

-- CreateTable
CREATE TABLE "CalendarEventAssignment" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEventAssignment_eventKey_idx" ON "CalendarEventAssignment"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventAssignment_eventKey_studentId_key" ON "CalendarEventAssignment"("eventKey", "studentId");
