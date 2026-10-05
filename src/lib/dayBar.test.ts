import { describe, expect, it } from "vitest";
import { InstanceStatus } from "@/generated/prisma/enums";
import { dayBarFill, dayBarTasksFor, DAY_BAR_HELD_SHORT, splitLoggedTime, type DayBarTask } from "./dayBar";

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

describe("dayBarTasksFor", () => {
  const timeLog = {
    rolled: { "2026-09-07": 20 * MIN, "2026-09-08": 5 * MIN, "2026-09-09": 99 * MIN },
    plain: { "2026-09-08": 12 * MIN },
  };

  it("splits each task's log into today's time and everything earlier — and ignores later days", () => {
    const [rolled, plain, untimed] = dayBarTasksFor(
      [
        { id: "rolled", status: open, estimatedMinutes: 30 },
        { id: "plain", status: done, estimatedMinutes: 20 },
        { id: "untimed", status: open, estimatedMinutes: 10 },
      ],
      timeLog,
      "2026-09-08"
    );

    expect(rolled).toMatchObject({ loggedTodayMs: 5 * MIN, loggedEarlierMs: 20 * MIN, estimatedMinutes: 30 });
    expect(plain).toMatchObject({ loggedTodayMs: 12 * MIN, loggedEarlierMs: 0 });
    expect(untimed).toMatchObject({ loggedTodayMs: 0, loggedEarlierMs: 0 });
  });

  it("falls back to the series' estimate, and leaves it null when neither has one", () => {
    const [fromSeries, none] = dayBarTasksFor(
      [
        { id: "a", status: open, estimatedMinutes: null, series: { estimatedMinutes: 45 } },
        { id: "b", status: open, estimatedMinutes: null, series: null },
      ],
      {},
      "2026-09-08"
    );
    expect(fromSeries.estimatedMinutes).toBe(45);
    expect(none.estimatedMinutes).toBeNull();
  });

  it("feeds dayBarFill end to end", () => {
    const tasks = dayBarTasksFor(
      [
        { id: "plain", status: done, estimatedMinutes: 30 },
        { id: "rolled", status: open, estimatedMinutes: 30 },
      ],
      { plain: { "2026-09-08": 30 * MIN } },
      "2026-09-08"
    );
    // 30 worked, 30 remaining.
    expect(dayBarFill(tasks)).toBeCloseTo(0.5);
  });
});

describe("splitLoggedTime (head starts versus rolled-forward work)", () => {
  const log = { "2026-10-02": 10 * MIN, "2026-10-03": 20 * MIN, "2026-10-04": 5 * MIN, "2026-10-06": 99 * MIN };

  it("counts work done before the task was ever due as a head start on its day", () => {
    // Due Monday 10/5, not rolled; Sunday's 5 minutes and the earlier 10 + 20 are all head start.
    expect(splitLoggedTime(log, "2026-10-05", "2026-10-05")).toEqual({ loggedTodayMs: 35 * MIN, loggedEarlierMs: 0 });
  });

  it("still treats a rolled-forward task's work since it was first due as earlier work", () => {
    // First due Fri 10/2, rolled to Mon 10/5: Fri-Sun is earlier work, nothing predates it.
    expect(splitLoggedTime(log, "2026-10-05", "2026-10-02")).toEqual({ loggedTodayMs: 0, loggedEarlierMs: 35 * MIN });
    // First due Sat 10/3: Friday's 10 is a head start, Sat-Sun is earlier work.
    expect(splitLoggedTime(log, "2026-10-05", "2026-10-03")).toEqual({ loggedTodayMs: 10 * MIN, loggedEarlierMs: 25 * MIN });
  });

  it("counts the day's own time as the day's, and ignores later days", () => {
    expect(splitLoggedTime({ "2026-10-05": 7 * MIN, "2026-10-06": 50 * MIN }, "2026-10-05", "2026-10-05")).toEqual({
      loggedTodayMs: 7 * MIN,
      loggedEarlierMs: 0,
    });
  });

  it("with no known original due date, every earlier day is earlier work (as before)", () => {
    expect(splitLoggedTime(log, "2026-10-05", null)).toEqual({ loggedTodayMs: 0, loggedEarlierMs: 35 * MIN });
  });

  it("lets a task finished on Sunday read as fully worked on its own Monday", () => {
    const [done] = dayBarTasksFor(
      [{ id: "t", status: done_(), estimatedMinutes: 30, originalDueDate: new Date("2026-10-05T00:00:00Z") }],
      { t: { "2026-10-04": 28 * MIN } },
      "2026-10-05"
    );
    expect(done).toMatchObject({ loggedTodayMs: 28 * MIN, loggedEarlierMs: 0 });
    // ...so Monday's bar is full, not near-empty.
    expect(dayBarFill([done])).toBe(1);
  });
});

function done_() {
  return InstanceStatus.done;
}
