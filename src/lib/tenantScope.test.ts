import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { tenantScopeExtension } from "./tenantScope";
import { createTestClient, resetDb } from "./test/testDb";

let prisma: PrismaClient;

beforeEach(async () => {
  prisma = createTestClient();
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

// MULTI_FAMILY_SPEC.md Phase 2's one non-optional test: a session scoped to
// one family must never be able to read, update, or delete another
// family's rows, no matter what id a call site passes in. Everything here
// exercises tenantScopeExtension() directly (the same thing
// getScopedPrisma() hands every page/action in production) rather than
// trusting that every call site remembered to filter by hand.
async function makeFamilies() {
  const familyA = await prisma.family.create({ data: { name: "Family A", slug: `family-a-${randomUUID()}` } });
  const familyB = await prisma.family.create({ data: { name: "Family B", slug: `family-b-${randomUUID()}` } });
  return {
    familyA,
    familyB,
    scopedA: prisma.$extends(tenantScopeExtension(familyA.id)),
    scopedB: prisma.$extends(tenantScopeExtension(familyB.id)),
  };
}

describe("tenant scoping", () => {
  it("stamps every create with the scoped family, regardless of what the caller passes", async () => {
    const { familyA, familyB, scopedA, scopedB } = await makeFamilies();

    const studentA = await scopedA.student.create({ data: { name: "Miles", gradeLevel: "7th", accentColor: "#000" } });
    const studentB = await scopedB.student.create({ data: { name: "Miles", gradeLevel: "7th", accentColor: "#000" } });

    expect(studentA.familyId).toBe(familyA.id);
    expect(studentB.familyId).toBe(familyB.id);
  });

  it("findMany only ever sees the scoped family's own rows", async () => {
    const { scopedA, scopedB } = await makeFamilies();
    const studentA = await scopedA.student.create({ data: { name: "Miles", gradeLevel: "7th", accentColor: "#000" } });
    await scopedB.student.create({ data: { name: "Violet", gradeLevel: "5th", accentColor: "#111" } });

    const seenByA = await scopedA.student.findMany();
    expect(seenByA.map((s) => s.id)).toEqual([studentA.id]);
  });

  it("findUnique by id alone can't cross the family boundary", async () => {
    const { scopedA, scopedB } = await makeFamilies();
    const studentB = await scopedB.student.create({ data: { name: "Violet", gradeLevel: "5th", accentColor: "#111" } });

    expect(await scopedA.student.findUnique({ where: { id: studentB.id } })).toBeNull();
  });

  it("findUniqueOrThrow by id alone can't cross the family boundary", async () => {
    const { scopedA, scopedB } = await makeFamilies();
    const studentB = await scopedB.student.create({ data: { name: "Violet", gradeLevel: "5th", accentColor: "#111" } });
    const instanceB = await scopedB.assignmentInstance.create({
      data: { title: "Math", studentId: studentB.id, createdBy: "parent", status: "open" },
    });

    await expect(scopedA.assignmentInstance.findUniqueOrThrow({ where: { id: instanceB.id } })).rejects.toThrow();
  });

  it("update by id alone can't cross the family boundary, and leaves the other family's row untouched", async () => {
    const { scopedA, scopedB } = await makeFamilies();
    const studentB = await scopedB.student.create({ data: { name: "Violet", gradeLevel: "5th", accentColor: "#111" } });

    await expect(scopedA.student.update({ where: { id: studentB.id }, data: { name: "Hacked" } })).rejects.toThrow();

    const stillB = await prisma.student.findUniqueOrThrow({ where: { id: studentB.id } });
    expect(stillB.name).toBe("Violet");
  });

  it("delete by id alone can't cross the family boundary", async () => {
    const { scopedA, scopedB } = await makeFamilies();
    const studentB = await scopedB.student.create({ data: { name: "Violet", gradeLevel: "5th", accentColor: "#111" } });

    await expect(scopedA.student.delete({ where: { id: studentB.id } })).rejects.toThrow();
    expect(await prisma.student.findUnique({ where: { id: studentB.id } })).not.toBeNull();
  });

  it("deleteMany with no where clause only ever affects the scoped family's rows", async () => {
    const { scopedA, scopedB } = await makeFamilies();
    await scopedA.student.create({ data: { name: "Miles", gradeLevel: "7th", accentColor: "#000" } });
    const studentB = await scopedB.student.create({ data: { name: "Violet", gradeLevel: "5th", accentColor: "#111" } });

    await scopedA.student.deleteMany();

    expect(await scopedA.student.findMany()).toHaveLength(0);
    expect(await prisma.student.findUnique({ where: { id: studentB.id } })).not.toBeNull();
  });
});
