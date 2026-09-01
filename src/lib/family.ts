import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashSecret } from "@/lib/session";

function slugify(name: string): string {
  // Unused by login today (families are matched by trying each one's
  // access-code hash — see gate/actions.ts), reserved for a future
  // per-family URL (MULTI_FAMILY_SPEC.md Phase 7). The random suffix means
  // two families named the same thing never collide on the unique
  // constraint without the admin having to think about it.
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = randomBytes(3).toString("hex");
  return `${base || "family"}-${suffix}`;
}

export interface CreateFamilyInput {
  name: string;
  accessCode: string;
  parentPasscode: string;
  complianceModuleEnabled: boolean;
}

/**
 * The one function that creates a family (MULTI_FAMILY_SPEC.md Phase 4) —
 * called today from the owner-only admin dashboard's create form, and
 * meant to be the same thing a future self-serve signup flow (Phase 7)
 * would call, so that isn't a rewrite when it eventually exists.
 */
export async function createFamily(input: CreateFamilyInput) {
  return prisma.family.create({
    data: {
      name: input.name,
      slug: slugify(input.name),
      accessCodeHash: hashSecret(input.accessCode),
      parentPasscodeHash: hashSecret(input.parentPasscode),
      complianceModuleEnabled: input.complianceModuleEnabled,
    },
  });
}

export async function listFamilies() {
  return prisma.family.findMany({ orderBy: { createdAt: "desc" } });
}
