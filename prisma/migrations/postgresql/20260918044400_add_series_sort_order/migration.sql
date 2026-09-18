-- §14: where a series' instances should land within their day, set by the
-- parent's own drag-reorder — plain additive nullable column, no backfill
-- needed.

-- AlterTable
ALTER TABLE "AssignmentSeries"
    ADD COLUMN "sortOrder" INTEGER;
