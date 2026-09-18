import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { addDays, parseISODate } from "./dates";
import { reorderDayRows } from "./reorderInstances";
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

async function makeSeriesInstance(
  studentId: string,
  subjectId: string,
  seriesId: string,
  title: string,
  dueDate: Date,
  overrides: Partial<{ isOverride: boolean; status: "open" | "done" }> = {}
) {
  return prisma.assignmentInstance.create({
    data: {
      title,
      studentId,
      subjectId,
      seriesId,
      createdBy: "parent",
      dueDate,
      originalDueDate: dueDate,
      status: overrides.status ?? "open",
      isOverride: overrides.isOverride ?? false,
    },
  });
}

async function makeSeries(studentId: string, subjectId: string, title: string) {
  return prisma.assignmentSeries.create({
    data: {
      title,
      studentId,
      subjectId,
      createdBy: "parent",
      startDate: TODAY,
    },
  });
}

describe("reorderDayRows (Parent Mode's own within-day reorder)", () => {
  it("reorders regardless of status", async () => {
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

  it("freely reorders a separator alongside instances", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const a = await makeOpenInstance(student.id, subject.id, "A");
    const separator = await makeSeparator(student.id, "evening", 1);
    const b = await makeOpenInstance(student.id, subject.id, "B");

    // Move the separator to the very front.
    await reorderDayRows(prisma, student.id, "2026-08-10", [separator.id, a.id, b.id]);

    const separatorAfter = await prisma.daySeparator.findUniqueOrThrow({ where: { id: separator.id } });
    const aAfter = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: a.id } });
    expect(separatorAfter.sortOrder).toBeLessThan(aAfter.sortOrder);
  });

  describe("§14: reordering a series instance propagates forward", () => {
    it("moves the series' other future occurrences to the same index and remembers it on the series", async () => {
      const student = await makeStudent(prisma);
      const subject = await makeSubject(prisma);
      const series = await makeSeries(student.id, subject.id, "Math");
      const tomorrow = addDays(TODAY, 1);

      const a = await makeOpenInstance(student.id, subject.id, "A"); // today, sortOrder 0
      const mathToday = await makeSeriesInstance(student.id, subject.id, series.id, "Math", TODAY); // today, sortOrder 1

      const mathTomorrow = await makeSeriesInstance(student.id, subject.id, series.id, "Math", tomorrow);
      const b = await makeOpenInstance(student.id, subject.id, "B", { dueDate: tomorrow });
      await prisma.assignmentInstance.update({ where: { id: mathTomorrow.id }, data: { sortOrder: 0 } });
      await prisma.assignmentInstance.update({ where: { id: b.id }, data: { sortOrder: 1 } });

      // Drag Math to the top of today's list.
      await reorderDayRows(prisma, student.id, "2026-08-10", [mathToday.id, a.id]);

      const seriesAfter = await prisma.assignmentSeries.findUniqueOrThrow({ where: { id: series.id } });
      expect(seriesAfter.sortOrder).toBe(0);

      const tomorrowRows = await prisma.assignmentInstance.findMany({
        where: { studentId: student.id, dueDate: tomorrow },
        orderBy: { sortOrder: "asc" },
      });
      // Math also moved to index 0 tomorrow, pushing B down to index 1.
      expect(tomorrowRows.map((r) => r.title)).toEqual(["Math", "B"]);
    });

    it("skips a future occurrence that's been individually detached from the series", async () => {
      const student = await makeStudent(prisma);
      const subject = await makeSubject(prisma);
      const series = await makeSeries(student.id, subject.id, "Math");
      const tomorrow = addDays(TODAY, 1);

      const mathToday = await makeSeriesInstance(student.id, subject.id, series.id, "Math", TODAY);
      const a = await makeOpenInstance(student.id, subject.id, "A");

      const detached = await makeSeriesInstance(student.id, subject.id, series.id, "Detached", tomorrow, {
        isOverride: true,
      });
      await prisma.assignmentInstance.update({ where: { id: detached.id }, data: { sortOrder: 3 } });

      await reorderDayRows(prisma, student.id, "2026-08-10", [mathToday.id, a.id]);

      const detachedAfter = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: detached.id } });
      expect(detachedAfter.sortOrder).toBe(3); // untouched
    });

    it("skips a future occurrence that's already done", async () => {
      const student = await makeStudent(prisma);
      const subject = await makeSubject(prisma);
      const series = await makeSeries(student.id, subject.id, "Math");
      const tomorrow = addDays(TODAY, 1);

      const mathToday = await makeSeriesInstance(student.id, subject.id, series.id, "Math", TODAY);
      const a = await makeOpenInstance(student.id, subject.id, "A");

      const doneTomorrow = await makeSeriesInstance(student.id, subject.id, series.id, "Done Math", tomorrow, {
        status: "done",
      });
      await prisma.assignmentInstance.update({ where: { id: doneTomorrow.id }, data: { sortOrder: 3 } });

      await reorderDayRows(prisma, student.id, "2026-08-10", [mathToday.id, a.id]);

      const doneAfter = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: doneTomorrow.id } });
      expect(doneAfter.sortOrder).toBe(3); // untouched
    });
  });
});
