-- The family's Google Calendar, imported read-only via its "Secret address
-- in iCal format" — a plain unauthenticated feed URL, no OAuth needed.
-- Singleton: at most one row ever exists.

-- CreateTable
CREATE TABLE "FamilyCalendarSettings" (
    "id" TEXT NOT NULL,
    "icsUrl" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyCalendarSettings_pkey" PRIMARY KEY ("id")
);
