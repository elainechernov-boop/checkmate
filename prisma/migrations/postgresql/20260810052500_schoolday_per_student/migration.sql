-- SchoolDay becomes per-student: the family-wide academic calendar is now
-- every student getting the same date+type written at once (see
-- schoolCalendar.ts), not a single shared row. Existing rows are duplicated
-- across every current student so no calendar data is lost in the move.

-- AddColumn (nullable for now — filled in by the backfill below)
ALTER TABLE "SchoolDay" ADD COLUMN "studentId" TEXT;

-- DropIndex (was unique on date alone) — must happen before the backfill
-- below, which deliberately inserts more than one row per date (one per
-- student); leaving this in place until "after" the insert, as an earlier
-- version of this migration did, makes every backfill after the first
-- student fail with a duplicate-key error.
DROP INDEX "SchoolDay_date_key";

-- Backfill: one row per (existing SchoolDay row x Student)
INSERT INTO "SchoolDay" ("id", "date", "studentId", "type", "attendanceClaimed", "activityNote")
SELECT
    'sd_' || replace(gen_random_uuid()::text, '-', ''),
    "SchoolDay"."date",
    "Student"."id",
    "SchoolDay"."type",
    "SchoolDay"."attendanceClaimed",
    "SchoolDay"."activityNote"
FROM "SchoolDay"
CROSS JOIN "Student";

-- Drop the original, pre-backfill rows (studentId still null on those).
DELETE FROM "SchoolDay" WHERE "studentId" IS NULL;

-- Now safe to require it.
ALTER TABLE "SchoolDay" ALTER COLUMN "studentId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "SchoolDay" ADD CONSTRAINT "SchoolDay_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "SchoolDay_date_studentId_key" ON "SchoolDay"("date", "studentId");
CREATE INDEX "SchoolDay_studentId_idx" ON "SchoolDay"("studentId");
