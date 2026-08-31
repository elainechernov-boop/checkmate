-- Per-family hashed credentials (MULTI_FAMILY_SPEC.md Phase 2) — nullable
-- because the existing seed family's row predates these columns and
-- self-heals to a hash on its first post-migration login (gate/actions.ts),
-- falling back to the legacy FAMILY_PASSWORD/PARENT_PASSCODE env vars until
-- then.

-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "accessCodeHash" TEXT,
ADD COLUMN     "parentPasscodeHash" TEXT;
