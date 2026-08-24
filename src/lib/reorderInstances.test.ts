import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { parseISODate } from "./dates";
import { reorderDayRows, reorderOpenItems } from "./reorderInstances";
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

async function makeSeparator(studentId: string, label: "morning" | "afternoon" | "evening", sortOrder: number) {
  return prisma.daySeparator.create({ data: { studentId, date: TODAY, label, sortOrder } });
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

  describe("with a separator", () => {
    it("reorders freely within one segment, ignoring the rest of the list", async () => {
      const student = await makeStudent(prisma);
      const subject = await makeSubject(prisma);
      // Current order: A, B, [morning], C, D
      const a = await makeOpenInstance(student.id, subject.id, "A");
      const b = await makeOpenInstance(student.id, subject.id, "B");
      await prisma.assignmentInstance.update({ where: { id: a.id }, data: { sortOrder: 0 } });
      await prisma.assignmentInstance.update({ where: { id: b.id }, data: { sortOrder: 1 } });
      await makeSeparator(student.id, "morning", 2);
      const c = await makeOpenInstance(student.id, subject.id, "C");
      const d = await makeOpenInstance(student.id, subject.id, "D");
      await prisma.assignmentInstance.update({ where: { id: c.id }, data: { sortOrder: 3 } });
      await prisma.assignmentInstance.update({ where: { id: d.id }, data: { sortOrder: 4 } });

      // Ask to reorder as if B could jump past the separator to the front
      // of the second segment — the segment boundary should win regardless.
      await reorderOpenItems(prisma, student.id, [d.id, c.id, b.id, a.id], TODAY);

      const rows = await prisma.assignmentInstance.findMany({
        where: { studentId: student.id },
        orderBy: { sortOrder: "asc" },
      });
      // B, A still both come before the separator (segment 1's own order
      // flipped to B, A); D, C still both come after it (segment 2 flipped
      // to D, C) — nothing crossed.
      expect(rows.map((r) => r.title)).toEqual(["B", "A", "D", "C"]);

      const separator = await prisma.daySeparator.findFirstOrThrow({ where: { studentId: student.id } });
      const [firstTwo, lastTwo] = [rows.slice(0, 2), rows.slice(2, 4)];
      expect(Math.max(...firstTwo.map((r) => r.sortOrder))).toBeLessThan(separator.sortOrder);
      expect(Math.min(...lastTwo.map((r) => r.sortOrder))).toBeGreaterThan(separator.sortOrder);
    });

    it("never lets an instance's final position cross the separator, however the request is shaped", async () => {
      const student = await makeStudent(prisma);
      const subject = await makeSubject(prisma);
      const a = await makeOpenInstance(student.id, subject.id, "A");
      await prisma.assignmentInstance.update({ where: { id: a.id }, data: { sortOrder: 0 } });
      await makeSeparator(student.id, "afternoon", 1);
      const b = await makeOpenInstance(student.id, subject.id, "B");
      await prisma.assignmentInstance.update({ where: { id: b.id }, data: { sortOrder: 2 } });

      await reorderOpenItems(prisma, student.id, [b.id, a.id], TODAY); // tries to put B before A

      const separator = await prisma.daySeparator.findFirstOrThrow({ where: { studentId: student.id } });
      const aAfter = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: a.id } });
      const bAfter = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: b.id } });
      expect(aAfter.sortOrder).toBeLessThan(separator.sortOrder);
      expect(bAfter.sortOrder).toBeGreaterThan(separator.sortOrder);
    });
  });
});

describe("reorderDayRows (Parent Mode's own within-day reorder)", () => {
  it("reorders regardless of status, unlike reorderOpenItems", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const open = await makeOpenInstance(student.id, subject.id, "Open");
    const done = await makeOpenInstance(student.id, subject.id, "Done", { status: "done" });

    await reorderDayRows(prisma, student.id, "2026-08-10", [done.id, open.id]);

    const rows = await prisma.assignmentInstance.findMany({
      where: { studentId: student.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(rows.map((r) => r.title)).toEqual(["Done", "Open"]);
  });

  it("ignores ids belonging to a different day or student", async () => {
    const student = await makeStudent(prisma, { name: "Miles" });
    const other = await makeStudent(prisma, { name: "Violet" });
    const subject = await makeSubject(prisma);
    const mine = await makeOpenInstance(student.id, subject.id, "Mine");
    const theirs = await makeOpenInstance(other.id, subject.id, "Theirs");
    const wrongDay = await makeOpenInstance(student.id, subject.id, "Tomorrow", {
      dueDate: parseISODate("2026-08-11"),
    });

    await reorderDayRows(prisma, student.id, "2026-08-10", [mine.id, theirs.id, wrongDay.id]);

    const theirsAfter = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: theirs.id } });
    const wrongDayAfter = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: wrongDay.id } });
    expect(theirsAfter.sortOrder).toBe(0);
    expect(wrongDayAfter.sortOrder).toBe(0);
  });

  it("freely reorders a separator alongside instances, unlike the student's own reorder", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const a = await makeOpenInstance(student.id, subject.id, "A");
    const separator = await makeSeparator(student.id, "evening", 1);
    const b = await makeOpenInstance(student.id, subject.id, "B");

    // Move the separator to the very front — a parent can do this, a
    // student never could.
    await reorderDayRows(prisma, student.id, "2026-08-10", [separator.id, a.id, b.id]);

    const separatorAfter = await prisma.daySeparator.findUniqueOrThrow({ where: { id: separator.id } });
    const aAfter = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: a.id } });
    expect(separatorAfter.sortOrder).toBeLessThan(aAfter.sortOrder);
  });
});
