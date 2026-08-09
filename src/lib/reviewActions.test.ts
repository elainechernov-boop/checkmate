import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { approveReview, attendanceDateFor, returnReview } from "./reviewActions";
import { parseISODate } from "./dates";
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

async function makePendingReviewInstance(studentId: string, subjectId: string, completedAt: Date) {
  return prisma.assignmentInstance.create({
    data: {
      title: "Show Mom",
      studentId,
      subjectId,
      createdBy: "parent",
      dueDate: parseISODate("2026-08-10"),
      originalDueDate: parseISODate("2026-08-10"),
      status: "pendingReview",
      requiresReview: true,
      completedAt,
    },
  });
}

describe("approveReview (§5 step 2-3: parent sign-off)", () => {
  it("moves pendingReview to done and stamps reviewedAt, which then feeds the attendance date", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const completedAt = new Date(Date.now() - 60_000); // safely in the past
    const pending = await makePendingReviewInstance(student.id, subject.id, completedAt);

    await approveReview(prisma, pending.id);

    const approved = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: pending.id } });
    expect(approved.status).toBe("done");
    expect(approved.reviewedAt).not.toBeNull();
    expect(approved.completedAt?.getTime()).toBe(completedAt.getTime());

    // reviewedAt is later than completedAt, so it's the one that should
    // feed the attendance log (§3).
    expect(approved.reviewedAt!.getTime()).toBeGreaterThan(approved.completedAt!.getTime());
    expect(attendanceDateFor(approved)?.getTime()).toBe(approved.reviewedAt!.getTime());
  });

  it("refuses to approve an item that isn't pendingReview", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const open = await prisma.assignmentInstance.create({
      data: {
        title: "Not shown yet",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        dueDate: parseISODate("2026-08-10"),
        originalDueDate: parseISODate("2026-08-10"),
        status: "open",
      },
    });

    await expect(approveReview(prisma, open.id)).rejects.toThrow();
  });
});

describe("returnReview (§5 step 4: 'not your best work')", () => {
  it("reopens the item with its note and clears both review timestamps", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const pending = await makePendingReviewInstance(student.id, subject.id, new Date("2026-08-10T14:00:00.000Z"));

    await returnReview(prisma, pending.id, "Redo the last two problems");

    const returned = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: pending.id } });
    expect(returned.status).toBe("open");
    expect(returned.returnNote).toBe("Redo the last two problems");
    expect(returned.completedAt).toBeNull();
    expect(returned.reviewedAt).toBeNull();
  });

  it("stores a blank note as null", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const pending = await makePendingReviewInstance(student.id, subject.id, new Date());

    await returnReview(prisma, pending.id, "   ");

    const returned = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: pending.id } });
    expect(returned.returnNote).toBeNull();
  });
});

describe("attendanceDateFor", () => {
  it("falls back to completedAt when there's no review", () => {
    const completedAt = new Date("2026-08-10T14:00:00.000Z");
    expect(attendanceDateFor({ completedAt, reviewedAt: null })?.getTime()).toBe(completedAt.getTime());
  });

  it("is null for an item that's neither completed nor reviewed", () => {
    expect(attendanceDateFor({ completedAt: null, reviewedAt: null })).toBeNull();
  });
});
