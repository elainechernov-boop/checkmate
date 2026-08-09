import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { parseISODate, toISODate } from "./dates";
import { rollOverdueInstances } from "./rollForward";
import { makeStudent, makeSubject, markSchoolDay } from "./test/fixtures";
import { createTestClient, resetDb } from "./test/testDb";

let prisma: PrismaClient;

beforeEach(async () => {
  prisma = createTestClient();
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

async function makeOpenInstance(studentId: string, subjectId: string, title: string, dueDate: Date) {
  return prisma.assignmentInstance.create({
    data: {
      title,
      studentId,
      subjectId,
      createdBy: "parent",
      dueDate,
      originalDueDate: dueDate,
      status: "open",
    },
  });
}

describe("rollOverdueInstances (§5 daily auto-roll)", () => {
  it("skips a weekend: an unfinished Friday item doesn't roll onto a blocked Saturday, but does roll onto Monday", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const friday = parseISODate("2026-08-07");
    const saturday = parseISODate("2026-08-08");
    const monday = parseISODate("2026-08-10");
    await markSchoolDay(prisma, saturday, "offDay");
    await markSchoolDay(prisma, parseISODate("2026-08-09"), "offDay"); // Sunday

    const item = await makeOpenInstance(student.id, subject.id, "Reading", friday);

    const satResult = await rollOverdueInstances(prisma, student.id, saturday);
    expect(satResult.rolledCount).toBe(0);
    const stillFriday = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: item.id } });
    expect(toISODate(stillFriday.dueDate!)).toBe("2026-08-07");
    expect(stillFriday.rolledCount).toBe(0);

    const monResult = await rollOverdueInstances(prisma, student.id, monday);
    expect(monResult.rolledCount).toBe(1);
    const rolled = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: item.id } });
    expect(toISODate(rolled.dueDate!)).toBe("2026-08-10");
    expect(rolled.rolledCount).toBe(1);
    expect(toISODate(rolled.originalDueDate!)).toBe("2026-08-07"); // unchanged — the roll mark's basis
  });

  it("leaves a pendingReview item exactly where it is — it holds its day", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const yesterday = parseISODate("2026-08-09");
    const today = parseISODate("2026-08-10");

    const pending = await prisma.assignmentInstance.create({
      data: {
        title: "Show Mom",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        dueDate: yesterday,
        originalDueDate: yesterday,
        status: "pendingReview",
        requiresReview: true,
        completedAt: yesterday,
      },
    });

    const result = await rollOverdueInstances(prisma, student.id, today);
    expect(result.rolledCount).toBe(0);

    const after = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: pending.id } });
    expect(toISODate(after.dueDate!)).toBe("2026-08-09");
    expect(after.status).toBe("pendingReview");
    expect(after.rolledCount).toBe(0);
  });

  it("does nothing for a backlog project task (null dueDate)", async () => {
    const student = await makeStudent(prisma);
    const backlog = await prisma.assignmentInstance.create({
      data: {
        title: "Someday",
        studentId: student.id,
        createdBy: "student",
        dueDate: null,
        status: "open",
      },
    });

    await rollOverdueInstances(prisma, student.id, parseISODate("2026-08-10"));

    const after = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: backlog.id } });
    expect(after.dueDate).toBeNull();
    expect(after.rolledCount).toBe(0);
  });
});
