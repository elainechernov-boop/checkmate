import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { EndCondition, Frequency, SchoolDayType } from "@/generated/prisma/enums";
import { parseISODate, toISODate } from "./dates";
import { materializeSeries } from "./materialize";
import { createTestClient, resetDb } from "./test/testDb";
import { makeStudent, makeSubject, markSchoolDay } from "./test/fixtures";

let prisma: PrismaClient;

beforeEach(async () => {
  prisma = createTestClient();
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe("materializeSeries", () => {
  it("creates instances for a weekdays series and skips a marked offDay", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    await markSchoolDay(prisma, parseISODate("2026-08-05"), SchoolDayType.offDay);

    const series = await prisma.assignmentSeries.create({
      data: {
        title: "Math worksheet",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        startDate: parseISODate("2026-08-03"),
        endCondition: EndCondition.onDate,
        endDate: parseISODate("2026-08-07"),
        recurrence: { create: { frequency: Frequency.weekdays, interval: 1 } },
      },
    });

    await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));

    const instances = await prisma.assignmentInstance.findMany({
      where: { seriesId: series.id },
      orderBy: { dueDate: "asc" },
    });

    expect(instances.map((i) => toISODate(i.dueDate!))).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-06",
      "2026-08-07",
    ]);
  });

  it("omits a field-trip Tuesday from a weekly Tue/Thu series", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma, { name: "Latin" });
    await markSchoolDay(prisma, parseISODate("2026-08-04"), SchoolDayType.fieldTrip);

    const series = await prisma.assignmentSeries.create({
      data: {
        title: "Latin lesson",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        startDate: parseISODate("2026-08-03"),
        endCondition: EndCondition.onDate,
        endDate: parseISODate("2026-08-13"),
        recurrence: { create: { frequency: Frequency.weekly, daysOfWeek: "tue,thu", interval: 1 } },
      },
    });

    await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));

    const instances = await prisma.assignmentInstance.findMany({
      where: { seriesId: series.id },
      orderBy: { dueDate: "asc" },
    });

    expect(instances.map((i) => toISODate(i.dueDate!))).toEqual(["2026-08-06", "2026-08-11", "2026-08-13"]);
  });

  it("stops generating once an afterNCount series' count is reached", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);

    const series = await prisma.assignmentSeries.create({
      data: {
        title: "Spelling test",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        startDate: parseISODate("2026-08-03"),
        endCondition: EndCondition.afterNCount,
        endCount: 2,
        recurrence: { create: { frequency: Frequency.weekdays, interval: 1 } },
      },
    });

    await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));

    const instances = await prisma.assignmentInstance.findMany({ where: { seriesId: series.id } });
    expect(instances).toHaveLength(2);
  });

  it("stops generating once an onDate series' end date passes", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);

    const series = await prisma.assignmentSeries.create({
      data: {
        title: "Handwriting",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        startDate: parseISODate("2026-08-03"),
        endCondition: EndCondition.onDate,
        endDate: parseISODate("2026-08-04"),
        recurrence: { create: { frequency: Frequency.weekdays, interval: 1 } },
      },
    });

    await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));

    const instances = await prisma.assignmentInstance.findMany({
      where: { seriesId: series.id },
      orderBy: { dueDate: "asc" },
    });
    expect(instances.map((i) => toISODate(i.dueDate!))).toEqual(["2026-08-03", "2026-08-04"]);
  });

  it("never touches a completed or individually-edited instance on regeneration", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);

    const series = await prisma.assignmentSeries.create({
      data: {
        title: "Math worksheet",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        startDate: parseISODate("2026-08-03"),
        endCondition: EndCondition.never,
        recurrence: { create: { frequency: Frequency.weekdays, interval: 1 } },
      },
    });
    await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));

    // Order is Mon 8/3, Tue 8/4, Wed 8/5, Thu 8/6, Fri 8/7, ...
    const [, , wednesday, , completedFriday] = await prisma.assignmentInstance.findMany({
      where: { seriesId: series.id },
      orderBy: { dueDate: "asc" },
    });

    // Simulate a per-instance edit and a completed instance.
    await prisma.assignmentInstance.update({
      where: { id: wednesday.id },
      data: { title: "Math worksheet (extra credit)", isOverride: true },
    });
    await prisma.assignmentInstance.update({
      where: { id: completedFriday.id },
      data: { status: "done", completedAt: new Date() },
    });

    // Now the parent renames the whole series and regenerates.
    await prisma.assignmentSeries.update({ where: { id: series.id }, data: { title: "Math packet" } });
    await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));

    const after = await prisma.assignmentInstance.findMany({
      where: { seriesId: series.id },
      orderBy: { dueDate: "asc" },
    });

    const byId = new Map(after.map((i) => [i.id, i]));
    expect(byId.get(wednesday.id)?.title).toBe("Math worksheet (extra credit)");
    expect(byId.get(wednesday.id)?.isOverride).toBe(true);
    expect(byId.get(completedFriday.id)?.title).toBe("Math worksheet"); // untouched, still old title
    expect(byId.get(completedFriday.id)?.status).toBe("done");

    // Everything else picked up the new series title.
    const untouchedIds = new Set([wednesday.id, completedFriday.id]);
    for (const instance of after) {
      if (untouchedIds.has(instance.id)) continue;
      expect(instance.title).toBe("Math packet");
    }
  });

  it("deletes stale future instances that no longer match the series after a recurrence change", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);

    const series = await prisma.assignmentSeries.create({
      data: {
        title: "Piano practice",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        startDate: parseISODate("2026-08-03"),
        endCondition: EndCondition.never,
        recurrence: { create: { frequency: Frequency.weekly, daysOfWeek: "mon,tue,wed,thu,fri", interval: 1 } },
      },
    });
    await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));
    const before = await prisma.assignmentInstance.findMany({ where: { seriesId: series.id } });
    expect(before.length).toBeGreaterThan(1);

    // Cut the recurrence down to Mondays only and regenerate.
    await prisma.recurrenceRule.update({ where: { seriesId: series.id }, data: { daysOfWeek: "mon" } });
    await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));

    const after = await prisma.assignmentInstance.findMany({
      where: { seriesId: series.id },
      orderBy: { dueDate: "asc" },
    });
    expect(after.every((i) => i.dueDate!.getUTCDay() === 1)).toBe(true);
  });
});
