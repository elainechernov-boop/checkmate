import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { EndCondition, Frequency } from "@/generated/prisma/enums";
import {
  deleteAllInSeries,
  deleteInstanceOnly,
  deleteSeriesThisAndFollowing,
  editAllInSeries,
  editInstanceOnly,
  editSeriesThisAndFollowing,
  promoteInstanceToSeries,
  quickCreateInstance,
  rescheduleInstance,
} from "./assignmentEdits";
import { parseISODate, toISODate } from "./dates";
import { materializeSeries } from "./materialize";
import { makeStudent, makeSubject } from "./test/fixtures";
import { createTestClient, resetDb } from "./test/testDb";

let prisma: PrismaClient;

beforeEach(async () => {
  prisma = createTestClient();
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

async function makeWeekdaysSeries(prisma: PrismaClient, title = "Math worksheet") {
  const student = await makeStudent(prisma);
  const subject = await makeSubject(prisma);
  const series = await prisma.assignmentSeries.create({
    data: {
      title,
      studentId: student.id,
      subjectId: subject.id,
      createdBy: "parent",
      startDate: parseISODate("2026-08-03"), // Monday
      endCondition: EndCondition.never,
      recurrence: { create: { frequency: Frequency.weekdays, interval: 1 } },
    },
  });
  await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));
  return { series, student, subject };
}

describe("editInstanceOnly (§4 'this assignment only')", () => {
  it("detaches a single instance so it survives a later series-wide edit", async () => {
    const { series } = await makeWeekdaysSeries(prisma);
    const wednesday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
    });

    await editInstanceOnly(prisma, wednesday.id, { title: "Math worksheet (extra credit)" });

    const updated = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: wednesday.id } });
    expect(updated.title).toBe("Math worksheet (extra credit)");
    expect(updated.isOverride).toBe(true);

    // A subsequent "all in series" rename must not touch it.
    await editAllInSeries(prisma, series.id, { title: "Math packet" }, parseISODate("2026-08-03"));

    const afterRegen = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: wednesday.id } });
    expect(afterRegen.title).toBe("Math worksheet (extra credit)");

    const others = await prisma.assignmentInstance.findMany({
      where: { seriesId: series.id, id: { not: wednesday.id } },
    });
    expect(others.every((i) => i.title === "Math packet")).toBe(true);
  });

  it("updates originalDueDate when the edit reschedules the instance", async () => {
    const { series } = await makeWeekdaysSeries(prisma);
    const monday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-03") },
    });

    await editInstanceOnly(prisma, monday.id, { dueDate: parseISODate("2026-08-04") });

    const updated = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: monday.id } });
    expect(toISODate(updated.dueDate!)).toBe("2026-08-04");
    expect(toISODate(updated.originalDueDate!)).toBe("2026-08-04");
  });

  it("persists estimatedMinutes on the instance itself — this was a real bug: estimatedMinutes only ever lived on the series, so 'this assignment only' (the default edit scope) had nowhere to save it and Save silently did nothing", async () => {
    const { series } = await makeWeekdaysSeries(prisma);
    const monday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-03") },
    });

    await editInstanceOnly(prisma, monday.id, { estimatedMinutes: 25 });

    const updated = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: monday.id } });
    expect(updated.estimatedMinutes).toBe(25);
  });
});

describe("editAllInSeries (§4 'all in series')", () => {
  it("propagates a title change to every future non-protected instance", async () => {
    const { series } = await makeWeekdaysSeries(prisma);

    await editAllInSeries(prisma, series.id, { title: "Math packet" }, parseISODate("2026-08-03"));

    const instances = await prisma.assignmentInstance.findMany({ where: { seriesId: series.id } });
    expect(instances.length).toBeGreaterThan(0);
    expect(instances.every((i) => i.title === "Math packet")).toBe(true);
  });

  it("changing the recurrence rule regenerates matching instances", async () => {
    const { series } = await makeWeekdaysSeries(prisma);

    await editAllInSeries(
      prisma,
      series.id,
      { recurrence: { frequency: Frequency.weekly, daysOfWeek: "mon" } },
      parseISODate("2026-08-03")
    );

    const instances = await prisma.assignmentInstance.findMany({ where: { seriesId: series.id } });
    expect(instances.every((i) => i.dueDate!.getUTCDay() === 1)).toBe(true);
  });
});

describe("editSeriesThisAndFollowing (§4 'this and following')", () => {
  it("splits the series: old series stops before the split date, new series carries the edit from it on", async () => {
    const { series } = await makeWeekdaysSeries(prisma);
    const wednesday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
    });

    const result = await editSeriesThisAndFollowing(prisma, wednesday.id, { title: "Math packet v2" });
    expect("newSeriesId" in result).toBe(true);
    const newSeriesId = (result as { newSeriesId: string }).newSeriesId;

    const oldSeries = await prisma.assignmentSeries.findUniqueOrThrow({ where: { id: series.id } });
    expect(oldSeries.endCondition).toBe(EndCondition.onDate);
    expect(toISODate(oldSeries.endDate!)).toBe("2026-08-04"); // day before the split

    const oldInstances = await prisma.assignmentInstance.findMany({ where: { seriesId: series.id } });
    expect(oldInstances.map((i) => toISODate(i.dueDate!)).sort()).toEqual(["2026-08-03", "2026-08-04"]);
    expect(oldInstances.every((i) => i.title === "Math worksheet")).toBe(true);

    const newInstances = await prisma.assignmentInstance.findMany({
      where: { seriesId: newSeriesId },
      orderBy: { dueDate: "asc" },
    });
    expect(newInstances[0] && toISODate(newInstances[0].dueDate!)).toBe("2026-08-05");
    expect(newInstances.every((i) => i.title === "Math packet v2")).toBe(true);
  });

  it("carries over the remaining afterNCount budget to the new series", async () => {
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
        endCount: 5,
        recurrence: { create: { frequency: Frequency.weekdays, interval: 1 } },
      },
    });
    await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));

    // 5 occurrences: Mon 8/3 .. Fri 8/7. Split at Wed 8/5 (2 already used).
    const wednesday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
    });
    const result = await editSeriesThisAndFollowing(prisma, wednesday.id, { title: "Spelling test v2" });
    const newSeriesId = (result as { newSeriesId: string }).newSeriesId;

    const newSeries = await prisma.assignmentSeries.findUniqueOrThrow({ where: { id: newSeriesId } });
    expect(newSeries.endCondition).toBe(EndCondition.afterNCount);
    expect(newSeries.endCount).toBe(3); // 5 - 2 already generated before the split

    const newInstances = await prisma.assignmentInstance.findMany({ where: { seriesId: newSeriesId } });
    expect(newInstances).toHaveLength(3);
  });
});

describe("quickCreateInstance (Parent Mode click-a-date quick-add)", () => {
  it("creates a one-off open instance on the given date", async () => {
    const student = await makeStudent(prisma);

    await quickCreateInstance(prisma, student.id, parseISODate("2026-08-10"), "Piano practice");

    const created = await prisma.assignmentInstance.findFirstOrThrow({ where: { title: "Piano practice" } });
    expect(created.seriesId).toBeNull();
    expect(created.subjectId).toBeNull();
    expect(created.status).toBe("open");
    expect(toISODate(created.dueDate!)).toBe("2026-08-10");
    expect(toISODate(created.originalDueDate!)).toBe("2026-08-10");
  });

  it("does nothing for a blank title", async () => {
    const student = await makeStudent(prisma);

    await quickCreateInstance(prisma, student.id, parseISODate("2026-08-10"), "   ");

    const count = await prisma.assignmentInstance.count();
    expect(count).toBe(0);
  });

  it("lands after every existing row on that day, not at sortOrder 0", async () => {
    const student = await makeStudent(prisma);
    const dueDate = parseISODate("2026-08-10");
    await prisma.assignmentInstance.create({
      data: { title: "Reading", studentId: student.id, createdBy: "parent", dueDate, originalDueDate: dueDate, status: "open", sortOrder: 3 },
    });
    await prisma.daySeparator.create({
      data: { studentId: student.id, date: dueDate, label: "Afternoon", sortOrder: 4 },
    });

    await quickCreateInstance(prisma, student.id, dueDate, "Piano practice");

    const created = await prisma.assignmentInstance.findFirstOrThrow({ where: { title: "Piano practice" } });
    expect(created.sortOrder).toBe(5);
  });
});

describe("rescheduleInstance (Parent Mode drag-to-reschedule)", () => {
  it("moves a standalone instance directly", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const instance = await prisma.assignmentInstance.create({
      data: {
        title: "Art project",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        dueDate: parseISODate("2026-08-13"), // Thursday
        originalDueDate: parseISODate("2026-08-13"),
        status: "open",
      },
    });

    await rescheduleInstance(prisma, instance.id, parseISODate("2026-08-12")); // to Wednesday

    const updated = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(toISODate(updated.dueDate!)).toBe("2026-08-12");
    expect(toISODate(updated.originalDueDate!)).toBe("2026-08-12");
    expect(updated.isOverride).toBe(false);
  });

  it("moves only the dragged occurrence of a repeating series, leaving the rest alone", async () => {
    const { series } = await makeWeekdaysSeries(prisma);
    const thursday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-06") },
    });

    await rescheduleInstance(prisma, thursday.id, parseISODate("2026-08-08")); // Saturday

    const moved = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: thursday.id } });
    expect(toISODate(moved.dueDate!)).toBe("2026-08-08");
    expect(moved.isOverride).toBe(true);
    expect(moved.seriesId).toBe(series.id);

    // The rest of the series (that first week, at least) is untouched.
    const siblings = await prisma.assignmentInstance.findMany({
      where: {
        seriesId: series.id,
        id: { not: thursday.id },
        dueDate: { lte: parseISODate("2026-08-07") },
      },
    });
    expect(siblings.map((i) => toISODate(i.dueDate!)).sort()).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-07",
    ]);
    expect(siblings.every((i) => !i.isOverride)).toBe(true);
  });
});

describe("promoteInstanceToSeries (adding repetition to a one-off item)", () => {
  it("creates a series starting at the instance's due date and removes the standalone row", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const instance = await prisma.assignmentInstance.create({
      data: {
        title: "Reading log",
        studentId: student.id,
        createdBy: "parent",
        dueDate: parseISODate("2026-08-10"),
        originalDueDate: parseISODate("2026-08-10"),
        status: "open",
      },
    });

    const { seriesId } = await promoteInstanceToSeries(prisma, instance.id, {
      title: "Reading log",
      details: null,
      subjectId: subject.id,
      requiresReview: false,
      estimatedMinutes: 20,
      isTimeSensitive: false,
      scheduledTime: null,
      reminderMinutesBefore: null,
      recurrence: { frequency: Frequency.weekdays, daysOfWeek: null, interval: 1 },
      endCondition: EndCondition.never,
      endDate: null,
      endCount: null,
    });

    const oldInstance = await prisma.assignmentInstance.findUnique({ where: { id: instance.id } });
    expect(oldInstance).toBeNull();

    const series = await prisma.assignmentSeries.findUniqueOrThrow({
      where: { id: seriesId },
      include: { recurrence: true },
    });
    expect(toISODate(series.startDate)).toBe("2026-08-10");
    expect(series.recurrence?.frequency).toBe(Frequency.weekdays);

    const instances = await prisma.assignmentInstance.findMany({ where: { seriesId } });
    expect(instances.length).toBeGreaterThan(1); // materialized beyond the single original date
    expect(instances.every((i) => i.title === "Reading log" && i.subjectId === subject.id)).toBe(true);
  });

  it("refuses to promote an instance that already belongs to a series", async () => {
    const { series } = await makeWeekdaysSeries(prisma);
    const monday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-03") },
    });

    await expect(
      promoteInstanceToSeries(prisma, monday.id, {
        title: "x",
        details: null,
        subjectId: null,
        requiresReview: false,
        estimatedMinutes: null,
        isTimeSensitive: false,
        scheduledTime: null,
        reminderMinutesBefore: null,
        recurrence: { frequency: Frequency.weekdays, daysOfWeek: null, interval: 1 },
        endCondition: EndCondition.never,
        endDate: null,
        endCount: null,
      })
    ).rejects.toThrow();
  });
});

describe("deleteInstanceOnly", () => {
  it("removes exactly the one row, whatever its status", async () => {
    const { series } = await makeWeekdaysSeries(prisma);
    const wednesday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
    });
    await prisma.assignmentInstance.update({ where: { id: wednesday.id }, data: { status: "done" } });

    await deleteInstanceOnly(prisma, wednesday.id);

    const gone = await prisma.assignmentInstance.findUnique({ where: { id: wednesday.id } });
    expect(gone).toBeNull();
    const siblings = await prisma.assignmentInstance.count({ where: { seriesId: series.id } });
    expect(siblings).toBeGreaterThan(0); // the rest of the series is untouched
  });

  it("doesn't come back when the series re-materializes (regression: deleting a future occurrence used to silently repopulate it)", async () => {
    const { series } = await makeWeekdaysSeries(prisma);
    const wednesday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
    });

    await deleteInstanceOnly(prisma, wednesday.id);
    // Re-run materialization the way a normal page load does (e.g. the next
    // day's extendAllMaterializationHorizons) — this used to recreate the
    // just-deleted date as a fresh open instance.
    await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));

    const resurrected = await prisma.assignmentInstance.findFirst({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
    });
    expect(resurrected).toBeNull();

    // Its neighbors still materialize normally — only that one date is gone.
    const thursday = await prisma.assignmentInstance.findFirst({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-06") },
    });
    expect(thursday).not.toBeNull();
  });
});

describe("deleteSeriesThisAndFollowing", () => {
  it("caps the series and removes future not-yet-resolved instances, keeping done ones", async () => {
    const { series } = await makeWeekdaysSeries(prisma);
    const wednesday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
    });
    const thursday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-06") },
    });
    await prisma.assignmentInstance.update({ where: { id: thursday.id }, data: { status: "done" } });

    await deleteSeriesThisAndFollowing(prisma, wednesday.id);

    const capped = await prisma.assignmentSeries.findUniqueOrThrow({ where: { id: series.id } });
    expect(capped.endCondition).toBe(EndCondition.onDate);
    expect(toISODate(capped.endDate!)).toBe("2026-08-04"); // day before the split

    const remaining = await prisma.assignmentInstance.findMany({
      where: { seriesId: series.id },
      orderBy: { dueDate: "asc" },
    });
    // Mon/Tue survive (before the split), Wed is gone (the split itself),
    // Thu survives because it was already done, nothing beyond that.
    expect(remaining.map((i) => toISODate(i.dueDate!))).toEqual(["2026-08-03", "2026-08-04", "2026-08-06"]);
  });

  it("deletes the whole series when the split is at (or before) its start", async () => {
    const { series } = await makeWeekdaysSeries(prisma);
    const monday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-03") },
    });

    await deleteSeriesThisAndFollowing(prisma, monday.id);

    const gone = await prisma.assignmentSeries.findUnique({ where: { id: series.id } });
    expect(gone).toBeNull();
    const instances = await prisma.assignmentInstance.count({ where: { seriesId: series.id } });
    expect(instances).toBe(0);
  });
});

describe("deleteAllInSeries", () => {
  it("deletes the series entirely when nothing in it is resolved", async () => {
    const { series } = await makeWeekdaysSeries(prisma);

    await deleteAllInSeries(prisma, series.id);

    const gone = await prisma.assignmentSeries.findUnique({ where: { id: series.id } });
    expect(gone).toBeNull();
    const instances = await prisma.assignmentInstance.count({ where: { seriesId: series.id } });
    expect(instances).toBe(0);
  });

  it("keeps the series (capped) and any done instances when some work is already complete", async () => {
    const { series } = await makeWeekdaysSeries(prisma);
    const monday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-03") },
    });
    await prisma.assignmentInstance.update({ where: { id: monday.id }, data: { status: "done" } });

    await deleteAllInSeries(prisma, series.id);

    const capped = await prisma.assignmentSeries.findUniqueOrThrow({ where: { id: series.id } });
    expect(capped.endCondition).toBe(EndCondition.onDate);

    const remaining = await prisma.assignmentInstance.findMany({ where: { seriesId: series.id } });
    expect(remaining.map((i) => i.id)).toEqual([monday.id]);
  });
});
