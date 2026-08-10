import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { EndCondition, Frequency, SchoolDayType } from "@/generated/prisma/enums";
import { parseISODate, toISODate } from "./dates";
import { extendAllMaterializationHorizons, materializeSeries } from "./materialize";
import { rollOverdueInstances } from "./rollForward";
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
    await markSchoolDay(prisma, student.id, parseISODate("2026-08-05"), SchoolDayType.offDay);

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
    await markSchoolDay(prisma, student.id, parseISODate("2026-08-04"), SchoolDayType.fieldTrip);

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

  it("§12: copies isTimeSensitive/scheduledTime/reminderMinutesBefore onto materialized instances, and keeps them in sync on resync", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);

    const series = await prisma.assignmentSeries.create({
      data: {
        title: "Latin class",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        startDate: parseISODate("2026-08-03"),
        endCondition: EndCondition.onDate,
        endDate: parseISODate("2026-08-07"),
        isTimeSensitive: true,
        scheduledTime: "15:00",
        reminderMinutesBefore: 10,
        recurrence: { create: { frequency: Frequency.weekdays, interval: 1 } },
      },
    });
    await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));

    const created = await prisma.assignmentInstance.findMany({ where: { seriesId: series.id } });
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((i) => i.isTimeSensitive && i.scheduledTime === "15:00" && i.reminderMinutesBefore === 10)).toBe(
      true
    );

    // Changing the series' time and re-syncing updates every still-editable
    // future instance to match (same rule requiresReview already follows).
    await prisma.assignmentSeries.update({ where: { id: series.id }, data: { scheduledTime: "16:30" } });
    await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));

    const resynced = await prisma.assignmentInstance.findMany({ where: { seriesId: series.id } });
    expect(resynced.every((i) => i.scheduledTime === "16:30")).toBe(true);
  });
});

describe("extendAllMaterializationHorizons", () => {
  it("keeps a long-running series generating as real time passes, not just when it's edited", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);

    // A school-year-long weekly class — far past the 60-day horizon a
    // single materializeSeries call would cover.
    const series = await prisma.assignmentSeries.create({
      data: {
        title: "Latin class",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        startDate: parseISODate("2026-08-03"),
        endCondition: EndCondition.onDate,
        endDate: parseISODate("2027-05-01"),
        recurrence: { create: { frequency: Frequency.weekly, daysOfWeek: "mon", interval: 1 } },
      },
    });

    // Creation-time materialization (assignments/new/actions.ts's own call).
    await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));
    const afterCreate = await prisma.assignmentInstance.findMany({ where: { seriesId: series.id } });
    const latestAfterCreate = afterCreate.reduce((max, i) => (i.dueDate! > max ? i.dueDate! : max), afterCreate[0].dueDate!);
    // Nothing yet reaches deep into the school year — just the ~60-day horizon.
    expect(toISODate(latestAfterCreate) < "2026-11-01").toBe(true);

    // No edit ever happens to this series — just time passing and the
    // family opening the app three months later.
    await extendAllMaterializationHorizons(prisma, parseISODate("2026-11-02"));

    const afterExtend = await prisma.assignmentInstance.findMany({ where: { seriesId: series.id } });
    const latestAfterExtend = afterExtend.reduce((max, i) => (i.dueDate! > max ? i.dueDate! : max), afterExtend[0].dueDate!);
    // The horizon has visibly moved forward from where creation left it,
    // well past what a one-time materialization ever covered.
    expect(latestAfterExtend > latestAfterCreate).toBe(true);
    expect(toISODate(latestAfterExtend) >= "2026-12-01").toBe(true);
  });

  it("leaves other series' completed and individually-edited instances untouched", async () => {
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

    const monday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-03") },
    });
    await prisma.assignmentInstance.update({ where: { id: monday.id }, data: { status: "done" } });

    await extendAllMaterializationHorizons(prisma, parseISODate("2026-08-03"));

    const stillDone = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: monday.id } });
    expect(stillDone.status).toBe("done");
  });

  it("never re-derives a rolled-forward instance as stale — matching is by originalDueDate, not the current (rolled) dueDate", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);

    // A one-off (no recurrence) — the simplest case a rolled instance can
    // happen to, and the one where the old dueDate-keyed matching logic
    // deleted-and-recreated the instance outright once it rolled.
    const series = await prisma.assignmentSeries.create({
      data: {
        title: "Latin class",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        startDate: parseISODate("2026-08-10"),
        endCondition: EndCondition.never,
      },
    });
    await materializeSeries(prisma, series.id, parseISODate("2026-08-10"));

    const before = await prisma.assignmentInstance.findFirstOrThrow({ where: { seriesId: series.id } });
    expect(toISODate(before.dueDate!)).toBe("2026-08-10");

    // Left undone through the 11th and 12th — each day's roll pushes it
    // forward, same as a family that missed a couple of days.
    await rollOverdueInstances(prisma, student.id, parseISODate("2026-08-11"));
    await rollOverdueInstances(prisma, student.id, parseISODate("2026-08-12"));

    const rolled = await prisma.assignmentInstance.findFirstOrThrow({ where: { seriesId: series.id } });
    expect(rolled.id).toBe(before.id);
    expect(toISODate(rolled.dueDate!)).toBe("2026-08-12");
    expect(rolled.rolledCount).toBe(2);

    // The family opens the app on the 12th — this must not touch the
    // already-rolled instance at all.
    await extendAllMaterializationHorizons(prisma, parseISODate("2026-08-12"));

    const allInstances = await prisma.assignmentInstance.findMany({ where: { seriesId: series.id } });
    expect(allInstances).toHaveLength(1);
    expect(allInstances[0].id).toBe(before.id);
    expect(toISODate(allInstances[0].dueDate!)).toBe("2026-08-12");
    expect(allInstances[0].rolledCount).toBe(2);
  });

  it("a recurring series' own next occurrence coexists with a rolled-forward prior one on the same day, without colliding", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);

    const series = await prisma.assignmentSeries.create({
      data: {
        title: "Math worksheet",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        startDate: parseISODate("2026-08-10"), // Monday
        endCondition: EndCondition.never,
        recurrence: { create: { frequency: Frequency.weekdays, interval: 1 } },
      },
    });
    await materializeSeries(prisma, series.id, parseISODate("2026-08-10"));

    const monday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, originalDueDate: parseISODate("2026-08-10") },
    });

    // Monday's worksheet is left undone; the roll on Tuesday pushes it onto
    // the same day Tuesday's own worksheet is due.
    await rollOverdueInstances(prisma, student.id, parseISODate("2026-08-11"));
    await extendAllMaterializationHorizons(prisma, parseISODate("2026-08-11"));

    const tuesdayRows = await prisma.assignmentInstance.findMany({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-11") },
    });
    // Both rows land on Tuesday: Monday's debt (rolled, still tied to its
    // own originalDueDate) and Tuesday's own fresh occurrence — never
    // merged, deleted, or silently dropped.
    expect(tuesdayRows).toHaveLength(2);
    const rolledRow = tuesdayRows.find((i) => i.id === monday.id);
    const freshRow = tuesdayRows.find((i) => i.id !== monday.id);
    expect(rolledRow?.rolledCount).toBe(1);
    expect(toISODate(rolledRow!.originalDueDate!)).toBe("2026-08-10");
    expect(freshRow?.rolledCount).toBe(0);
    expect(toISODate(freshRow!.originalDueDate!)).toBe("2026-08-11");
  });
});
