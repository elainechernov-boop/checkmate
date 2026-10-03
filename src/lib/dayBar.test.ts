import { describe, expect, it } from "vitest";
import { InstanceStatus } from "@/generated/prisma/enums";
import { dayBarFill, DAY_BAR_HELD_SHORT, type DayBarTask } from "./dayBar";

const MIN = 60_000;

function task(
  status: InstanceStatus,
  estimatedMinutes: number | null,
  loggedTodayMin = 0,
  loggedEarlierMin = 0
): DayBarTask {
  return { status, estimatedMinutes, loggedTodayMs: loggedTodayMin * MIN, loggedEarlierMs: loggedEarlierMin * MIN };
}

const open = InstanceStatus.open;
const done = InstanceStatus.done;

describe("dayBarFill (§15's day bar)", () => {
  it("is null — no bar — when no task has a real estimate", () => {
    expect(dayBarFill([])).toBeNull();
    expect(dayBarFill([task(open, null, 20), task(done, null)])).toBeNull();
  });

  it("starts at zero and rises as the clock runs on an open task", () => {
    expect(dayBarFill([task(open, 30), task(open, 30)])).toBe(0);
    // 15 of 60 planned minutes worked.
    expect(dayBarFill([task(open, 30, 15), task(open, 30)])).toBeCloseTo(0.25);
  });

  it("is full only when every estimated task is finished", () => {
    expect(dayBarFill([task(done, 30, 30), task(done, 30, 25)])).toBe(1);
    expect(dayBarFill([task(done, 30, 30), task(open, 30, 29)])).toBeLessThan(1);
  });

  it("fills at a task's real pace when it runs over, instead of pinning at 100% while work remains", () => {
    // Math took 55 on a 30 estimate; Latin (30) hasn't started.
    const fill = dayBarFill([task(done, 30, 55), task(open, 30)])!;
    expect(fill).toBeCloseTo(55 / (55 + 30));
    expect(fill).toBeLessThan(1);
  });

  it("holds just short of full while an over-running last task is still open", () => {
    // The only open task has blown past its estimate — nothing 'remaining,' but not done.
    const fill = dayBarFill([task(done, 30, 30), task(open, 30, 90)])!;
    expect(fill).toBe(DAY_BAR_HELD_SHORT);
    expect(fill).toBeLessThan(1);
  });

  it("lets the leftover snap forward when a task finishes early", () => {
    const beforeFinish = dayBarFill([task(open, 30, 10), task(open, 30)])!; // 10 / (10 + 20 + 30)
    const afterFinish = dayBarFill([task(done, 30, 10), task(open, 30)])!; // 10 / (10 + 30)
    expect(beforeFinish).toBeCloseTo(10 / 60);
    expect(afterFinish).toBeCloseTo(10 / 40);
    expect(afterFinish).toBeGreaterThan(beforeFinish);
  });

  it("credits a task finished with no time logged its estimate — work done away from the Mac still counts", () => {
    // 30 min credited for the untimed finish, 30 min still planned.
    expect(dayBarFill([task(done, 30), task(open, 30)])).toBeCloseTo(0.5);
  });

  it("only credits the part of an untimed finish's estimate not already logged on earlier days", () => {
    // Rolled in with 20 of 30 already logged yesterday, finished today untimed: 10 credited.
    expect(dayBarFill([task(done, 30, 0, 20), task(open, 30)])).toBeCloseTo(10 / (10 + 30));
  });

  it("counts only time logged today for a rolled task, and only what's left of its estimate as remaining", () => {
    // 20 of 30 logged yesterday, 5 today: worked 5, remaining 5.
    expect(dayBarFill([task(open, 30, 5, 20)])).toBeCloseTo(0.5);
  });

  it("treats pendingReview and excused as finished, like the bar it replaces", () => {
    expect(dayBarFill([task(InstanceStatus.pendingReview, 30, 20), task(InstanceStatus.excused, 30)])).toBe(1);
  });

  it("leaves tasks without an estimate out of the bar entirely", () => {
    // The unestimated open task neither adds remaining time nor blocks completion.
    expect(dayBarFill([task(done, 30, 30), task(open, null, 45)])).toBe(1);
  });
});
