import { describe, expect, it } from "vitest";
import { InstanceStatus } from "@/generated/prisma/enums";
import { wallClockInstant } from "./clockTime";
import { parseISODate } from "./dates";
import { buildDashboard, shareOfTotal, type DashboardRun, type DashboardTask } from "./timeDashboard";

const MIN = 60_000;
const NOW = new Date("2026-09-30T23:00:00Z"); // after everything below

/** A closed run `startMin`..`endMin` minutes after 9:00 AM Pacific on `dateISO`. */
function run(
  id: string,
  instanceId: string | null,
  title: string,
  subjectId: string | null,
  dateISO: string,
  startMin: number,
  endMin: number
): DashboardRun {
  const base = wallClockInstant(dateISO, "09:00").getTime();
  const startedAt = new Date(base + startMin * MIN);
  const endedAt = new Date(base + endMin * MIN);
  return {
    id,
    instanceId,
    title,
    subjectId,
    date: parseISODate(dateISO),
    startedAt,
    endedAt,
    lastPingAt: endedAt,
    endReason: "paused",
    editedByParent: false,
  };
}

function task(
  id: string,
  title: string,
  overrides: Partial<DashboardTask> = {}
): DashboardTask {
  return {
    id,
    title,
    status: InstanceStatus.done,
    subjectId: "math",
    estimatedMinutes: 30,
    completedAt: new Date("2026-09-08T20:00:00Z"),
    ...overrides,
  };
}

const NAMES = new Map([
  ["math", "Math"],
  ["latin", "Latin"],
  ["ela", "Language arts"],
]);

const RANGE = { from: parseISODate("2026-09-07"), to: parseISODate("2026-09-12"), now: NOW };

function build(overrides: Partial<Parameters<typeof buildDashboard>[0]> = {}) {
  return buildDashboard({
    runs: [],
    tasks: [],
    timedTaskIds: new Set(),
    subjectNames: NAMES,
    schoolDayStartTime: null,
    ...RANGE,
    ...overrides,
  });
}

describe("shareOfTotal", () => {
  it("returns whole numbers that sum to exactly 100", () => {
    // The mockup's day: working 166, paused 7, between 77, waiting 12 (minutes).
    expect(shareOfTotal([166, 7, 77, 12])).toEqual([63, 3, 29, 5]);
    for (const values of [[1, 1, 1], [5, 3, 2], [333, 333, 334], [1, 0, 0]]) {
      expect(shareOfTotal(values).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  it("is all zeros for nothing", () => {
    expect(shareOfTotal([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("buildDashboard — buckets and averages", () => {
  // Day 1: math 0-30, (10 between) latin 40-70, (20 paused... no: same task) math 90-110
  const tasks = [task("t-math", "Fractions"), task("t-latin", "Latin cards", { subjectId: "latin" })];
  const day1 = [
    run("r1", "t-math", "Fractions", "math", "2026-09-08", 0, 30),
    run("r2", "t-latin", "Latin cards", "latin", "2026-09-08", 40, 70), // 10 between
    run("r3", "t-math", "Fractions", "math", "2026-09-08", 90, 110), // 20 between (latin → math)
  ];
  const day2 = [
    run("r4", "t-math", "Fractions", "math", "2026-09-09", 0, 20),
    run("r5", "t-math", "Fractions", "math", "2026-09-09", 30, 50), // 10 paused
  ];

  it("averages the four buckets across the days that have tracked time", () => {
    const { averages, days } = build({ runs: [...day1, ...day2], tasks });

    expect(days.map((d) => d.dateISO)).toEqual(["2026-09-08", "2026-09-09"]);
    expect(averages!.days).toBe(2);
    // Day 1: working 80, between 30, day 110. Day 2: working 40, paused 10, day 50.
    expect(averages!.workingMs).toBe(((80 + 40) / 2) * MIN);
    expect(averages!.betweenMs).toBe(((30 + 0) / 2) * MIN);
    expect(averages!.pausedMs).toBe(((0 + 10) / 2) * MIN);
    expect(averages!.dayMs).toBe(((110 + 50) / 2) * MIN);
    expect(averages!.waitingMs).toBe(0);
  });

  it("keeps the four averages summing to the average day, and the shares to 100", () => {
    const { averages } = build({ runs: [...day1, ...day2], tasks, schoolDayStartTime: "08:50" });
    const sum = averages!.workingMs + averages!.pausedMs + averages!.betweenMs + averages!.waitingMs;
    expect(sum).toBeCloseTo(averages!.dayMs, 3);
    const { working, paused, between, waiting } = averages!.shares;
    expect(working + paused + between + waiting).toBe(100);
  });

  it("counts a late start as waiting when the family sets a school-day start", () => {
    // Day 1 first run starts at 9:00 sharp; a 8:40 school start makes that 20 minutes of waiting.
    const { days, averages } = build({ runs: day1, tasks, schoolDayStartTime: "08:40" });
    expect(days[0].summary.waitingMs).toBe(20 * MIN);
    expect(averages!.waitingMs).toBe(20 * MIN);
  });

  it("never counts a Sunday head start as a late start, even with a school-day start set", () => {
    // Sunday 2026-09-13, three hours after a 9:00 "school start" — not waiting, just a head start.
    const sunday = [run("s1", "t-math", "Fractions", "math", "2026-09-13", 180, 215)];
    const { days } = build({
      runs: sunday,
      tasks,
      schoolDayStartTime: "09:00",
      from: parseISODate("2026-09-07"),
      to: parseISODate("2026-09-13"),
    });
    expect(days.map((d) => d.dateISO)).toEqual(["2026-09-13"]);
    expect(days[0].summary.waitingMs).toBe(0);
    expect(days[0].summary.dayMs).toBe(35 * MIN);
  });

  it("keeps a Sunday head start out of the school-day averages, but still lists it as a day", () => {
    const tuesday = [run("w1", "t-math", "Fractions", "math", "2026-09-08", 0, 60)]; // a 60-minute school day
    const sunday = [run("s1", "t-math", "Fractions", "math", "2026-09-13", 0, 20)]; // a 20-minute head start
    const { days, averages } = build({
      runs: [...tuesday, ...sunday],
      tasks,
      from: parseISODate("2026-09-07"),
      to: parseISODate("2026-09-13"),
    });
    expect(days.map((d) => d.dateISO)).toEqual(["2026-09-08", "2026-09-13"]);
    expect(averages!.days).toBe(1);
    expect(averages!.dayMs).toBe(60 * MIN); // not (60 + 20) / 2
    expect(averages!.workingMs).toBe(60 * MIN);
  });

  it("has no school-day averages when only a Sunday was tracked — but the day is still there", () => {
    const { days, averages } = build({
      runs: [run("s1", "t-math", "Fractions", "math", "2026-09-13", 0, 20)],
      tasks,
      from: parseISODate("2026-09-07"),
      to: parseISODate("2026-09-13"),
    });
    expect(averages).toBeNull();
    expect(days).toHaveLength(1);
  });

  it("still counts a late start on a school day", () => {
    const { days } = build({ runs: [run("w1", "t-math", "Fractions", "math", "2026-09-08", 180, 215)], tasks, schoolDayStartTime: "09:00" });
    expect(days[0].summary.waitingMs).toBe(180 * MIN);
  });

  it("ignores runs attributed to days outside the range", () => {
    const outside = run("rx", "t-math", "Fractions", "math", "2026-09-20", 0, 60);
    const { days } = build({ runs: [...day1, outside], tasks });
    expect(days.map((d) => d.dateISO)).toEqual(["2026-09-08"]);
  });

  it("is empty — no averages, no axis — when nothing was tracked", () => {
    const result = build();
    expect(result.days).toEqual([]);
    expect(result.averages).toBeNull();
    expect(result.axis).toBeNull();
    expect(result.subjects).toEqual([]);
    expect(result.longestGaps).toEqual([]);
  });
});

describe("buildDashboard — untimed tasks", () => {
  it("counts finished tasks that were never timed, and leaves unfinished ones out of the denominator", () => {
    const tasks = [
      task("timed", "Timed"),
      task("untimed-a", "Untimed A"),
      task("untimed-b", "Untimed B", { status: InstanceStatus.pendingReview }),
      task("still-open", "Open", { status: InstanceStatus.open, completedAt: null }),
      task("excused", "Excused", { status: InstanceStatus.excused }),
    ];
    const { untimed } = build({
      runs: [run("r1", "timed", "Timed", "math", "2026-09-08", 0, 20)],
      tasks,
      timedTaskIds: new Set(["timed"]),
    });
    expect(untimed).toEqual({ untimed: 2, total: 3 });
  });

  it("treats a task timed on another day as timed, not untimed", () => {
    const rolled = task("rolled", "Rolled in");
    const { untimed } = build({ tasks: [rolled], timedTaskIds: new Set(["rolled"]) });
    expect(untimed).toEqual({ untimed: 0, total: 1 });
  });

  it("only counts tasks completed inside the range", () => {
    const before = task("before", "Before", { completedAt: new Date("2026-08-01T20:00:00Z") });
    const inside = task("inside", "Inside");
    expect(build({ tasks: [before, inside] }).untimed).toEqual({ untimed: 1, total: 1 });
  });
});

describe("buildDashboard — subjects and overruns", () => {
  const tasks = [
    task("m1", "Fractions", { estimatedMinutes: 30 }),
    task("m2", "Drill", { estimatedMinutes: 20 }),
    task("l1", "Latin cards", { subjectId: "latin", estimatedMinutes: 30 }),
    task("m3", "Unfinished", { status: InstanceStatus.open, completedAt: null, estimatedMinutes: 10 }),
    task("noest", "No estimate", { estimatedMinutes: null, subjectId: "ela" }),
  ];
  const runs = [
    run("a", "m1", "Fractions", "math", "2026-09-08", 0, 45), // 45 on 30: +15
    run("b", "m2", "Drill", "math", "2026-09-08", 50, 60), //   10 on 20: -10
    run("c", "l1", "Latin cards", "latin", "2026-09-08", 70, 130), // 60 on 30: +30
    run("d", "m3", "Unfinished", "math", "2026-09-09", 0, 25), //  25 on 10, but not finished
    run("e", "noest", "No estimate", "ela", "2026-09-09", 30, 40),
  ];

  it("totals and averages per subject, sorted by total time", () => {
    const { subjects } = build({ runs, tasks });
    expect(subjects.map((s) => s.name)).toEqual(["Math", "Latin", "Language arts"]);

    const math = subjects[0];
    expect(math.tasks).toBe(3);
    expect(math.totalMs).toBe((45 + 10 + 25) * MIN);
    expect(math.avgPerTaskMs).toBeCloseTo(((45 + 10 + 25) / 3) * MIN, 3);
    expect(math.avgEstimateMinutes).toBeCloseTo((30 + 20 + 10) / 3);
  });

  it("measures over/under only on finished tasks that have an estimate", () => {
    const { subjects } = build({ runs, tasks });
    const math = subjects.find((s) => s.name === "Math")!;
    // Finished + estimated: Fractions (+15) and Drill (−10); the unfinished 25-on-10 is excluded.
    expect(math.overUnderMs).toBeCloseTo(((15 - 10) / 2) * MIN, 3);
    expect(subjects.find((s) => s.name === "Language arts")!.overUnderMs).toBeNull();
  });

  it("lists the finished tasks that most overran their estimate, biggest first", () => {
    const { overruns } = build({ runs, tasks });
    expect(overruns.map((o) => [o.title, o.overageMs / MIN])).toEqual([
      ["Latin cards", 30],
      ["Fractions", 15],
    ]);
    expect(overruns[0]).toMatchObject({ subjectName: "Latin", estimateMinutes: 30, actualMs: 60 * MIN, days: 1 });
  });

  it("says how many days an overrunning task was spread across", () => {
    const rolled = [
      run("x", "m1", "Fractions", "math", "2026-09-08", 0, 25),
      run("y", "m1", "Fractions", "math", "2026-09-09", 0, 25),
    ];
    const { overruns } = build({ runs: rolled, tasks });
    expect(overruns[0]).toMatchObject({ title: "Fractions", actualMs: 50 * MIN, overageMs: 20 * MIN, days: 2 });
  });

  it("caps the overrun list at ten", () => {
    const many = Array.from({ length: 14 }, (_, i) => task(`t${i}`, `Task ${i}`, { estimatedMinutes: 5 }));
    const manyRuns = many.map((t, i) => run(`r${i}`, t.id, t.title, "math", "2026-09-08", i * 40, i * 40 + 10 + i));
    expect(build({ runs: manyRuns, tasks: many }).overruns).toHaveLength(10);
  });

  it("files runs from a since-deleted subject under 'No subject'", () => {
    const orphan = run("o", null, "Gone task", null, "2026-09-08", 0, 15);
    expect(build({ runs: [orphan] }).subjects[0].name).toBe("No subject");
  });
});

describe("buildDashboard — longest gaps and the axis", () => {
  const tasks = [task("a", "A"), task("b", "B", { subjectId: "latin" }), task("c", "C")];

  it("ranks only between-task gaps, longest first, naming the pair by subject", () => {
    const runs = [
      run("1", "a", "A", "math", "2026-09-08", 0, 20),
      run("2", "a", "A", "math", "2026-09-08", 80, 90), // a 60-minute *pause* — same task, so not a "between" gap
      run("3", "b", "B", "latin", "2026-09-08", 100, 120), // 10 between
      run("4", "c", "C", "math", "2026-09-09", 0, 10),
      run("5", "b", "B", "latin", "2026-09-09", 55, 70), // 45 between
    ];
    const { longestGaps } = build({ runs, tasks });

    expect(longestGaps.map((g) => [g.dateISO, g.ms / MIN, g.fromLabel, g.toLabel])).toEqual([
      ["2026-09-09", 45, "Math", "Latin"],
      ["2026-09-08", 10, "Math", "Latin"],
    ]);
  });

  it("falls back to the task's title when a run has no subject", () => {
    const runs = [
      run("1", "a", "Walk the dog", null, "2026-09-08", 0, 10),
      run("2", "b", "Piano", null, "2026-09-08", 40, 50),
    ];
    expect(build({ runs, tasks }).longestGaps[0]).toMatchObject({ fromLabel: "Walk the dog", toLabel: "Piano" });
  });

  it("keeps at most eight", () => {
    const runs = Array.from({ length: 12 }, (_, i) =>
      run(`r${i}`, i % 2 ? "a" : "b", "T", "math", "2026-09-08", i * 30, i * 30 + 10)
    );
    expect(build({ runs, tasks }).longestGaps).toHaveLength(8);
  });

  it("fits the shared axis out to whole hours across every day", () => {
    // Earliest 9:15, latest end 11:40 on a later day → 9:00 to 12:00, padded to the 3-hour minimum.
    const runs = [
      run("1", "a", "A", "math", "2026-09-08", 15, 60),
      run("2", "a", "A", "math", "2026-09-09", 30, 160),
    ];
    expect(build({ runs, tasks }).axis).toEqual({ startMin: 9 * 60, endMin: 12 * 60 });
  });

  it("widens a short day to a three-hour axis, and stretches for a long one", () => {
    expect(build({ runs: [run("1", "a", "A", "math", "2026-09-08", 5, 25)], tasks }).axis).toEqual({
      startMin: 9 * 60,
      endMin: 12 * 60,
    });
    expect(build({ runs: [run("1", "a", "A", "math", "2026-09-08", 5, 5 * 60 + 20)], tasks }).axis).toEqual({
      startMin: 9 * 60,
      endMin: 15 * 60,
    });
  });

  it("starts the axis at the school-day start when it's earlier than the first run", () => {
    const runs = [run("1", "a", "A", "math", "2026-09-08", 40, 70)];
    expect(build({ runs, tasks, schoolDayStartTime: "08:30" }).axis!.startMin).toBe(8 * 60);
  });
});
