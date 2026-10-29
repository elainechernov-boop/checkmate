import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { parseISODate } from "./dates";
import { computeStudentStamp } from "./studentStamp";
import { createTestClient, resetDb } from "./test/testDb";
import { makeStudent, makeSubject } from "./test/fixtures";

let prisma: PrismaClient;

beforeEach(async () => {
  prisma = createTestClient();
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

// updatedAt is stamped in whole milliseconds, so an edit made in the same
// millisecond as the row's creation would be invisible to the stamp. Real
// edits are seconds apart; the tests wait a beat to say so.
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const DUE = parseISODate("2026-09-07");

async function makeInstance(studentId: string, subjectId: string, title: string, sortOrder = 0) {
  return prisma.assignmentInstance.create({
    data: { title, studentId, subjectId, createdBy: "parent", dueDate: DUE, originalDueDate: DUE, sortOrder },
  });
}

describe("computeStudentStamp", () => {
  it("is the same until something about the student changes", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    await makeInstance(student.id, subject.id, "Math");

    expect(await computeStudentStamp(prisma, student.id)).toBe(await computeStudentStamp(prisma, student.id));
  });

  it("changes when a parent reorders the day, edits, adds or deletes a task", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const first = await makeInstance(student.id, subject.id, "Math", 0);
    const second = await makeInstance(student.id, subject.id, "Reading", 1);

    let stamp = await computeStudentStamp(prisma, student.id);
    const next = async () => {
      const after = await computeStudentStamp(prisma, student.id);
      expect(after).not.toBe(stamp);
      stamp = after;
    };

    await tick();
    await prisma.assignmentInstance.update({ where: { id: first.id }, data: { sortOrder: 1 } });
    await prisma.assignmentInstance.update({ where: { id: second.id }, data: { sortOrder: 0 } });
    await next();

    await tick();
    await prisma.assignmentInstance.update({ where: { id: first.id }, data: { title: "Math, page 2" } });
    await next();

    await tick();
    const added = await makeInstance(student.id, subject.id, "Science", 2);
    await next();

    await prisma.assignmentInstance.delete({ where: { id: added.id } });
    await next();
  });

  it("changes when a day separator moves, even though only the order is permuted", async () => {
    const student = await makeStudent(prisma);
    const a = await prisma.daySeparator.create({ data: { studentId: student.id, date: DUE, label: "A", sortOrder: 0 } });
    const b = await prisma.daySeparator.create({ data: { studentId: student.id, date: DUE, label: "B", sortOrder: 1 } });
    const before = await computeStudentStamp(prisma, student.id);

    await prisma.daySeparator.update({ where: { id: a.id }, data: { sortOrder: 1 } });
    await prisma.daySeparator.update({ where: { id: b.id }, data: { sortOrder: 0 } });

    expect(await computeStudentStamp(prisma, student.id)).not.toBe(before);
  });

  it("changes when time is logged, but not on a running timer's heartbeat", async () => {
    const student = await makeStudent(prisma);
    const before = await computeStudentStamp(prisma, student.id);

    const startedAt = new Date(Date.UTC(2026, 8, 7, 16, 0, 0));
    const entry = await prisma.timeEntry.create({
      data: { studentId: student.id, title: "Math", date: DUE, startedAt, lastPingAt: startedAt },
    });
    const running = await computeStudentStamp(prisma, student.id);
    expect(running).not.toBe(before);

    await prisma.timeEntry.update({ where: { id: entry.id }, data: { lastPingAt: new Date(startedAt.getTime() + 30_000) } });
    expect(await computeStudentStamp(prisma, student.id)).toBe(running);

    await prisma.timeEntry.update({
      where: { id: entry.id },
      data: { endedAt: new Date(startedAt.getTime() + 60_000), endReason: "paused" },
    });
    expect(await computeStudentStamp(prisma, student.id)).not.toBe(running);
  });

  it("ignores another student's changes", async () => {
    const student = await makeStudent(prisma);
    const sibling = await makeStudent(prisma, { name: "Sibling" });
    const subject = await makeSubject(prisma);
    await makeInstance(student.id, subject.id, "Math");
    const before = await computeStudentStamp(prisma, student.id);

    await tick();
    await makeInstance(sibling.id, subject.id, "Sibling's math");

    expect(await computeStudentStamp(prisma, student.id)).toBe(before);
  });
});
