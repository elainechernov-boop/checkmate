import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { InstanceStatus, SchoolDayType } from "@/generated/prisma/enums";
import { addDays, parseISODate } from "./dates";
import { computeStreak } from "./streak";
import { makeStudent } from "./test/fixtures";
import { createTestClient, resetDb } from "./test/testDb";

let prisma: PrismaClient;

// A fixed Thursday, so "yesterday" (Wed) and the two days before it are all
// plain weekdays — no need to reason about Sunday's hard-coded skip here.
const TODAY = parseISODate("2026-08-20");

beforeEach(async () => {
  prisma = createTestClient();
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

async function makeInstance(studentId: string, dueDate: Date, status: InstanceStatus) {
  await prisma.assignmentInstance.create({
    data: { studentId, title: "Task", dueDate, originalDueDate: dueDate, createdBy: "parent", status },
  });
}

describe("computeStreak", () => {
  it("is 0 with no history at all", async () => {
    const student = await makeStudent(prisma);
    expect(await computeStreak(prisma, student.id, TODAY)).toBe(0);
  });

  it("counts consecutive fully-done school days going backward from yesterday", async () => {
    const student = await makeStudent(prisma);
    await makeInstance(student.id, addDays(TODAY, -1), InstanceStatus.done);
    await makeInstance(student.id, addDays(TODAY, -2), InstanceStatus.done);
    await makeInstance(student.id, addDays(TODAY, -3), InstanceStatus.excused);
    expect(await computeStreak(prisma, student.id, TODAY)).toBe(3);
  });

  it("stops at the first day with unresolved work", async () => {
    const student = await makeStudent(prisma);
    await makeInstance(student.id, addDays(TODAY, -1), InstanceStatus.done);
    await makeInstance(student.id, addDays(TODAY, -2), InstanceStatus.open);
    await makeInstance(student.id, addDays(TODAY, -3), InstanceStatus.done);
    expect(await computeStreak(prisma, student.id, TODAY)).toBe(1);
  });

  it("a school day with nothing due neither breaks nor extends the streak", async () => {
    const student = await makeStudent(prisma);
    await makeInstance(student.id, addDays(TODAY, -1), InstanceStatus.done);
    // -2 has nothing due at all
    await makeInstance(student.id, addDays(TODAY, -3), InstanceStatus.done);
    expect(await computeStreak(prisma, student.id, TODAY)).toBe(2);
  });

  it("skips a non-school day without breaking the streak, even with open work sitting on it", async () => {
    const student = await makeStudent(prisma);
    await makeInstance(student.id, addDays(TODAY, -1), InstanceStatus.done);
    await prisma.schoolDay.create({
      data: { studentId: student.id, date: addDays(TODAY, -2), type: SchoolDayType.sick },
    });
    await makeInstance(student.id, addDays(TODAY, -2), InstanceStatus.open);
    await makeInstance(student.id, addDays(TODAY, -3), InstanceStatus.done);
    expect(await computeStreak(prisma, student.id, TODAY)).toBe(2);
  });
});
