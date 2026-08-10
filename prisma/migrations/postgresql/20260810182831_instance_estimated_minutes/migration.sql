-- Gives AssignmentInstance its own estimatedMinutes, mirroring the series'
-- own field (§3) — plain additive nullable column, no backfill needed.

-- AlterTable
ALTER TABLE "AssignmentInstance"
    ADD COLUMN "estimatedMinutes" INTEGER;
