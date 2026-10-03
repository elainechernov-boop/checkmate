import { describe, expect, it } from "vitest";
import { InstanceStatus } from "@/generated/prisma/enums";
import { wallClockInstant } from "./clockTime";
import { parseISODate } from "./dates";
import { buildDashboard, type DashboardRun, type DashboardTask } from "./timeDashboard";
import { buildAnswerView, buildAxisView, buildDayViews } from "./timeDashboardView";

const MIN = 60_000;
const NOW = new Date("2026-09-30T23:00:00Z");

function run(id: string, instanceId: string, title: string, dateISO: string, startMin: number, endMin: number): DashboardRun {
  const base = wallClockInstant(dateISO, "09:00").getTime();
  const startedAt = new Date(base + startMin * MIN);
  const endedAt = new Date(base + endMin * MIN);
  return {
    id, instanceId, title, subjectId: "math", date: parseISODate(dateISO), startedAt, endedAt,
    lastPingAt: endedAt, endReason: "paused", editedByParent: false,
  };
}

const tasks: DashboardTask[] = [
  { id: "a", title: "Spelling", status: InstanceStatus.done, subjectId: "ela", estimatedMinutes: 30, completedAt: new Date("2026-09-08T20:00:00Z") },
  { id: "b", title: "Long division", status: InstanceStatus.done, subjectId: "math", estimatedMinutes: 45, completedAt: new Date("2026-09-08T21:00:00Z") },
  { id: "c", title: "Latin cards", status: InstanceStatus.done, subjectId: "latin", estimatedMinutes: null, completedAt: new Date("2026-09-08T22:00:00Z") },
];

// Tue 2026-09-08: spelling 0-35, (20 between) division 55-110 (pause 15) 125-140, (65 between) latin 205-245.
const runs = [
  run("1", "a", "Spelling", "2026-09-08", 0, 35),
  run("2", "b", "Long division", "2026-09-08", 55, 110),
  run("3", "b", "Long division", "2026-09-08", 125, 140),
  run("4", "c", "Latin cards", "2026-09-08", 205, 245),
];

const dashboard = buildDashboard({
  runs, tasks, timedTaskIds: new Set(["a", "b"]),
  subjectNames: new Map([["math", "Math"], ["ela", "Language arts"], ["latin", "Latin"]]),
  schoolDayStartTime: null,
  from: parseISODate("2026-09-07"), to: parseISODate("2026-09-12"), now: NOW,
});

describe("buildAnswerView", () => {
  it("says it in one sentence, in the spec's words", () => {
    const answer = buildAnswerView(dashboard)!;
    // Day 245: working 35+55+15+40 = 145 (2h 25m), paused 15, between 20+65 = 85 (1h 25m).
    // (Spaces inside a duration are non-breaking, so a wrapped line never splits "1h" from "25m".)
    expect(answer.sentence.replace(/\u00a0/g, " ")).toBe("The day ran 4h 5m: 2h 25m working, 1h 25m between tasks.");
    expect(answer.sentence).toContain("4h\u00a05m");
  });

  it("uses 'School days … on average' once there's more than one day", () => {
    const twoDays = buildDashboard({
      runs: [...runs, run("5", "a", "Spelling", "2026-09-09", 0, 30)], tasks, timedTaskIds: new Set(["a", "b"]),
      subjectNames: new Map(), schoolDayStartTime: null,
      from: parseISODate("2026-09-07"), to: parseISODate("2026-09-12"), now: NOW,
    });
    expect(buildAnswerView(twoDays)!.sentence).toMatch(/^School days ran .* on average: /);
  });

  it("orders the bar waiting, working, paused, between — and sums its shares to 100", () => {
    const answer = buildAnswerView(dashboard)!;
    expect(answer.segments.map((s) => s.key)).toEqual(["waiting", "working", "paused", "between"]);
    expect(answer.segments.reduce((sum, s) => sum + s.share, 0)).toBe(100);
  });

  it("only puts a value inside a segment wide enough to hold it", () => {
    const byKey = Object.fromEntries(buildAnswerView(dashboard)!.segments.map((s) => [s.key, s]));
    expect(byKey.working.labelFits).toBe(true); // ~59%
    expect(byKey.between.labelFits).toBe(true); // ~35%
    expect(byKey.paused.labelFits).toBe(false); // ~6%
    expect(byKey.waiting.labelFits).toBe(false); // none
  });

  it("reports the untimed count, or nothing when no task finished", () => {
    expect(buildAnswerView(dashboard)!.untimedLabel).toBe("1 of 3 tasks untimed.");
    const none = buildDashboard({
      runs, tasks: [], timedTaskIds: new Set(), subjectNames: new Map(), schoolDayStartTime: null,
      from: parseISODate("2026-09-07"), to: parseISODate("2026-09-12"), now: NOW,
    });
    expect(buildAnswerView(none)!.untimedLabel).toBeNull();
  });

  it("is null when nothing was tracked", () => {
    const empty = buildDashboard({
      runs: [], tasks: [], timedTaskIds: new Set(), subjectNames: new Map(), schoolDayStartTime: null,
      from: parseISODate("2026-09-07"), to: parseISODate("2026-09-12"), now: NOW,
    });
    expect(buildAnswerView(empty)).toBeNull();
    expect(buildAxisView(empty)).toBeNull();
    expect(buildDayViews(empty, [], NOW)).toEqual([]);
  });
});

describe("buildAxisView", () => {
  it("puts an hour tick every 60 minutes across the axis", () => {
    // 9:00 to 13:05 → axis 9:00-14:00, five hours.
    const axis = buildAxisView(dashboard)!;
    expect(axis.ticks.map((t) => t.label)).toEqual(["9", "10", "11", "12", "1"]);
    expect(axis.ticks.map((t) => Math.round(t.left))).toEqual([0, 20, 40, 60, 80]);
  });
});

describe("buildDayViews", () => {
  const [day] = buildDayViews(dashboard, tasks, NOW);

  it("labels the day for the row", () => {
    expect(day).toMatchObject({ dateISO: "2026-09-08", weekday: "Tue", dateLabel: "SEP 8", workLabel: "2h 25m", dayLabel: "4h 5m", doneLabel: "1:05 PM" });
  });

  it("draws one block per run, inside the axis, in order", () => {
    expect(day.blocks).toHaveLength(4);
    for (const block of day.blocks) {
      expect(block.left).toBeGreaterThanOrEqual(0);
      expect(block.left + block.width).toBeLessThanOrEqual(100.0001);
    }
    expect(day.blocks.map((b) => b.left)).toEqual([...day.blocks.map((b) => b.left)].sort((a, b) => a - b));
    expect(day.blocks[0]).toMatchObject({ title: "Spelling", timeLabel: "9:00 AM – 9:35 AM", durationLabel: "35 min" });
  });

  it("writes the gaps between the rows, and calls out only the day's longest between-task gap", () => {
    const gaps = day.ledger.filter((item) => item.kind === "gap");
    expect(gaps).toEqual([
      { kind: "gap", label: "20 min between", strong: false },
      { kind: "gap", label: "15 min paused", strong: false },
      { kind: "gap", label: "1h 5m between", strong: true },
    ]);
    // run, gap, run, gap, run, gap, run
    expect(day.ledger.map((item) => item.kind)).toEqual(["run", "gap", "run", "gap", "run", "gap", "run"]);
  });

  it("puts a task's estimate and difference on its last run of the day", () => {
    const notes = day.ledger.filter((item) => item.kind === "run").map((item) => (item.kind === "run" ? item.note : null));
    // Spelling 35 on 30 → +5. Long division (two runs) 55+15 = 70 on 45 → +25, on its second run only. Latin has no estimate.
    expect(notes).toEqual(["est 30 · +5", null, "est 45 · +25", null]);
  });

  it("doesn't call out a gap shorter than twenty minutes, even if it's the longest", () => {
    const short = buildDashboard({
      runs: [run("1", "a", "Spelling", "2026-09-08", 0, 20), run("2", "b", "Long division", "2026-09-08", 30, 50)],
      tasks, timedTaskIds: new Set(), subjectNames: new Map(), schoolDayStartTime: null,
      from: parseISODate("2026-09-07"), to: parseISODate("2026-09-12"), now: NOW,
    });
    const [shortDay] = buildDayViews(short, tasks, NOW);
    expect(shortDay.ledger.find((item) => item.kind === "gap")).toEqual({ kind: "gap", label: "10 min between", strong: false });
  });

  it("carries each run's real record, so edits and marks work in the ledger", () => {
    const first = day.ledger.find((item) => item.kind === "run");
    expect(first && first.kind === "run" && first.run).toMatchObject({ id: "1", endReason: "paused", editedByParent: false });
  });
});
