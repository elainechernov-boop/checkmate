-- Attendance/work-sample-category/learning-periods/the HST report were all
-- built for one specific charter-school program's requirements
-- (MULTI_FAMILY_SPEC.md Phase 3) — off by default for a new family.

-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "complianceModuleEnabled" BOOLEAN NOT NULL DEFAULT false;

-- The existing production family already relies on this today — the
-- schema default above is for a *new* family created after this
-- migration, not this one.
UPDATE "Family" SET "complianceModuleEnabled" = true WHERE "id" = 'seed-family';
