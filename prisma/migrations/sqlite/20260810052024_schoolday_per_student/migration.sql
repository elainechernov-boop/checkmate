-- SchoolDay becomes per-student: the family-wide academic calendar is now
-- every student getting the same date+type written at once (see
-- schoolCalendar.ts), not a single shared row. Existing rows are duplicated
-- across every current student so no calendar data is lost in the move.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_SchoolDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'schoolDay',
    "attendanceClaimed" BOOLEAN NOT NULL DEFAULT false,
    "activityNote" TEXT,
    CONSTRAINT "SchoolDay_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_SchoolDay" ("id", "date", "studentId", "type", "attendanceClaimed", "activityNote")
SELECT
    'sd_' || lower(hex(randomblob(12))),
    "SchoolDay"."date",
    "Student"."id",
    "SchoolDay"."type",
    "SchoolDay"."attendanceClaimed",
    "SchoolDay"."activityNote"
FROM "SchoolDay"
CROSS JOIN "Student";

DROP TABLE "SchoolDay";
ALTER TABLE "new_SchoolDay" RENAME TO "SchoolDay";
CREATE UNIQUE INDEX "SchoolDay_date_studentId_key" ON "SchoolDay"("date", "studentId");
CREATE INDEX "SchoolDay_studentId_idx" ON "SchoolDay"("studentId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
