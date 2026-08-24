-- CreateTable
CREATE TABLE "FamilyCalendarSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "icsUrl" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "updatedAt" DATETIME NOT NULL
);
