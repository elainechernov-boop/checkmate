-- §7 "prioritized" — the student's own drag-order for the Projects band,
-- plain additive column with a default, no backfill needed.

-- AlterTable
ALTER TABLE "Project"
    ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
