import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { parseISODate } from "./dates";
import { tenantScopeExtension } from "./tenantScope";
import { LAPSE_AFTER_MS, MIN_RUN_MS, summarizeDay } from "./timeSummary";
import {
  deleteRun,
  findOpenRun,
  finishTimer,
  getTimerState,
  loadRunsInRange,
  pauseTimer,
  pingTimer,
  startTimer,
  sweepLapsedRuns,
  TimeTrackingError,
  timeLoggedByInstance,
  updateRunTimes,
} from "./timeTracking";
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

const TODAY = parseISODate("2026-09-08");
const T0 = Date.UTC(2026, 8, 8, 16, 0, 0); // 9:00 AM PDT
const at = (minutes: number, seconds = 0) => new Date(T0 + minutes * 60_000 + seconds * 1000);

// The timer screen pings every 30s; tests ping every 2 minutes — well inside
// the 5-minute lapse window — from `fromMin` up to `untilMin`, so a run that's
// meant to stay alive across a long stretch actually does.
async function keepAlive(instanceId: string, fromMin: number, untilMin: number) {
  for (let m = fromMin + 2; m <= untilMin; m += 2) await pingTimer(prisma, instanceId, at(m));
}

async function makeInstance(
  studentId: string,
  subjectId: string | null,
  overrides: Partial<{ title: string; dueDate: Date | null; status: "open" | "pendingReview" | "done" | "excused"; requiresReview: boolean }> = {}
) {
  return prisma.assignmentInstance.create({
    data: {
      title: overrides.title ?? "Long division",
      studentId,
      subjectId,
      createdBy: "parent",
      dueDate: overrides.dueDate === undefined ? TODAY : overrides.dueDate,
      originalDueDate: TODAY,
      status: overrides.status ?? "open",
      requiresReview: overrides.requiresReview ?? false,
    },
  });
}

describe("startTimer", () => {
  it("opens a run stamped with the server's time, today's date, and snapshots of the title and subject", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const instance = await makeInstance(student.id, subject.id, { title: "Spelling list 4" });

    const run = await startTimer(prisma, instance.id, at(0), TODAY);

    expect(run.startedAt).toEqual(at(0));
    expect(run.endedAt).toBeNull();
    expect(run.lastPingAt).toEqual(at(0));
    expect(run.date).toEqual(TODAY);
    expect(run.title).toBe("Spelling list 4");
    expect(run.subjectId).toBe(subject.id);
    expect(run.studentId).toBe(student.id);
  });

  it("only times today's items", async () => {
    const student = await makeStudent(prisma);
    const yesterday = await makeInstance(student.id, null, { dueDate: parseISODate("2026-09-07") });
    const tomorrow = await makeInstance(student.id, null, { dueDate: parseISODate("2026-09-09") });
    const backlog = await makeInstance(student.id, null, { dueDate: null });

    for (const instance of [yesterday, tomorrow, backlog]) {
      await expect(startTimer(prisma, instance.id, at(0), TODAY)).rejects.toThrow(TimeTrackingError);
    }
    expect(await prisma.timeEntry.count()).toBe(0);
  });

  it("only times open items — done, pendingReview, and excused never open a timer", async () => {
    const student = await makeStudent(prisma);
    for (const status of ["done", "pendingReview", "excused"] as const) {
      const instance = await makeInstance(student.id, null, { status });
      await expect(startTimer(prisma, instance.id, at(0), TODAY)).rejects.toThrow(TimeTrackingError);
    }
  });

  it("is a no-op for the task that's already running — a double tap or reload can't fork the clock", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);

    const first = await startTimer(prisma, instance.id, at(0), TODAY);
    const second = await startTimer(prisma, instance.id, at(1), TODAY);

    expect(second.id).toBe(first.id);
    expect(second.startedAt).toEqual(at(0));
    expect(second.lastPingAt).toEqual(at(1));
    expect(await prisma.timeEntry.count()).toBe(1);
  });

  it("keeps at most one open run per student: starting another task closes the first as 'switched'", async () => {
    const student = await makeStudent(prisma);
    const math = await makeInstance(student.id, null, { title: "Math" });
    const latin = await makeInstance(student.id, null, { title: "Latin" });

    const mathRun = await startTimer(prisma, math.id, at(0), TODAY);
    await keepAlive(math.id, 0, 20);
    const latinRun = await startTimer(prisma, latin.id, at(20), TODAY);

    const open = await prisma.timeEntry.findMany({ where: { studentId: student.id, endedAt: null } });
    expect(open.map((r) => r.id)).toEqual([latinRun.id]);

    const closed = await prisma.timeEntry.findUniqueOrThrow({ where: { id: mathRun.id } });
    expect(closed.endedAt).toEqual(at(20));
    expect(closed.endReason).toBe("switched");
  });

  it("never touches another student's running clock", async () => {
    const miles = await makeStudent(prisma, { name: "Miles" });
    const violet = await makeStudent(prisma, { name: "Violet" });
    const milesTask = await makeInstance(miles.id, null);
    const violetTask = await makeInstance(violet.id, null);

    await startTimer(prisma, milesTask.id, at(0), TODAY);
    await startTimer(prisma, violetTask.id, at(5), TODAY);

    expect(await prisma.timeEntry.count({ where: { endedAt: null } })).toBe(2);
  });
});

describe("pause and resume", () => {
  it("pause closes the run as 'paused'; resume opens a new one, and the task's time is the sum of its runs", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);

    await startTimer(prisma, instance.id, at(0), TODAY);
    await keepAlive(instance.id, 0, 10);
    await pauseTimer(prisma, instance.id, at(10));
    await startTimer(prisma, instance.id, at(25), TODAY); // resume after a 15-minute pause
    await keepAlive(instance.id, 25, 35);
    await pauseTimer(prisma, instance.id, at(35));

    const runs = await prisma.timeEntry.findMany({ where: { instanceId: instance.id }, orderBy: { startedAt: "asc" } });
    expect(runs.map((r) => [r.startedAt, r.endedAt, r.endReason])).toEqual([
      [at(0), at(10), "paused"],
      [at(25), at(35), "paused"],
    ]);

    const state = await getTimerState(prisma, instance.id, at(40), TODAY);
    expect(state.closedMs).toBe(20 * 60_000);
    expect(state.closedTodayMs).toBe(20 * 60_000);
    expect(state.openStartedAtMs).toBeNull();
    expect(state.firstStartedAtMs).toBe(at(0).getTime());

    // The gap between the two runs is data too: same task on both sides, so it's "paused."
    const summary = summarizeDay(runs, at(40));
    expect(summary.pausedMs).toBe(15 * 60_000);
    expect(summary.workingMs).toBe(20 * 60_000);
  });

  it("tells today's time from a rolled task's earlier days, and quotes only today's first start", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    // Yesterday: 8 minutes on this task (as if it had rolled in).
    await prisma.timeEntry.create({
      data: {
        studentId: student.id,
        instanceId: instance.id,
        title: "Long division",
        date: parseISODate("2026-09-07"),
        startedAt: new Date(Date.UTC(2026, 8, 7, 16, 0, 0)),
        endedAt: new Date(Date.UTC(2026, 8, 7, 16, 8, 0)),
        lastPingAt: new Date(Date.UTC(2026, 8, 7, 16, 8, 0)),
        endReason: "paused",
      },
    });
    await startTimer(prisma, instance.id, at(30), TODAY);
    await keepAlive(instance.id, 30, 36);
    await pauseTimer(prisma, instance.id, at(36));

    const state = await getTimerState(prisma, instance.id, at(40), TODAY);

    expect(state.closedMs).toBe((8 + 6) * 60_000);
    expect(state.closedTodayMs).toBe(6 * 60_000);
    expect(state.firstStartedAtMs).toBe(at(30).getTime());
  });

  it("reports an open run so the client can keep counting from the server's clock", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await pauseTimer(prisma, instance.id, at(4));
    await startTimer(prisma, instance.id, at(10), TODAY);

    const state = await getTimerState(prisma, instance.id, at(12));
    expect(state.closedMs).toBe(4 * 60_000);
    expect(state.openStartedAtMs).toBe(at(10).getTime());
    expect(state.serverNowMs).toBe(at(12).getTime());
  });

  it("discards a run paused within seconds — an accidental tap", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);

    const result = await pauseTimer(prisma, instance.id, at(0, 3));

    expect(result.discarded).toBe(true);
    expect(await prisma.timeEntry.count()).toBe(0);
  });

  it("keeps a run that lasts at least the minimum", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);

    const result = await pauseTimer(prisma, instance.id, new Date(at(0).getTime() + MIN_RUN_MS));

    expect(result.discarded).toBe(false);
    expect(await prisma.timeEntry.count()).toBe(1);
  });

  it("pausing something that isn't running does nothing", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    expect(await pauseTimer(prisma, instance.id, at(5))).toEqual({ discarded: false });
  });
});

describe("finishTimer", () => {
  it("closes the run as 'finished' and completes the item on the same timestamp", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await keepAlive(instance.id, 0, 18);

    const result = await finishTimer(prisma, instance.id, at(18), TODAY);

    expect(result).toEqual({ status: "done", discardedRun: false });
    const run = await prisma.timeEntry.findFirstOrThrow({ where: { instanceId: instance.id } });
    expect(run.endedAt).toEqual(at(18));
    expect(run.endReason).toBe("finished");

    const after = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(after.status).toBe("done");
    expect(after.completedAt).toEqual(at(18));
  });

  it("sends 'Show me' work to pendingReview — the clock stops at Finish, not at approval", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null, { requiresReview: true });
    await startTimer(prisma, instance.id, at(0), TODAY);
    await keepAlive(instance.id, 0, 12);

    const result = await finishTimer(prisma, instance.id, at(12), TODAY);

    expect(result.status).toBe("pendingReview");
    const run = await prisma.timeEntry.findFirstOrThrow({ where: { instanceId: instance.id } });
    expect(run.endedAt).toEqual(at(12));
  });

  it("clears a return note, like the check-off it replaces", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await prisma.assignmentInstance.update({ where: { id: instance.id }, data: { returnNote: "Redo the last two" } });

    await finishTimer(prisma, instance.id, at(1), TODAY);

    expect((await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instance.id } })).returnNote).toBeNull();
  });

  it("records no time for a Finish pressed within seconds — that's an untimed completion", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);

    const result = await finishTimer(prisma, instance.id, at(0, 4), TODAY);

    expect(result).toEqual({ status: "done", discardedRun: true });
    expect(await prisma.timeEntry.count()).toBe(0);
    expect((await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instance.id } })).status).toBe("done");
  });

  it("can complete an item that was never timed at all", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    expect((await finishTimer(prisma, instance.id, at(5), TODAY)).status).toBe("done");
  });

  it("is a no-op the second time (a double tap)", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await keepAlive(instance.id, 0, 10);
    await finishTimer(prisma, instance.id, at(10), TODAY);

    const again = await finishTimer(prisma, instance.id, at(11), TODAY);

    expect(again.status).toBe("done");
    expect((await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instance.id } })).completedAt).toEqual(at(10));
  });

  it("only finishes today's items", async () => {
    const student = await makeStudent(prisma);
    const yesterday = await makeInstance(student.id, null, { dueDate: parseISODate("2026-09-07") });
    await expect(finishTimer(prisma, yesterday.id, at(0), TODAY)).rejects.toThrow(TimeTrackingError);
  });

  it("keeps a task's recorded time when it's unchecked and timed again — the total continues", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await keepAlive(instance.id, 0, 10);
    await finishTimer(prisma, instance.id, at(10), TODAY);

    // The student unchecks it (toggleInstance's open transition), then times it again.
    await prisma.assignmentInstance.update({ where: { id: instance.id }, data: { status: "open", completedAt: null } });
    await startTimer(prisma, instance.id, at(20), TODAY);
    await keepAlive(instance.id, 20, 25);
    await pauseTimer(prisma, instance.id, at(25));

    expect((await getTimerState(prisma, instance.id, at(30))).closedMs).toBe(15 * 60_000);
  });
});

describe("lapse sweeping (§15: 5 minutes without a ping)", () => {
  it("closes a quiet run at its last ping, on the next read — never counting it up to now", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await keepAlive(instance.id, 0, 8);

    // The lid closes after the 8-minute ping; an hour later, someone looks.
    const state = await getTimerState(prisma, instance.id, at(68));

    expect(state.openStartedAtMs).toBeNull();
    expect(state.closedMs).toBe(8 * 60_000);
    const run = await prisma.timeEntry.findFirstOrThrow({ where: { instanceId: instance.id } });
    expect(run.endedAt).toEqual(at(8));
    expect(run.endReason).toBe("lapsed");
  });

  it("leaves a run alone while it's still pinging", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await pingTimer(prisma, instance.id, at(4));

    await sweepLapsedRuns(prisma, student.id, at(4, 59));

    expect((await prisma.timeEntry.findFirstOrThrow({ where: { instanceId: instance.id } })).endedAt).toBeNull();
  });

  it("closes exactly past the threshold, not at it", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await pingTimer(prisma, instance.id, at(2));

    await sweepLapsedRuns(prisma, student.id, new Date(at(2).getTime() + LAPSE_AFTER_MS));
    expect((await prisma.timeEntry.findFirstOrThrow({ where: { instanceId: instance.id } })).endedAt).toBeNull();

    await sweepLapsedRuns(prisma, student.id, new Date(at(2).getTime() + LAPSE_AFTER_MS + 1));
    expect((await prisma.timeEntry.findFirstOrThrow({ where: { instanceId: instance.id } })).endReason).toBe("lapsed");
  });

  it("sweeps on the dashboard's read path too", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await keepAlive(instance.id, 0, 6);

    const runs = await loadRunsInRange(prisma, student.id, TODAY, TODAY, at(120));

    expect(runs).toHaveLength(1);
    expect(runs[0].endedAt).toEqual(at(6));
  });

  it("is safe when two requests sweep the same lapsed run at once", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await keepAlive(instance.id, 0, 8);

    // e.g. the student page and the dashboard both loading at the same moment.
    await Promise.all([sweepLapsedRuns(prisma, student.id, at(90)), sweepLapsedRuns(prisma, student.id, at(90))]);

    const runs = await prisma.timeEntry.findMany({ where: { instanceId: instance.id } });
    expect(runs).toHaveLength(1);
    expect(runs[0].endReason).toBe("lapsed");
    expect(runs[0].endedAt).toEqual(at(8));
  });

  it("a late ping from a suspended tab doesn't resurrect time nobody was watching", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await keepAlive(instance.id, 0, 6);

    const result = await pingTimer(prisma, instance.id, at(40));

    expect(result.running).toBe(false);
    const run = await prisma.timeEntry.findFirstOrThrow({ where: { instanceId: instance.id } });
    expect(run.endedAt).toEqual(at(6));
    expect(run.endReason).toBe("lapsed");
  });

  it("discards a lapsed run that never lasted the minimum", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY); // never pinged again

    await sweepLapsedRuns(prisma, student.id, at(30));

    expect(await prisma.timeEntry.count()).toBe(0);
  });

  it("starting a new task after a lapse leaves the old run closed as lapsed, not 'switched'", async () => {
    const student = await makeStudent(prisma);
    const math = await makeInstance(student.id, null, { title: "Math" });
    const latin = await makeInstance(student.id, null, { title: "Latin" });
    await startTimer(prisma, math.id, at(0), TODAY);
    await pingTimer(prisma, math.id, at(3));

    await startTimer(prisma, latin.id, at(45), TODAY);

    const mathRun = await prisma.timeEntry.findFirstOrThrow({ where: { instanceId: math.id } });
    expect(mathRun.endReason).toBe("lapsed");
    expect(mathRun.endedAt).toEqual(at(3));
  });
});

describe("pingTimer and findOpenRun", () => {
  it("refreshes the ping of a live run", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);

    expect(await pingTimer(prisma, instance.id, at(0, 30))).toEqual({ running: true });
    expect((await prisma.timeEntry.findFirstOrThrow({ where: { instanceId: instance.id } })).lastPingAt).toEqual(at(0, 30));
  });

  it("says not running when nothing is open", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    expect(await pingTimer(prisma, instance.id, at(0))).toEqual({ running: false });
  });

  it("finds the student's still-running timer so a reload lands back on it", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await pingTimer(prisma, instance.id, at(2));

    const open = await findOpenRun(prisma, student.id, at(3));
    expect(open?.instanceId).toBe(instance.id);
  });

  it("doesn't offer a lapsed run as 'still running'", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await pingTimer(prisma, instance.id, at(2));

    expect(await findOpenRun(prisma, student.id, at(90))).toBeNull();
  });
});

describe("history survives deleting the assignment", () => {
  it("keeps the run, with its title and subject snapshot, when the instance is deleted", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const instance = await makeInstance(student.id, subject.id, { title: "Deleted later" });
    await startTimer(prisma, instance.id, at(0), TODAY);
    await keepAlive(instance.id, 0, 20);
    await pauseTimer(prisma, instance.id, at(20));

    await prisma.assignmentInstance.delete({ where: { id: instance.id } });

    const run = await prisma.timeEntry.findFirstOrThrow({ where: { studentId: student.id } });
    expect(run.instanceId).toBeNull();
    expect(run.title).toBe("Deleted later");
    expect(run.subjectId).toBe(subject.id);
    expect(run.endedAt).toEqual(at(20));
  });

  it("doesn't block deleting a subject", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const instance = await makeInstance(student.id, subject.id);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await keepAlive(instance.id, 0, 20);
    await pauseTimer(prisma, instance.id, at(20));
    await prisma.assignmentInstance.delete({ where: { id: instance.id } });

    await prisma.subject.delete({ where: { id: subject.id } });

    expect((await prisma.timeEntry.findFirstOrThrow({ where: { studentId: student.id } })).subjectId).toBeNull();
  });
});

describe("timeLoggedByInstance (feeds the day bar)", () => {
  it("totals closed and open time per task per calendar day", async () => {
    const student = await makeStudent(prisma);
    const a = await makeInstance(student.id, null, { title: "A" });
    const b = await makeInstance(student.id, null, { title: "B" });
    await startTimer(prisma, a.id, at(0), TODAY);
    await keepAlive(a.id, 0, 10);
    await pauseTimer(prisma, a.id, at(10));
    await startTimer(prisma, a.id, at(20), TODAY);
    await keepAlive(a.id, 20, 25);
    await pauseTimer(prisma, a.id, at(25));
    await startTimer(prisma, b.id, at(30), TODAY); // still open

    // An earlier day's run on task A (as if it had rolled in).
    await prisma.timeEntry.create({
      data: {
        studentId: student.id,
        instanceId: a.id,
        title: "A",
        date: parseISODate("2026-09-07"),
        startedAt: new Date(Date.UTC(2026, 8, 7, 16, 0, 0)),
        endedAt: new Date(Date.UTC(2026, 8, 7, 16, 8, 0)),
        lastPingAt: new Date(Date.UTC(2026, 8, 7, 16, 8, 0)),
        endReason: "paused",
      },
    });

    const log = await timeLoggedByInstance(prisma, student.id, [a.id, b.id], at(34));

    expect(log[a.id]).toEqual({ "2026-09-08": 15 * 60_000, "2026-09-07": 8 * 60_000 });
    expect(log[b.id]).toEqual({ "2026-09-08": 4 * 60_000 });
  });

  it("returns nothing for an empty list, and leaves untimed tasks out", async () => {
    const student = await makeStudent(prisma);
    const untimed = await makeInstance(student.id, null);
    expect(await timeLoggedByInstance(prisma, student.id, [], at(0))).toEqual({});
    expect(await timeLoggedByInstance(prisma, student.id, [untimed.id], at(0))).toEqual({});
  });
});

describe("parent corrections", () => {
  async function closedRun(studentId: string, instanceId: string, startMin: number, endMin: number) {
    return prisma.timeEntry.create({
      data: {
        studentId,
        instanceId,
        title: "Task",
        date: TODAY,
        startedAt: at(startMin),
        endedAt: at(endMin),
        lastPingAt: at(endMin),
        endReason: "paused",
      },
    });
  }

  it("moves a run's start and end and marks it edited", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    const run = await closedRun(student.id, instance.id, 0, 90);

    await updateRunTimes(prisma, run.id, at(0), at(35), at(120));

    const after = await prisma.timeEntry.findUniqueOrThrow({ where: { id: run.id } });
    expect(after.endedAt).toEqual(at(35));
    expect(after.editedByParent).toBe(true);
  });

  it("rejects an end before the start, a run in the future, and a run that's still open", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    const run = await closedRun(student.id, instance.id, 0, 30);

    await expect(updateRunTimes(prisma, run.id, at(30), at(10), at(120))).rejects.toThrow(TimeTrackingError);
    await expect(updateRunTimes(prisma, run.id, at(0), at(200), at(120))).rejects.toThrow(TimeTrackingError);

    const open = await startTimer(prisma, (await makeInstance(student.id, null)).id, at(60), TODAY);
    await expect(updateRunTimes(prisma, open.id, at(60), at(70), at(120))).rejects.toThrow(TimeTrackingError);
  });

  it("rejects an edit that would overlap another run — one clock at a time", async () => {
    const student = await makeStudent(prisma);
    const a = await makeInstance(student.id, null);
    const b = await makeInstance(student.id, null);
    const first = await closedRun(student.id, a.id, 0, 30);
    await closedRun(student.id, b.id, 40, 70);

    await expect(updateRunTimes(prisma, first.id, at(0), at(50), at(120))).rejects.toThrow(/overlaps/);
    // Butting up against the neighbour is fine.
    await updateRunTimes(prisma, first.id, at(0), at(40), at(120));
  });

  it("deletes a run", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    const run = await closedRun(student.id, instance.id, 0, 30);

    await deleteRun(prisma, run.id);

    expect(await prisma.timeEntry.count()).toBe(0);
  });
});

describe("tenant scoping", () => {
  it("keeps one family's runs invisible to another", async () => {
    const familyA = await prisma.family.create({ data: { name: "A", slug: `a-${randomUUID()}` } });
    const familyB = await prisma.family.create({ data: { name: "B", slug: `b-${randomUUID()}` } });
    const scopedA = prisma.$extends(tenantScopeExtension(familyA.id)) as unknown as PrismaClient;
    const scopedB = prisma.$extends(tenantScopeExtension(familyB.id)) as unknown as PrismaClient;

    const studentA = await scopedA.student.create({ data: { name: "Miles", gradeLevel: "7th", accentColor: "#000" } });
    const instanceA = await scopedA.assignmentInstance.create({
      data: { title: "Math", studentId: studentA.id, createdBy: "parent", dueDate: TODAY, originalDueDate: TODAY },
    });

    const run = await startTimer(scopedA, instanceA.id, at(0), TODAY);
    expect(run.familyId).toBe(familyA.id);

    expect(await scopedB.timeEntry.findMany()).toEqual([]);
    expect(await scopedB.timeEntry.findUnique({ where: { id: run.id } })).toBeNull();
    await expect(deleteRun(scopedB, run.id)).rejects.toThrow();
    expect(await scopedA.timeEntry.count()).toBe(1);
  });
});
