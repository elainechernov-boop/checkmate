import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { applyRescheduleHelper, findReschedulableInstances } from "./rescheduleHelper";
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

async function makeOpenInstance(studentId: string, subjectId: string, title: string, dueDate: Date) {
  return prisma.assignmentInstance.create({
    data: {
      title,
      studentId,
      subjectId,
      createdBy: "parent",
      dueDate,
      originalDueDate: dueDate,
      status: "open",
    },
  });
}

describe("findReschedulableInstances", () => {
  it("finds only open instances due exactly on that date", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const tuesday = parseISODate("2026-08-11");
    const open = await makeOpenInstance(student.id, subject.id, "Latin", tuesday);
    await makeOpenInstance(student.id, subject.id, "Wednesday item", parseISODate("2026-08-12"));
    await prisma.assignmentInstance.create({
      data: {
        title: "Already done",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        dueDate: tuesday,
        originalDueDate: tuesday,
        status: "done",
      },
    });

    const found = await findReschedulableInstances(prisma, student.id, tuesday);
    expect(found.map((i) => i.id)).toEqual([open.id]);
  });
});

describe("applyRescheduleHelper", () => {
  it("nextSchoolDay: skips a marked-off day and lands on the next valid school day", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const tuesday = parseISODate("2026-08-11");
    const wednesday = parseISODate("2026-08-12");
    await markSchoolDay(prisma, student.id, tuesday, "fieldTrip");
    await markSchoolDay(prisma, student.id, wednesday, "sick");
    const item = await makeOpenInstance(student.id, subject.id, "Latin", tuesday);

    await applyRescheduleHelper(prisma, student.id, tuesday, { mode: "nextSchoolDay" });

    const moved = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: item.id } });
    expect(toISODate(moved.dueDate!)).toBe("2026-08-13"); // Thursday — Wednesday is also blocked
  });

  it("chosenDate: moves every reschedulable item to the given date", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const tuesday = parseISODate("2026-08-11");
    const a = await makeOpenInstance(student.id, subject.id, "Latin", tuesday);
    const b = await makeOpenInstance(student.id, subject.id, "History", tuesday);

    await applyRescheduleHelper(prisma, student.id, tuesday, { mode: "chosenDate", date: parseISODate("2026-08-20") });

    for (const id of [a.id, b.id]) {
      const moved = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id } });
      expect(toISODate(moved.dueDate!)).toBe("2026-08-20");
    }
  });

  it("distribute: round-robins across the week's other unblocked days", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const tuesday = parseISODate("2026-08-11"); // week of Mon 8/10
    await markSchoolDay(prisma, student.id, tuesday, "fieldTrip");
    const a = await makeOpenInstance(student.id, subject.id, "A", tuesday);
    const b = await makeOpenInstance(student.id, subject.id, "B", tuesday);
    const c = await makeOpenInstance(student.id, subject.id, "C", tuesday);

    await applyRescheduleHelper(prisma, student.id, tuesday, { mode: "distribute" });

    const [movedA, movedB, movedC] = await Promise.all(
      [a.id, b.id, c.id].map((id) => prisma.assignmentInstance.findUniqueOrThrow({ where: { id } }))
    );
    // Mon 8/10, Wed 8/12, Thu 8/13, Fri 8/14, Sat 8/15 are the candidates
    // (Tuesday itself is excluded); round-robin lands the first three there.
    expect(toISODate(movedA.dueDate!)).toBe("2026-08-10");
    expect(toISODate(movedB.dueDate!)).toBe("2026-08-12");
    expect(toISODate(movedC.dueDate!)).toBe("2026-08-13");
  });

  it("does nothing when there's nothing reschedulable that day", async () => {
    const student = await makeStudent(prisma);
    const tuesday = parseISODate("2026-08-11");
    await expect(applyRescheduleHelper(prisma, student.id, tuesday, { mode: "nextSchoolDay" })).resolves.toBeUndefined();
  });
});
