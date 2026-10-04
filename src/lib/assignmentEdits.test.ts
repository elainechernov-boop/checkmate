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
import { tenantScopeExtension } from "./tenantScope";
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
  it("creates a series starting at the instance's due date, with the standalone row as its first occurrence", async () => {
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

    // The standalone row isn't deleted and regenerated (that would drop it to the bottom of its day) — it joins the series.
    const adopted = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(adopted.seriesId).toBe(seriesId);

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

// §14: order within a day is the parent's call, and it stays put. Editing a
// task is never a reason for it to move — these pin down every edit path that
// used to delete a row and regenerate it (a regenerated row lands at the
// bottom of its day, and orphans whatever pointed at the old one).
describe("editing a task leaves it where the parent put it (§14)", () => {
  async function addOneOff(studentId: string, title: string, dateISO: string, sortOrder: number) {
    return prisma.assignmentInstance.create({
      data: {
        title,
        studentId,
        createdBy: "parent",
        dueDate: parseISODate(dateISO),
        originalDueDate: parseISODate(dateISO),
        sortOrder,
      },
    });
  }

  /** The day's titles in the order the board shows them. */
  async function dayTitles(studentId: string, dateISO: string) {
    const rows = await prisma.assignmentInstance.findMany({
      where: { studentId, dueDate: parseISODate(dateISO) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => row.title);
  }

  const WEEK = ["2026-08-05", "2026-08-06", "2026-08-07"];

  /** A weekdays series whose Wed-Fri occurrences sit in the MIDDLE of their day. */
  async function seriesInTheMiddle() {
    const made = await makeWeekdaysSeries(prisma);
    for (const date of WEEK) {
      await prisma.assignmentInstance.updateMany({
        where: { seriesId: made.series.id, dueDate: parseISODate(date) },
        data: { sortOrder: 1 },
      });
      await addOneOff(made.student.id, "First", date, 0);
      await addOneOff(made.student.id, "Last", date, 2);
    }
    return made;
  }

  describe("'this and following'", () => {
    it("keeps every affected occurrence in the slot the parent left it, on every day", async () => {
      const { series, student } = await seriesInTheMiddle();
      const wednesday = await prisma.assignmentInstance.findFirstOrThrow({
        where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
      });

      await editSeriesThisAndFollowing(prisma, wednesday.id, { title: "Math packet v2" });

      for (const date of WEEK) {
        expect(await dayTitles(student.id, date)).toEqual(["First", "Math packet v2", "Last"]);
      }
    });

    it("keeps the edited row itself — same id, status, and linked time — instead of replacing it", async () => {
      const { series, student } = await seriesInTheMiddle();
      const wednesday = await prisma.assignmentInstance.findFirstOrThrow({
        where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
      });
      const run = await prisma.timeEntry.create({
        data: {
          studentId: student.id,
          instanceId: wednesday.id,
          title: wednesday.title,
          date: parseISODate("2026-08-05"),
          startedAt: new Date("2026-08-05T16:00:00Z"),
          endedAt: new Date("2026-08-05T16:20:00Z"),
          lastPingAt: new Date("2026-08-05T16:20:00Z"),
          endReason: "paused",
        },
      });

      const result = await editSeriesThisAndFollowing(prisma, wednesday.id, { title: "Math packet v2" });
      const newSeriesId = (result as { newSeriesId: string }).newSeriesId;

      const after = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: wednesday.id } });
      expect(after.seriesId).toBe(newSeriesId);
      expect(after.title).toBe("Math packet v2");
      expect(after.isOverride).toBe(false);
      expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: run.id } })).instanceId).toBe(wednesday.id);
    });

    it("leaves a task that's already done as done", async () => {
      const { series } = await seriesInTheMiddle();
      const thursday = await prisma.assignmentInstance.findFirstOrThrow({
        where: { seriesId: series.id, dueDate: parseISODate("2026-08-06") },
      });
      await prisma.assignmentInstance.update({
        where: { id: thursday.id },
        data: { status: "done", completedAt: new Date("2026-08-06T20:00:00Z") },
      });

      await editSeriesThisAndFollowing(
        prisma,
        (await prisma.assignmentInstance.findFirstOrThrow({ where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") } })).id,
        { title: "Math packet v2" }
      );

      const after = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: thursday.id } });
      expect(after.status).toBe("done");
      expect(after.completedAt).not.toBeNull();
    });

    it("doesn't duplicate an occurrence that was individually edited, or one that's already done", async () => {
      const { series, student } = await seriesInTheMiddle();
      await prisma.assignmentInstance.updateMany({
        where: { seriesId: series.id, dueDate: parseISODate("2026-08-07") },
        data: { title: "Quiz", isOverride: true },
      });
      const wednesday = await prisma.assignmentInstance.findFirstOrThrow({
        where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
      });

      await editSeriesThisAndFollowing(prisma, wednesday.id, { title: "Math packet v2" });

      expect(await dayTitles(student.id, "2026-08-07")).toEqual(["First", "Quiz", "Last"]);
    });

    it("keeps a rolled-forward task and its roll mark, alongside the day's own occurrence", async () => {
      const { series, student } = await makeWeekdaysSeries(prisma);
      // Monday's task rolled onto Wednesday (rolled twice); Wednesday also has its own.
      const rolled = await prisma.assignmentInstance.findFirstOrThrow({
        where: { seriesId: series.id, dueDate: parseISODate("2026-08-03") },
      });
      await prisma.assignmentInstance.update({
        where: { id: rolled.id },
        data: { dueDate: parseISODate("2026-08-05"), rolledCount: 2, sortOrder: 0 },
      });
      await prisma.assignmentInstance.updateMany({
        where: { seriesId: series.id, dueDate: parseISODate("2026-08-05"), id: { not: rolled.id } },
        data: { sortOrder: 1 },
      });

      await editSeriesThisAndFollowing(prisma, rolled.id, { title: "Math packet v2" });

      const wednesdayRows = await prisma.assignmentInstance.findMany({
        where: { studentId: student.id, dueDate: parseISODate("2026-08-05") },
        orderBy: { sortOrder: "asc" },
      });
      expect(wednesdayRows).toHaveLength(2);
      expect(wednesdayRows[0].id).toBe(rolled.id);
      expect(wednesdayRows[0].rolledCount).toBe(2);
      expect(wednesdayRows.map((r) => r.title)).toEqual(["Math packet v2", "Math packet v2"]);
    });

    it("passes the series' remembered position on, so days that generate later land there too", async () => {
      const { series } = await makeWeekdaysSeries(prisma);
      await prisma.assignmentSeries.update({ where: { id: series.id }, data: { sortOrder: 2 } });
      const wednesday = await prisma.assignmentInstance.findFirstOrThrow({
        where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
      });

      const result = await editSeriesThisAndFollowing(prisma, wednesday.id, { title: "Math packet v2" });

      const newSeries = await prisma.assignmentSeries.findUniqueOrThrow({
        where: { id: (result as { newSeriesId: string }).newSeriesId },
      });
      expect(newSeries.sortOrder).toBe(2);
    });
  });

  describe("adding a repeat to a one-off", () => {
    const fields = {
      title: "Reading log",
      details: null,
      subjectId: null,
      requiresReview: false,
      estimatedMinutes: 20,
      isTimeSensitive: false,
      scheduledTime: null,
      reminderMinutesBefore: null,
      recurrence: { frequency: Frequency.weekdays, daysOfWeek: null, interval: 1 },
      endCondition: EndCondition.never,
      endDate: null,
      endCount: null,
    };

    it("keeps the task where it was on its day, as the series' first occurrence", async () => {
      const student = await makeStudent(prisma);
      await addOneOff(student.id, "First", "2026-08-10", 0);
      const middle = await addOneOff(student.id, "Reading log", "2026-08-10", 1);
      await addOneOff(student.id, "Last", "2026-08-10", 2);

      const { seriesId } = await promoteInstanceToSeries(prisma, middle.id, fields);

      expect(await dayTitles(student.id, "2026-08-10")).toEqual(["First", "Reading log", "Last"]);
      const adopted = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: middle.id } });
      expect(adopted.seriesId).toBe(seriesId);
      expect(adopted.estimatedMinutes).toBe(20);
      // ...and the repeat didn't double it up on its own day.
      expect(await prisma.assignmentInstance.count({ where: { seriesId, dueDate: parseISODate("2026-08-10") } })).toBe(1);
    });

    it("keeps the task's status and linked time", async () => {
      const student = await makeStudent(prisma);
      const task = await addOneOff(student.id, "Reading log", "2026-08-10", 0);
      await prisma.assignmentInstance.update({ where: { id: task.id }, data: { status: "done", completedAt: new Date("2026-08-10T20:00:00Z") } });
      const run = await prisma.timeEntry.create({
        data: {
          studentId: student.id,
          instanceId: task.id,
          title: "Reading log",
          date: parseISODate("2026-08-10"),
          startedAt: new Date("2026-08-10T16:00:00Z"),
          endedAt: new Date("2026-08-10T16:20:00Z"),
          lastPingAt: new Date("2026-08-10T16:20:00Z"),
          endReason: "finished",
        },
      });

      await promoteInstanceToSeries(prisma, task.id, fields);

      expect((await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("done");
      expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: run.id } })).instanceId).toBe(task.id);
    });
  });

  describe("through the tenant-scoped client the app actually uses", () => {
    it("'this and following' and adding a repeat both still keep their place", async () => {
      // Same code path as production: every query is scoped to the family.
      const scoped = prisma.$extends(tenantScopeExtension("seed-family")) as unknown as PrismaClient;
      const { series, student } = await seriesInTheMiddle();
      const wednesday = await prisma.assignmentInstance.findFirstOrThrow({
        where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
      });

      await editSeriesThisAndFollowing(scoped, wednesday.id, { title: "Math packet v2" });

      for (const date of WEEK) {
        expect(await dayTitles(student.id, date)).toEqual(["First", "Math packet v2", "Last"]);
      }

      // A Monday well past the edited series' 60-day horizon, so nothing else lands on it.
      await addOneOff(student.id, "Mon first", "2026-11-02", 0);
      const middle = await addOneOff(student.id, "Reading log", "2026-11-02", 1);
      await addOneOff(student.id, "Mon last", "2026-11-02", 2);
      await promoteInstanceToSeries(scoped, middle.id, {
        title: "Reading log",
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
      });
      expect(await dayTitles(student.id, "2026-11-02")).toEqual(["Mon first", "Reading log", "Mon last"]);
    });
  });

  describe("moving a task to another day", () => {
    /** Tuesday already has two rows the parent arranged; Monday's task was first on its own day. */
    async function monAndTue() {
      const student = await makeStudent(prisma);
      const moving = await addOneOff(student.id, "Moving", "2026-08-10", 0);
      await addOneOff(student.id, "Tue first", "2026-08-11", 0);
      await addOneOff(student.id, "Tue second", "2026-08-11", 1);
      return { student, moving };
    }

    it("a dragged one-off lands at the bottom of its new day, not in its old slot", async () => {
      const { student, moving } = await monAndTue();

      await rescheduleInstance(prisma, moving.id, parseISODate("2026-08-11"));

      expect(await dayTitles(student.id, "2026-08-11")).toEqual(["Tue first", "Tue second", "Moving"]);
    });

    it("a dragged occurrence of a series does too, and the rest of the series stays put", async () => {
      const { series, student } = await makeWeekdaysSeries(prisma);
      // Tuesday already has its own occurrence (slot 0) plus a one-off the parent put after it (slot 1).
      await addOneOff(student.id, "Tue one-off", "2026-08-04", 1);
      const tuesdayOwn = await prisma.assignmentInstance.findFirstOrThrow({
        where: { seriesId: series.id, dueDate: parseISODate("2026-08-04") },
      });
      const monday = await prisma.assignmentInstance.findFirstOrThrow({
        where: { seriesId: series.id, dueDate: parseISODate("2026-08-03") },
      });
      const wednesdayBefore = await prisma.assignmentInstance.findFirstOrThrow({
        where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
      });

      await rescheduleInstance(prisma, monday.id, parseISODate("2026-08-04"));

      const moved = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: monday.id } });
      expect(moved.sortOrder).toBe(2); // after the occurrence (0) and the one-off (1)
      expect((await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: tuesdayOwn.id } })).sortOrder).toBe(0);
      expect((await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: wednesdayBefore.id } })).sortOrder).toBe(
        wednesdayBefore.sortOrder
      );
    });

    it("changing the date in the edit panel behaves the same way", async () => {
      const { student, moving } = await monAndTue();

      await editInstanceOnly(prisma, moving.id, { title: "Moving (edited)", dueDate: parseISODate("2026-08-11") });

      expect(await dayTitles(student.id, "2026-08-11")).toEqual(["Tue first", "Tue second", "Moving (edited)"]);
    });

    it("leaves the day it lands on exactly as the parent arranged it", async () => {
      const { student, moving } = await monAndTue();
      const before = await prisma.assignmentInstance.findMany({ where: { studentId: student.id, dueDate: parseISODate("2026-08-11") } });

      await rescheduleInstance(prisma, moving.id, parseISODate("2026-08-11"));

      for (const row of before) {
        const after = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: row.id } });
        expect(after.sortOrder).toBe(row.sortOrder);
      }
    });

    it("counts a divider when finding the bottom of the day", async () => {
      const { student, moving } = await monAndTue();
      await prisma.daySeparator.create({ data: { studentId: student.id, date: parseISODate("2026-08-11"), label: "Afternoon", sortOrder: 7 } });

      await rescheduleInstance(prisma, moving.id, parseISODate("2026-08-11"));

      expect((await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: moving.id } })).sortOrder).toBe(8);
    });

    it("'move to the same day' is a no-op that doesn't shuffle anything", async () => {
      const { student, moving } = await monAndTue();
      await addOneOff(student.id, "Mon second", "2026-08-10", 1);

      await rescheduleInstance(prisma, moving.id, parseISODate("2026-08-10"));

      expect(await dayTitles(student.id, "2026-08-10")).toEqual(["Moving", "Mon second"]);
    });
  });

  describe("'this assignment only'", () => {
    it("saving without changing the date leaves a rolled task's roll history alone", async () => {
      const { series } = await makeWeekdaysSeries(prisma);
      const rolled = await prisma.assignmentInstance.findFirstOrThrow({
        where: { seriesId: series.id, dueDate: parseISODate("2026-08-03") },
      });
      await prisma.assignmentInstance.update({
        where: { id: rolled.id },
        data: { dueDate: parseISODate("2026-08-05"), rolledCount: 2, sortOrder: 4 },
      });

      // The edit panel submits the date field every time, changed or not.
      await editInstanceOnly(prisma, rolled.id, { title: "Math worksheet (redo)", dueDate: parseISODate("2026-08-05") });

      const after = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: rolled.id } });
      expect(after.title).toBe("Math worksheet (redo)");
      expect(toISODate(after.originalDueDate!)).toBe("2026-08-03"); // still the day it was first due
      expect(after.rolledCount).toBe(2);
      expect(after.sortOrder).toBe(4);
    });
  });
});
