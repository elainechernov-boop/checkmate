import { describe, expect, it } from "vitest";
import { summarizeDay, runEnd, runDurationMs, LAPSE_AFTER_MS, type RunLike } from "./timeSummary";

// Minutes after 09:00 on an arbitrary day — keeps the arithmetic readable.
const T0 = Date.UTC(2026, 8, 8, 16, 0, 0); // 9:00 AM PDT
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

function run(instanceId: string | null, startMin: number, endMin: number | null, title = "Task"): RunLike {
  return {
    instanceId,
    title,
    startedAt: at(startMin),
    endedAt: endMin === null ? null : at(endMin),
    lastPingAt: at(endMin ?? startMin),
  };
}

const NOW = at(600); // comfortably after everything below

describe("summarizeDay (§15's four buckets)", () => {
  it("sums working time and classifies each gap as paused (same task) or between (different tasks)", () => {
    const summary = summarizeDay(
      [
        run("spelling", 10, 35),
        run("math", 45, 90), // 10 min between spelling → math
        run("math", 105, 115), // 15 min paused: same task on both sides
        run("latin", 135, 170), // 20 min between math → latin
      ],
      NOW
    );

    const min = (ms: number) => ms / 60_000;
    expect(min(summary.workingMs)).toBe(25 + 45 + 10 + 35);
    expect(min(summary.pausedMs)).toBe(15);
    expect(min(summary.betweenMs)).toBe(10 + 20);
    expect(summary.gaps.map((g) => [g.kind, min(g.ms)])).toEqual([
      ["between", 10],
      ["paused", 15],
      ["between", 20],
    ]);
  });

  it("always sums to the day exactly, with no school-day start", () => {
    const summary = summarizeDay([run("a", 10, 40), run("b", 55, 80), run("b", 100, 130), run("c", 131, 200)], NOW);
    expect(summary.waitingMs).toBe(0);
    expect(summary.workingMs + summary.pausedMs + summary.betweenMs + summary.waitingMs).toBe(summary.dayMs);
    expect(summary.dayMs).toBe((200 - 10) * 60_000);
    expect(summary.dayStart).toEqual(at(10));
  });

  it("counts a late start as waiting, and the day then begins at the school-day start", () => {
    const schoolStart = at(0);
    const summary = summarizeDay([run("a", 25, 55), run("b", 65, 95)], NOW, schoolStart);

    expect(summary.waitingMs).toBe(25 * 60_000);
    expect(summary.dayStart).toEqual(schoolStart);
    expect(summary.dayMs).toBe(95 * 60_000);
    expect(summary.workingMs + summary.pausedMs + summary.betweenMs + summary.waitingMs).toBe(summary.dayMs);
  });

  it("ignores a school-day start that comes after the first run — no waiting, the day starts at the first run", () => {
    const summary = summarizeDay([run("a", 5, 35), run("b", 40, 60)], NOW, at(30));
    expect(summary.waitingMs).toBe(0);
    expect(summary.dayStart).toEqual(at(5));
    expect(summary.workingMs + summary.pausedMs + summary.betweenMs + summary.waitingMs).toBe(summary.dayMs);
  });

  it("holds the sum property for a day with a single run", () => {
    const summary = summarizeDay([run("a", 10, 40)], NOW, at(0));
    expect(summary.workingMs).toBe(30 * 60_000);
    expect(summary.waitingMs).toBe(10 * 60_000);
    expect(summary.dayMs).toBe(40 * 60_000);
    expect(summary.gaps).toEqual([]);
  });

  it("returns all zeros and nulls for a day with no runs", () => {
    const summary = summarizeDay([], NOW, at(0));
    expect(summary).toMatchObject({ workingMs: 0, pausedMs: 0, betweenMs: 0, waitingMs: 0, dayMs: 0, firstStart: null, lastEnd: null });
  });

  it("orders runs by start no matter how they arrive", () => {
    const summary = summarizeDay([run("b", 60, 90), run("a", 10, 40)], NOW);
    expect(summary.runs.map((r) => r.run.instanceId)).toEqual(["a", "b"]);
    expect(summary.betweenMs).toBe(20 * 60_000);
  });

  it("clips an overlapping run so the buckets still sum to the day", () => {
    const summary = summarizeDay([run("a", 10, 50), run("b", 40, 70)], NOW);
    expect(summary.workingMs).toBe((50 - 10 + 70 - 50) * 60_000);
    expect(summary.workingMs + summary.pausedMs + summary.betweenMs + summary.waitingMs).toBe(summary.dayMs);
  });

  it("falls back to the title snapshot for runs whose assignment was deleted", () => {
    // Same title on both sides: one task paused and resumed before it was removed.
    const same = summarizeDay([run(null, 10, 20, "Gone"), run(null, 30, 40, "Gone")], NOW);
    expect(same.pausedMs).toBe(10 * 60_000);
    expect(same.betweenMs).toBe(0);

    // Different titles can't be the same task.
    const different = summarizeDay([run(null, 10, 20, "Gone"), run(null, 30, 40, "Also gone")], NOW);
    expect(different.pausedMs).toBe(0);
    expect(different.betweenMs).toBe(10 * 60_000);
  });

  it("counts an open run up to now, so today shows live", () => {
    const now = at(75);
    const open: RunLike = { instanceId: "a", title: "A", startedAt: at(60), endedAt: null, lastPingAt: at(74) };
    const summary = summarizeDay([run("a", 10, 40), open], now);
    expect(summary.workingMs).toBe((30 + 15) * 60_000);
    expect(summary.lastEnd).toEqual(now);
  });

  it("never counts a lapsed-but-unswept open run up to now — it ends at its last ping", () => {
    const now = at(60 + 30);
    const lapsed: RunLike = { instanceId: "a", title: "A", startedAt: at(60), endedAt: null, lastPingAt: at(65) };
    expect(now.getTime() - lapsed.lastPingAt.getTime()).toBeGreaterThan(LAPSE_AFTER_MS);
    expect(runEnd(lapsed, now)).toEqual(at(65));
    expect(runDurationMs(lapsed, now)).toBe(5 * 60_000);
    expect(summarizeDay([lapsed], now).workingMs).toBe(5 * 60_000);
  });
});
