import { describe, expect, it } from "vitest";
import { InstanceStatus } from "@/generated/prisma/enums";
import { bucketDayInstances, type DisplayInstance } from "./instanceGrouping";

function item(overrides: Partial<DisplayInstance> & { id: string }): DisplayInstance {
  return {
    title: overrides.id,
    status: InstanceStatus.open,
    rolledCount: 0,
    requiresReview: false,
    originalDueDate: null,
    createdAt: new Date(2026, 7, 1),
    sortOrder: 0,
    subject: null,
    projectId: null,
    isTimeSensitive: false,
    scheduledTime: null,
    ...overrides,
  };
}

describe("bucketDayInstances — §12 time-sensitive pinning", () => {
  it("pins time-sensitive open items above ordinary open items, earliest scheduledTime first", () => {
    const latin = item({ id: "latin", isTimeSensitive: true, scheduledTime: "15:00" });
    const coop = item({ id: "coop", isTimeSensitive: true, scheduledTime: "09:00" });
    const homework = item({ id: "homework" });

    const { timeSensitive, open } = bucketDayInstances([homework, latin, coop]);

    expect(timeSensitive.map((i) => i.id)).toEqual(["coop", "latin"]);
    expect(open.map((i) => i.id)).toEqual(["homework"]);
  });

  it("still ranks rolled-forward debts above time-sensitive items", () => {
    const rolledMath = item({ id: "math", rolledCount: 2, originalDueDate: new Date(2026, 7, 1) });
    const latin = item({ id: "latin", isTimeSensitive: true, scheduledTime: "15:00" });

    const { rolled, timeSensitive } = bucketDayInstances([latin, rolledMath]);

    expect(rolled.map((i) => i.id)).toEqual(["math"]);
    expect(timeSensitive.map((i) => i.id)).toEqual(["latin"]);
  });

  it("keeps a rolled time-sensitive item a debt (rolled), not pinned", () => {
    const rolledLatin = item({
      id: "latin",
      isTimeSensitive: true,
      scheduledTime: "15:00",
      rolledCount: 1,
      originalDueDate: new Date(2026, 7, 1),
    });

    const { rolled, timeSensitive } = bucketDayInstances([rolledLatin]);

    expect(rolled.map((i) => i.id)).toEqual(["latin"]);
    expect(timeSensitive).toEqual([]);
  });

  it("never puts a pendingReview or completed item in the time-sensitive bucket", () => {
    const pending = item({ id: "pending", isTimeSensitive: true, scheduledTime: "15:00", status: InstanceStatus.pendingReview });
    const done = item({ id: "done", isTimeSensitive: true, scheduledTime: "15:00", status: InstanceStatus.done });

    const { timeSensitive, pendingReview, completed } = bucketDayInstances([pending, done]);

    expect(timeSensitive).toEqual([]);
    expect(pendingReview.map((i) => i.id)).toEqual(["pending"]);
    expect(completed.map((i) => i.id)).toEqual(["done"]);
  });

  it("sorts pendingReview and completed by sortOrder, matching Parent Mode's own ordering", () => {
    // Passed in out of sortOrder order (e.g. the query's own incidental
    // order) — the bucket itself must still come out sorted, the same way
    // ParentWeekBoard sorts every row (any status) by sortOrder.
    const pendingB = item({ id: "pendingB", status: InstanceStatus.pendingReview, sortOrder: 5 });
    const pendingA = item({ id: "pendingA", status: InstanceStatus.pendingReview, sortOrder: 1 });
    const doneB = item({ id: "doneB", status: InstanceStatus.done, sortOrder: 4 });
    const doneA = item({ id: "doneA", status: InstanceStatus.excused, sortOrder: 0 });

    const { pendingReview, completed } = bucketDayInstances([pendingB, pendingA, doneB, doneA]);

    expect(pendingReview.map((i) => i.id)).toEqual(["pendingA", "pendingB"]);
    expect(completed.map((i) => i.id)).toEqual(["doneA", "doneB"]);
  });
});
