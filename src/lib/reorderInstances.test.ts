import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { parseISODate } from "./dates";
import { reorderOpenItems } from "./reorderInstances";
import { makeStudent, makeSubject } from "./test/fixtures";
import { createTestClient, resetDb } from "./test/testDb";

let prisma: PrismaClient;
const TODAY = parseISODate("2026-08-10");

beforeEach(async () => {
  prisma = createTestClient();
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

async function makeOpenInstance(
  studentId: string,
  subjectId: string,
  title: string,
  overrides: Partial<{ dueDate: Date; status: "open" | "done" }> = {}
) {
  return prisma.assignmentInstance.create({
    data: {
      title,
      studentId,
      subjectId,
      createdBy: "parent",
      dueDate: overrides.dueDate ?? TODAY,
      originalDueDate: overrides.dueDate ?? TODAY,
      status: overrides.status ?? "open",
    },
  });
}

describe("reorderOpenItems", () => {
  it("assigns sortOrder matching the requested order", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const a = await makeOpenInstance(student.id, subject.id, "A");
    const b = await makeOpenInstance(student.id, subject.id, "B");
    const c = await makeOpenInstance(student.id, subject.id, "C");

    await reorderOpenItems(prisma, student.id, [c.id, a.id, b.id], TODAY);

    const rows = await prisma.assignmentInstance.findMany({
      where: { studentId: student.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(rows.map((r) => r.title)).toEqual(["C", "A", "B"]);
  });

  it("ignores ids belonging to a different student", async () => {
    const student = await makeStudent(prisma, { name: "Miles" });
    const other = await makeStudent(prisma, { name: "Violet" });
    const subject = await makeSubject(prisma);
    const mine = await makeOpenInstance(student.id, subject.id, "Mine");
    const theirs = await makeOpenInstance(other.id, subject.id, "Theirs");

    await reorderOpenItems(prisma, student.id, [mine.id, theirs.id], TODAY);

    const theirsAfter = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(theirsAfter.sortOrder).toBe(0); // untouched default, not reassigned to index 1
  });

  it("ignores ids that aren't due today", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const tomorrow = await makeOpenInstance(student.id, subject.id, "Tomorrow", {
      dueDate: parseISODate("2026-08-11"),
    });

    await reorderOpenItems(prisma, student.id, [tomorrow.id], TODAY);

    const after = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: tomorrow.id } });
    expect(after.sortOrder).toBe(0);
  });

  it("ignores ids that aren't status open", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const done = await makeOpenInstance(student.id, subject.id, "Done", { status: "done" });

    await reorderOpenItems(prisma, student.id, [done.id], TODAY);

    const after = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: done.id } });
    expect(after.sortOrder).toBe(0);
  });
});
