import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { buildHSTReport } from "./hstReport";
import { parseISODate } from "./dates";
import { makeStudent } from "./test/fixtures";
import { createTestClient, resetDb } from "./test/testDb";

let prisma: PrismaClient;

beforeEach(async () => {
  prisma = createTestClient();
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

async function makeSubject(
  prisma: PrismaClient,
  name: string,
  workSampleCategory: "math" | "languageArts" | "science" | "socialStudies" | "none"
) {
  return prisma.subject.create({ data: { name, workSampleCategory, isFaithIntegrated: false } });
}

async function makeDoneInstance(
  prisma: PrismaClient,
  studentId: string,
  subjectId: string | null,
  title: string,
  estimatedMinutes: number,
  completedAt: Date
) {
  return prisma.assignmentInstance.create({
    data: {
      title,
      studentId,
      subjectId,
      createdBy: "parent",
      status: "done",
      estimatedMinutes,
      completedAt,
      dueDate: completedAt,
      originalDueDate: completedAt,
    },
  });
}

describe("buildHSTReport", () => {
  it("sums estimated minutes per HST category, ignoring subjects tagged 'none' and work outside the LP window", async () => {
    const student = await makeStudent(prisma);
    const math = await makeSubject(prisma, "Math", "math");
    const ela = await makeSubject(prisma, "ELA", "languageArts");
    const latin = await makeSubject(prisma, "Latin", "none");

    const lp = await prisma.learningPeriod.create({
      data: { name: "LP1", startDate: parseISODate("2026-08-01"), endDate: parseISODate("2026-08-31") },
    });

    await makeDoneInstance(prisma, student.id, math.id, "Worksheet 1", 30, parseISODate("2026-08-05"));
    await makeDoneInstance(prisma, student.id, math.id, "Worksheet 2", 45, parseISODate("2026-08-10"));
    await makeDoneInstance(prisma, student.id, ela.id, "Reading", 60, parseISODate("2026-08-12"));
    await makeDoneInstance(prisma, student.id, latin.id, "Vulgate reading", 20, parseISODate("2026-08-12"));
    // Outside the LP window — should not count.
    await makeDoneInstance(prisma, student.id, math.id, "September worksheet", 30, parseISODate("2026-09-05"));

    const report = await buildHSTReport(prisma, student.id, lp.id);

    const byCategory = Object.fromEntries(report.hoursByCategory.map((c) => [c.category, c.minutes]));
    expect(byCategory.math).toBe(75);
    expect(byCategory.languageArts).toBe(60);
    expect(byCategory.science).toBe(0);
    expect(byCategory.socialStudies).toBe(0);
    // Every category present, in a fixed order, even when zero.
    expect(report.hoursByCategory.map((c) => c.category)).toEqual(["math", "languageArts", "science", "socialStudies"]);
  });

  it("still lists Latin (category 'none') in the completed-work-by-subject log, just not in hoursByCategory", async () => {
    const student = await makeStudent(prisma);
    const latin = await makeSubject(prisma, "Latin", "none");
    const lp = await prisma.learningPeriod.create({
      data: { name: "LP1", startDate: parseISODate("2026-08-01"), endDate: parseISODate("2026-08-31") },
    });
    await makeDoneInstance(prisma, student.id, latin.id, "Vulgate reading", 20, parseISODate("2026-08-12"));

    const report = await buildHSTReport(prisma, student.id, lp.id);

    expect(report.completedBySubject).toHaveLength(1);
    expect(report.completedBySubject[0].subjectName).toBe("Latin");
    expect(report.hoursByCategory.every((c) => c.minutes === 0)).toBe(true);
  });
});
