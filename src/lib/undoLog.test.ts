import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { EndCondition, Frequency, SchoolDayType } from "@/generated/prisma/enums";
import { parseISODate, toISODate } from "./dates";
import { deleteInstanceOnly } from "./assignmentEdits";
import { materializeSeries } from "./materialize";
import { applyRescheduleHelper, findReschedulableInstances } from "./rescheduleHelper";
import { setSchoolDayType } from "./schoolCalendar";
import { UndoError, listRecentUndoLog, recordUndo, undoEntry } from "./undoLog";
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

describe("deleteInstance undo", () => {
  it("recreates a deleted standalone instance exactly as it was", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const due = parseISODate("2026-08-11");
    const instance = await prisma.assignmentInstance.create({
      data: {
        title: "Book report",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        dueDate: due,
        originalDueDate: due,
        status: "open",
        estimatedMinutes: 45,
      },
    });

    await deleteInstanceOnly(prisma, instance.id);
    await recordUndo(prisma, "deleteInstance", `Deleted "${instance.title}"`, {
      instance,
      removedOccurrence: null,
    });

    const goneCheck = await prisma.assignmentInstance.findUnique({ where: { id: instance.id } });
    expect(goneCheck).toBeNull();

    const [entry] = await listRecentUndoLog(prisma);
    await undoEntry(prisma, entry.id);

    const restored = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(restored.title).toBe("Book report");
    expect(restored.estimatedMinutes).toBe(45);
    expect(toISODate(restored.dueDate!)).toBe("2026-08-11");
  });

  it("recreates a deleted recurring occurrence and clears the RemovedOccurrence tombstone", async () => {
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
    const wednesday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
    });

    await deleteInstanceOnly(prisma, wednesday.id);
    await recordUndo(prisma, "deleteInstance", `Deleted "${wednesday.title}"`, {
      instance: wednesday,
      removedOccurrence: { seriesId: series.id, date: wednesday.originalDueDate!.toISOString() },
    });

    expect(await prisma.removedOccurrence.count({ where: { seriesId: series.id } })).toBe(1);

    const [entry] = await listRecentUndoLog(prisma);
    await undoEntry(prisma, entry.id);

    const restored = await prisma.assignmentInstance.findUnique({ where: { id: wednesday.id } });
    expect(restored).not.toBeNull();
    expect(await prisma.removedOccurrence.count({ where: { seriesId: series.id } })).toBe(0);

    // And the series is free to keep generating that date again on its own,
    // proving the tombstone really is gone, not just the log entry.
    await prisma.assignmentInstance.delete({ where: { id: wednesday.id } });
    await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));
    const regenerated = await prisma.assignmentInstance.findFirst({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
    });
    expect(regenerated).not.toBeNull();
  });

  it("rejects undoing the same entry twice", async () => {
    const student = await makeStudent(prisma);
    const instance = await prisma.assignmentInstance.create({
      data: { title: "One-off", studentId: student.id, createdBy: "parent", status: "open" },
    });
    await deleteInstanceOnly(prisma, instance.id);
    await recordUndo(prisma, "deleteInstance", "Deleted", { instance, removedOccurrence: null });

    const [entry] = await listRecentUndoLog(prisma);
    await undoEntry(prisma, entry.id);
    await expect(undoEntry(prisma, entry.id)).rejects.toThrow(UndoError);
  });
});

describe("dayTypeChange undo", () => {
  it("restores the prior school day type (including 'no row existed')", async () => {
    const student = await makeStudent(prisma);
    const date = parseISODate("2026-08-12");

    // No SchoolDay row exists yet — previousType is null.
    await setSchoolDayType(prisma, student.id, date, SchoolDayType.holiday);
    await recordUndo(prisma, "dayTypeChange", "Marked 2026-08-12 as a holiday", {
      schoolDays: [{ studentId: student.id, dateISO: "2026-08-12", previousType: null }],
      movedInstances: [],
    });

    const [entry] = await listRecentUndoLog(prisma);
    await undoEntry(prisma, entry.id);

    const row = await prisma.schoolDay.findUnique({ where: { date_studentId: { date, studentId: student.id } } });
    expect(row).toBeNull(); // back to "no exception recorded"
  });

  it("restores a previously-different type rather than clearing it", async () => {
    const student = await makeStudent(prisma);
    const date = parseISODate("2026-08-12");
    await markSchoolDay(prisma, student.id, date, SchoolDayType.fieldTrip);

    await setSchoolDayType(prisma, student.id, date, SchoolDayType.holiday);
    await recordUndo(prisma, "dayTypeChange", "Changed 2026-08-12 to a holiday", {
      schoolDays: [{ studentId: student.id, dateISO: "2026-08-12", previousType: SchoolDayType.fieldTrip }],
      movedInstances: [],
    });

    const [entry] = await listRecentUndoLog(prisma);
    await undoEntry(prisma, entry.id);

    const row = await prisma.schoolDay.findUniqueOrThrow({ where: { date_studentId: { date, studentId: student.id } } });
    expect(row.type).toBe(SchoolDayType.fieldTrip);
  });

  it("moves a standalone instance back to the day it was auto-rescheduled off of", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const date = parseISODate("2026-08-12"); // Wednesday
    const standalone = await prisma.assignmentInstance.create({
      data: {
        title: "Field trip permission slip",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        dueDate: date,
        originalDueDate: date,
        status: "open",
      },
    });

    // Mirrors what setDayType actually does: snapshot the reschedulable
    // instances' current day before moving them.
    const reschedulable = await findReschedulableInstances(prisma, student.id, date);
    const movedInstances = reschedulable.map((i) => ({
      instanceId: i.id,
      previousDueDate: "2026-08-12",
      previousOriginalDueDate: i.originalDueDate ? toISODate(i.originalDueDate) : null,
    }));
    await setSchoolDayType(prisma, student.id, date, SchoolDayType.holiday);
    await applyRescheduleHelper(prisma, student.id, date, { mode: "nextSchoolDay" });
    await recordUndo(prisma, "dayTypeChange", "Marked 2026-08-12 as a holiday", {
      schoolDays: [{ studentId: student.id, dateISO: "2026-08-12", previousType: null }],
      movedInstances,
    });

    const movedAway = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: standalone.id } });
    expect(toISODate(movedAway.dueDate!)).not.toBe("2026-08-12");

    const [entry] = await listRecentUndoLog(prisma);
    await undoEntry(prisma, entry.id);

    const movedBack = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: standalone.id } });
    expect(toISODate(movedBack.dueDate!)).toBe("2026-08-12");
  });

  it("leaves an instance alone if it's no longer open by the time undo runs", async () => {
    const student = await makeStudent(prisma);
    const instance = await prisma.assignmentInstance.create({
      data: {
        title: "Reading",
        studentId: student.id,
        createdBy: "parent",
        dueDate: parseISODate("2026-08-13"),
        originalDueDate: parseISODate("2026-08-12"),
        status: "done", // completed since the move — shouldn't be yanked back
        completedAt: parseISODate("2026-08-13"),
      },
    });
    await recordUndo(prisma, "dayTypeChange", "Marked 2026-08-12 as a holiday", {
      schoolDays: [{ studentId: student.id, dateISO: "2026-08-12", previousType: null }],
      movedInstances: [{ instanceId: instance.id, previousDueDate: "2026-08-12", previousOriginalDueDate: "2026-08-12" }],
    });

    const [entry] = await listRecentUndoLog(prisma);
    await undoEntry(prisma, entry.id);

    const stillDone = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(stillDone.status).toBe("done");
    expect(toISODate(stillDone.dueDate!)).toBe("2026-08-13"); // untouched
  });
});

describe("recordUndo pruning", () => {
  it("keeps only the most recent 20 entries", async () => {
    const student = await makeStudent(prisma);
    for (let i = 0; i < 25; i++) {
      const instance = await prisma.assignmentInstance.create({
        data: { title: `Item ${i}`, studentId: student.id, createdBy: "parent", status: "open" },
      });
      await recordUndo(prisma, "deleteInstance", `Deleted "Item ${i}"`, { instance, removedOccurrence: null });
    }

    const all = await prisma.undoLogEntry.count();
    expect(all).toBe(20);

    const log = await listRecentUndoLog(prisma);
    expect(log[0].summary).toBe('Deleted "Item 24"'); // newest first
    expect(log.at(-1)!.summary).toBe('Deleted "Item 5"'); // oldest 5 pruned
  });
});
