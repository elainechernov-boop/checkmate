-- Separators now carry a free-text label ("Before breakfast") instead of a
-- fixed Morning/Afternoon/Evening enum.

-- AlterTable
ALTER TABLE "DaySeparator" ALTER COLUMN "label" TYPE TEXT USING "label"::TEXT;

-- DropEnum
DROP TYPE "DaySeparatorLabel";
