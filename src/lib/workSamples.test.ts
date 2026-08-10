import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { setAttendanceClaimed } from "./attendance";
import { parseISODate } from "./dates";
import { flagWorkSample, unflagWorkSample, WorkSampleIneligibleError } from "./workSamples";
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

async function makeSubject(overrides: Partial<{ name: string; workSampleCategory: string; isFaithIntegrated: boolean }> = {}) {
  return prisma.subject.create({
    data: {
      name: overrides.name ?? "Math",
      workSampleCategory: (overrides.workSampleCategory as never) ?? "math",
      isFaithIntegrated: overrides.isFaithIntegrated ?? false,
    },
  });
}

async function makeDoneInstance(studentId: string, subjectId: string | null, dueDate: Date) {
  return prisma.assignmentInstance.create({
    data: {
      title: "Fractions worksheet",
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

async function makeLP(startDate: Date, endDate: Date) {
  return prisma.learningPeriod.create({ data: { name: "LP1", startDate, endDate } });
}

describe("flagWorkSample eligibility (§8)", () => {
  it("hard-blocks a faith-integrated subject, and says why", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject({ name: "Handwriting", isFaithIntegrated: true, workSampleCategory: "languageArts" });
    const instance = await makeDoneInstance(student.id, subject.id, parseISODate("2026-08-10"));
    await makeLP(parseISODate("2026-08-01"), parseISODate("2026-08-20"));
    await setAttendanceClaimed(prisma, student.id, parseISODate("2026-08-10"), true);

    await expect(flagWorkSample(prisma, instance.id, null, false)).rejects.toThrow(WorkSampleIneligibleError);
    const after = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(after.isWorkSample).toBe(false);
  });

  it("hard-blocks a subject with no eligible work-sample category", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject({ name: "Scouts", workSampleCategory: "none" });
    const instance = await makeDoneInstance(student.id, subject.id, parseISODate("2026-08-10"));
    await makeLP(parseISODate("2026-08-01"), parseISODate("2026-08-20"));
    await setAttendanceClaimed(prisma, student.id, parseISODate("2026-08-10"), true);

    await expect(flagWorkSample(prisma, instance.id, null, false)).rejects.toThrow(WorkSampleIneligibleError);
  });

  it("warns (but doesn't block outright) when the day isn't marked present — and allows it once acknowledged", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject();
    const instance = await makeDoneInstance(student.id, subject.id, parseISODate("2026-08-10"));
    await makeLP(parseISODate("2026-08-01"), parseISODate("2026-08-20"));
    // Deliberately not marking Aug 10 present.

    await expect(flagWorkSample(prisma, instance.id, null, false)).rejects.toThrow(WorkSampleIneligibleError);

    await flagWorkSample(prisma, instance.id, "best long division yet", true);
    const after = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(after.isWorkSample).toBe(true);
    expect(after.workSampleNote).toBe("best long division yet");
  });

  it("flags cleanly when subject, LP, and attendance all line up", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject();
    const instance = await makeDoneInstance(student.id, subject.id, parseISODate("2026-08-10"));
    await makeLP(parseISODate("2026-08-01"), parseISODate("2026-08-20"));
    await setAttendanceClaimed(prisma, student.id, parseISODate("2026-08-10"), true);

    await flagWorkSample(prisma, instance.id, null, false);
    const after = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(after.isWorkSample).toBe(true);
  });

  it("unflagWorkSample clears both the flag and the note", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject();
    const instance = await makeDoneInstance(student.id, subject.id, parseISODate("2026-08-10"));
    await makeLP(parseISODate("2026-08-01"), parseISODate("2026-08-20"));
    await setAttendanceClaimed(prisma, student.id, parseISODate("2026-08-10"), true);
    await flagWorkSample(prisma, instance.id, "great work", false);

    await unflagWorkSample(prisma, instance.id);
    const after = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(after.isWorkSample).toBe(false);
    expect(after.workSampleNote).toBeNull();
  });
});
