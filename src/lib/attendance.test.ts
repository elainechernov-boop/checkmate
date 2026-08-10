import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  loadAttendanceRange,
  setAttendanceClaimed,
  setLearningPeriodAttendanceClaimed,
  summarizeAttendance,
} from "./attendance";
import { parseISODate, toISODate } from "./dates";
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

async function makeDoneInstance(studentId: string, subjectId: string, dueDate: Date) {
  return prisma.assignmentInstance.create({
    data: {
      title: "Math worksheet",
      studentId,
      subjectId,
      createdBy: "parent",
      dueDate,
      originalDueDate: dueDate,
      status: "done",
      completedAt: dueDate,
    },
  });
}

describe("loadAttendanceRange (§8 auto-suggest)", () => {
  it("auto-suggests present on a day with a completed parent-assigned instance, not on one without", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const monday = parseISODate("2026-08-10");
    const tuesday = parseISODate("2026-08-11");
    await makeDoneInstance(student.id, subject.id, monday);

    const days = await loadAttendanceRange(prisma, student.id, monday, tuesday);

    expect(days.find((d) => toISODate(d.date) === "2026-08-10")?.autoSuggested).toBe(true);
    expect(days.find((d) => toISODate(d.date) === "2026-08-11")?.autoSuggested).toBe(false);
  });

  it("excludes offDay/sick/holiday from the countable school-day total, but not a field trip", async () => {
    const student = await makeStudent(prisma);
    const start = parseISODate("2026-08-10");
    const end = parseISODate("2026-08-14");
    await markSchoolDay(prisma, parseISODate("2026-08-11"), "offDay");
    await markSchoolDay(prisma, parseISODate("2026-08-12"), "sick");
    await markSchoolDay(prisma, parseISODate("2026-08-13"), "holiday");
    await markSchoolDay(prisma, parseISODate("2026-08-14"), "fieldTrip");

    const days = await loadAttendanceRange(prisma, student.id, start, end);
    const summary = summarizeAttendance(days);

    // Aug 10 (ordinary) + Aug 14 (field trip) count; the other three don't.
    expect(summary.schoolDayCount).toBe(2);
  });

  it("never counts a Sunday, even if its SchoolDay row is explicitly typed schoolDay", async () => {
    const student = await makeStudent(prisma);
    const sunday = parseISODate("2026-08-09");
    await markSchoolDay(prisma, sunday, "schoolDay");

    const days = await loadAttendanceRange(prisma, student.id, sunday, sunday);
    expect(days[0].countable).toBe(false);
  });

  it("a day's claimed flag is exactly its persisted attendanceClaimed value", async () => {
    const student = await makeStudent(prisma);
    const day = parseISODate("2026-08-10");
    await setAttendanceClaimed(prisma, day, true);

    const days = await loadAttendanceRange(prisma, student.id, day, day);
    expect(days[0].claimed).toBe(true);

    await setAttendanceClaimed(prisma, day, false);
    const daysAfter = await loadAttendanceRange(prisma, student.id, day, day);
    expect(daysAfter[0].claimed).toBe(false);
  });
});

describe("setLearningPeriodAttendanceClaimed (§8 per-LP claimed checkbox)", () => {
  it("bulk-claims every day in the range, reflected in allClaimed", async () => {
    const student = await makeStudent(prisma);
    const start = parseISODate("2026-08-10");
    const end = parseISODate("2026-08-12");

    let days = await loadAttendanceRange(prisma, student.id, start, end);
    expect(summarizeAttendance(days).allClaimed).toBe(false);

    await setLearningPeriodAttendanceClaimed(prisma, start, end, true);
    days = await loadAttendanceRange(prisma, student.id, start, end);
    expect(summarizeAttendance(days).allClaimed).toBe(true);
    expect(summarizeAttendance(days).presentCount).toBe(3);
  });
});
