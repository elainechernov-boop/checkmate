-- §12: time-sensitive assignments (a fixed clock time, e.g. an online
-- class) — plain additive columns, all nullable/defaulted, so no backfill
-- is needed.

-- AlterTable
ALTER TABLE "AssignmentSeries"
    ADD COLUMN "isTimeSensitive" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "scheduledTime" TEXT,
    ADD COLUMN "reminderMinutesBefore" INTEGER;

-- AlterTable
ALTER TABLE "AssignmentInstance"
    ADD COLUMN "isTimeSensitive" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "scheduledTime" TEXT,
    ADD COLUMN "reminderMinutesBefore" INTEGER;
