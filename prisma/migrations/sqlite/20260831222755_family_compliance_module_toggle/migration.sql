-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Family" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plan" TEXT NOT NULL DEFAULT 'beta',
    "accessCodeHash" TEXT,
    "parentPasscodeHash" TEXT,
    "complianceModuleEnabled" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Family" ("accessCodeHash", "createdAt", "id", "name", "parentPasscodeHash", "plan", "slug") SELECT "accessCodeHash", "createdAt", "id", "name", "parentPasscodeHash", "plan", "slug" FROM "Family";
DROP TABLE "Family";
ALTER TABLE "new_Family" RENAME TO "Family";
CREATE UNIQUE INDEX "Family_slug_key" ON "Family"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- The existing production family already relies on attendance/work-sample
-- categories/learning periods/the HST report today — the schema default
-- above is for a *new* family created after this migration, not this one.
UPDATE "Family" SET "complianceModuleEnabled" = true WHERE "id" = 'seed-family';
