import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { parseISODate, toISODate } from "./dates";
import { tenantScopeExtension } from "./tenantScope";
import { AWAY_AFTER_MS, LAPSE_AFTER_MS, MIN_RUN_MS, summarizeDay } from "./timeSummary";
import {
  addRun,
  deleteRun,
  editRunClockTimes,
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
  trimTimer,
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

describe("getting a head start on tomorrow (§15, Sundays)", () => {
  const SUNDAY = parseISODate("2026-10-04");
  const MONDAY = parseISODate("2026-10-05");
  const sundayAt = (minutes: number) => new Date(Date.UTC(2026, 9, 4, 22, 0, 0) + minutes * 60_000); // 3:00 PM PDT

  async function mondayTask(studentId: string, overrides: { requiresReview?: boolean } = {}) {
    return prisma.assignmentInstance.create({
      data: {
        title: "Monday math",
        studentId,
        createdBy: "parent",
        dueDate: MONDAY,
        originalDueDate: MONDAY,
        requiresReview: overrides.requiresReview ?? false,
      },
    });
  }

  it("lets a Sunday timer run on Monday's task, recorded as Sunday's work", async () => {
    const student = await makeStudent(prisma);
    const task = await mondayTask(student.id);

    const run = await startTimer(prisma, task.id, sundayAt(0), SUNDAY);

    expect(run.date).toEqual(SUNDAY); // dated the day it actually happened...
    expect((await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: task.id } })).dueDate).toEqual(MONDAY); // ...while the task stays due Monday
  });

  it("lets Finish complete it on Sunday, and keeps the time on Sunday", async () => {
    const student = await makeStudent(prisma);
    const task = await mondayTask(student.id);
    await startTimer(prisma, task.id, sundayAt(0), SUNDAY);
    for (let m = 2; m <= 20; m += 2) await pingTimer(prisma, task.id, sundayAt(m));

    const result = await finishTimer(prisma, task.id, sundayAt(20), SUNDAY);

    expect(result.status).toBe("done");
    const after = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: task.id } });
    expect(after.completedAt).toEqual(sundayAt(20));
    expect(toISODate(after.dueDate!)).toBe("2026-10-05");
    const runs = await prisma.timeEntry.findMany({ where: { instanceId: task.id } });
    expect(runs).toHaveLength(1);
    expect(runs[0].date).toEqual(SUNDAY);
  });

  it("sends 'Show me' work to pending review, same as any day", async () => {
    const student = await makeStudent(prisma);
    const task = await mondayTask(student.id, { requiresReview: true });
    await startTimer(prisma, task.id, sundayAt(0), SUNDAY);
    for (let m = 2; m <= 12; m += 2) await pingTimer(prisma, task.id, sundayAt(m));

    expect((await finishTimer(prisma, task.id, sundayAt(12), SUNDAY)).status).toBe("pendingReview");
  });

  it("opens only the very next day — not Tuesday's tasks", async () => {
    const student = await makeStudent(prisma);
    const tuesday = await prisma.assignmentInstance.create({
      data: { title: "Tuesday", studentId: student.id, createdBy: "parent", dueDate: parseISODate("2026-10-06"), originalDueDate: parseISODate("2026-10-06") },
    });
    await expect(startTimer(prisma, tuesday.id, sundayAt(0), SUNDAY)).rejects.toThrow(TimeTrackingError);
  });

  it("never opens tomorrow's tasks on a weekday", async () => {
    const student = await makeStudent(prisma);
    const saturdayTask = await prisma.assignmentInstance.create({
      data: { title: "Saturday", studentId: student.id, createdBy: "parent", dueDate: parseISODate("2026-10-03"), originalDueDate: parseISODate("2026-10-03") },
    });
    await expect(startTimer(prisma, saturdayTask.id, at(0), parseISODate("2026-10-02"))).rejects.toThrow(TimeTrackingError);
  });

  it("counts Sunday's work toward Monday's own total for the bar, and tells it from earlier work", async () => {
    const student = await makeStudent(prisma);
    const task = await mondayTask(student.id);
    await startTimer(prisma, task.id, sundayAt(0), SUNDAY);
    for (let m = 2; m <= 14; m += 2) await pingTimer(prisma, task.id, sundayAt(m));
    await pauseTimer(prisma, task.id, sundayAt(14));

    // Looked at from Sunday itself, and again on Monday morning.
    for (const today of [SUNDAY, MONDAY]) {
      const state = await getTimerState(prisma, task.id, sundayAt(60), today);
      expect(state.closedMs).toBe(14 * 60_000);
      expect(state.closedTodayMs).toBe(14 * 60_000); // a head start is part of its day's work, not "earlier" work
    }
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
    // It really rolled: first due yesterday (when the earlier work happened), carried to today.
    await prisma.assignmentInstance.update({ where: { id: instance.id }, data: { originalDueDate: parseISODate("2026-09-07") } });
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

// A timer is abandoned only after a long silence (LAPSE_AFTER_MS, two hours) —
// a browser stops sending the heartbeat from a background window, so anything
// shorter is a kid still working with the window behind something else. Those
// runs are kept (and the kid is asked on return — see the next describe).
const ABANDONED = 3 * 60; // minutes: comfortably past the two-hour threshold

describe("abandoned timers (§15: two hours without a ping)", () => {
  it("closes an abandoned run at its last ping, on the next read — never counting it up to now", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await keepAlive(instance.id, 0, 8);

    // The lid closes after the 8-minute ping; three hours later, someone looks.
    const state = await getTimerState(prisma, instance.id, at(8 + ABANDONED));

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

    const runs = await loadRunsInRange(prisma, student.id, TODAY, TODAY, at(6 + ABANDONED));

    expect(runs).toHaveLength(1);
    expect(runs[0].endedAt).toEqual(at(6));
  });

  it("is safe when two requests sweep the same abandoned run at once", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await keepAlive(instance.id, 0, 8);

    // e.g. the student page and the dashboard both loading at the same moment.
    const later = at(8 + ABANDONED);
    await Promise.all([sweepLapsedRuns(prisma, student.id, later), sweepLapsedRuns(prisma, student.id, later)]);

    const runs = await prisma.timeEntry.findMany({ where: { instanceId: instance.id } });
    expect(runs).toHaveLength(1);
    expect(runs[0].endReason).toBe("lapsed");
    expect(runs[0].endedAt).toEqual(at(8));
  });

  it("a ping after a very long silence closes the run at its last ping — it was abandoned", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await keepAlive(instance.id, 0, 6);

    const result = await pingTimer(prisma, instance.id, at(6 + ABANDONED));

    expect(result).toEqual({ running: false, awaySinceMs: null });
    const run = await prisma.timeEntry.findFirstOrThrow({ where: { instanceId: instance.id } });
    expect(run.endedAt).toEqual(at(6));
    expect(run.endReason).toBe("lapsed");
  });

  it("discards an abandoned run that never lasted the minimum", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY); // never pinged again

    await sweepLapsedRuns(prisma, student.id, at(ABANDONED));

    expect(await prisma.timeEntry.count()).toBe(0);
  });

  it("starting a new task after an abandoned run closes the old one as lapsed, at its last ping", async () => {
    const student = await makeStudent(prisma);
    const math = await makeInstance(student.id, null, { title: "Math" });
    const latin = await makeInstance(student.id, null, { title: "Latin" });
    await startTimer(prisma, math.id, at(0), TODAY);
    await pingTimer(prisma, math.id, at(3));

    await startTimer(prisma, latin.id, at(3 + ABANDONED), TODAY);

    const mathRun = await prisma.timeEntry.findFirstOrThrow({ where: { instanceId: math.id } });
    expect(mathRun.endReason).toBe("lapsed");
    expect(mathRun.endedAt).toEqual(at(3));
  });
});

// The failure that prompted this: a kid works on paper with the timer window in
// the background. Browsers stop sending the "still here" ping from a background
// window, so the timer looked abandoned — and when he came back, his real work
// was thrown away. Silence is not abandonment: only a long silence is, and a
// window that comes back is asked, not overruled.
describe("a window that goes to the background while the kid keeps working", () => {
  /** Math: a 15-minute session, paused; restarted at :20 and pinged once at :22 — then silence. */
  async function mathWithAQuietSecondSession() {
    const student = await makeStudent(prisma);
    const math = await makeInstance(student.id, null, { title: "Math" });
    await startTimer(prisma, math.id, at(0), TODAY);
    await keepAlive(math.id, 0, 15);
    await pauseTimer(prisma, math.id, at(15));
    await startTimer(prisma, math.id, at(20), TODAY);
    await pingTimer(prisma, math.id, at(22));
    return { student, math };
  }

  it("keeps the second session when the window comes back 25 minutes later (the reported bug)", async () => {
    const { math } = await mathWithAQuietSecondSession();

    // He works on paper while the window sits in the background; no pings for 25 minutes.
    const back = await pingTimer(prisma, math.id, at(47));

    expect(back.running).toBe(true);
    const state = await getTimerState(prisma, math.id, at(47), TODAY);
    expect(state.openStartedAtMs).toBe(at(20).getTime());
    expect(state.closedMs + (at(47).getTime() - state.openStartedAtMs!)).toBe((15 + 27) * 60_000);
    expect((await prisma.timeEntry.findMany({ where: { instanceId: math.id } })).map((r) => r.endReason)).toEqual(["paused", null]);
  });

  it("tells the window how long it was away, so it can ask 'keep that time?'", async () => {
    const { math } = await mathWithAQuietSecondSession();

    const back = await pingTimer(prisma, math.id, at(47));

    expect(back).toEqual({ running: true, awaySinceMs: at(22).getTime() });
  });

  it("doesn't bother the kid over an ordinary gap", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await pingTimer(prisma, instance.id, at(2));

    expect(await pingTimer(prisma, instance.id, at(2, 40))).toEqual({ running: true, awaySinceMs: null });
    // Even a gap just under the question threshold: no prompt.
    expect((await pingTimer(prisma, instance.id, at(7, 30))).awaySinceMs).toBeNull();
  });

  it("'stop where it went quiet' ends the run at the last ping, not now — keeping the first session too", async () => {
    const { math } = await mathWithAQuietSecondSession();
    const back = await pingTimer(prisma, math.id, at(47));

    await trimTimer(prisma, math.id, back.awaySinceMs!, at(47));

    const runs = await prisma.timeEntry.findMany({ where: { instanceId: math.id }, orderBy: { startedAt: "asc" } });
    expect(runs.map((r) => [r.endedAt, r.endReason])).toEqual([[at(15), "paused"], [at(22), "paused"]]);
    expect((await getTimerState(prisma, math.id, at(50), TODAY)).closedMs).toBe((15 + 2) * 60_000);
  });

  it("trimming can't end a run before it began or after now, and a run trimmed to nothing is discarded", async () => {
    const student = await makeStudent(prisma);
    const a = await makeInstance(student.id, null, { title: "A" });
    await startTimer(prisma, a.id, at(10), TODAY);
    await pingTimer(prisma, a.id, at(12));
    // Asked to end it before it even started, or tomorrow: clamped to its own life.
    expect((await trimTimer(prisma, a.id, at(0).getTime(), at(30))).discarded).toBe(true); // clamps to its start: zero length
    expect(await prisma.timeEntry.count()).toBe(0);

    const b = await makeInstance(student.id, null, { title: "B" });
    await startTimer(prisma, b.id, at(40), TODAY);
    await pingTimer(prisma, b.id, at(42));
    await trimTimer(prisma, b.id, at(500).getTime(), at(60));
    expect((await prisma.timeEntry.findFirstOrThrow({ where: { instanceId: b.id } })).endedAt).toEqual(at(60));
  });

  it("trimming with nothing running does nothing", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    expect(await trimTimer(prisma, instance.id, at(5).getTime(), at(10))).toEqual({ discarded: false });
  });

  it("switching tasks after a long silence ends the old run at its last ping, not now", async () => {
    const student = await makeStudent(prisma);
    const math = await makeInstance(student.id, null, { title: "Math" });
    const latin = await makeInstance(student.id, null, { title: "Latin" });
    await startTimer(prisma, math.id, at(0), TODAY);
    await keepAlive(math.id, 0, 20);

    // Window quiet from :20; he picks up Latin at :55 without ever pausing Math.
    await startTimer(prisma, latin.id, at(55), TODAY);

    const mathRun = await prisma.timeEntry.findFirstOrThrow({ where: { instanceId: math.id } });
    expect(mathRun.endReason).toBe("switched");
    expect(mathRun.endedAt).toEqual(at(20)); // the last time we know he was on it — not :55
  });

  it("switching tasks right away still ends the old run at now", async () => {
    const student = await makeStudent(prisma);
    const math = await makeInstance(student.id, null, { title: "Math" });
    const latin = await makeInstance(student.id, null, { title: "Latin" });
    await startTimer(prisma, math.id, at(0), TODAY);
    await keepAlive(math.id, 0, 20);

    await startTimer(prisma, latin.id, at(21), TODAY);

    expect((await prisma.timeEntry.findFirstOrThrow({ where: { instanceId: math.id } })).endedAt).toEqual(at(21));
  });

  it("lets a reloaded screen see it was away: the timer state carries the last ping", async () => {
    const { math } = await mathWithAQuietSecondSession();

    const state = await getTimerState(prisma, math.id, at(47), TODAY);

    expect(state.lastPingAtMs).toBe(at(22).getTime());
    expect(state.openStartedAtMs).toBe(at(20).getTime());
    expect(state.serverNowMs - state.lastPingAtMs!).toBeGreaterThan(AWAY_AFTER_MS);
  });

  it("has no last ping when nothing is running", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    expect((await getTimerState(prisma, instance.id, at(0), TODAY)).lastPingAtMs).toBeNull();
  });
});

describe("pingTimer and findOpenRun", () => {
  it("refreshes the ping of a live run", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);

    expect(await pingTimer(prisma, instance.id, at(0, 30))).toEqual({ running: true, awaySinceMs: null });
    expect((await prisma.timeEntry.findFirstOrThrow({ where: { instanceId: instance.id } })).lastPingAt).toEqual(at(0, 30));
  });

  it("says not running when nothing is open", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    expect(await pingTimer(prisma, instance.id, at(0))).toEqual({ running: false, awaySinceMs: null });
  });

  it("finds the student's still-running timer so a reload lands back on it", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await pingTimer(prisma, instance.id, at(2));

    const open = await findOpenRun(prisma, student.id, at(3));
    expect(open?.instanceId).toBe(instance.id);
  });

  it("still offers a quiet-but-not-abandoned run as running — the window may come back", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await pingTimer(prisma, instance.id, at(2));

    expect((await findOpenRun(prisma, student.id, at(90)))?.instanceId).toBe(instance.id);
  });

  it("doesn't offer an abandoned run as 'still running'", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeInstance(student.id, null);
    await startTimer(prisma, instance.id, at(0), TODAY);
    await pingTimer(prisma, instance.id, at(2));

    expect(await findOpenRun(prisma, student.id, at(2 + ABANDONED))).toBeNull();
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

  describe("editRunClockTimes (the editor's clock-time inputs)", () => {
    // A run at 9:00:07 - 9:35:42 AM PDT, so a stray seconds value is visible if it's lost.
    async function runWithSeconds(studentId: string, instanceId: string) {
      return prisma.timeEntry.create({
        data: {
          studentId,
          instanceId,
          title: "Task",
          date: TODAY,
          startedAt: new Date(T0 + 7_000),
          endedAt: new Date(T0 + 35 * 60_000 + 42_000),
          lastPingAt: new Date(T0 + 35 * 60_000 + 42_000),
          endReason: "paused",
        },
      });
    }

    it("changes only the end and leaves the start's exact value alone", async () => {
      const student = await makeStudent(prisma);
      const instance = await makeInstance(student.id, null);
      const run = await runWithSeconds(student.id, instance.id);

      await editRunClockTimes(prisma, run.id, { start: "09:00", end: "09:20" }, at(120));

      const after = await prisma.timeEntry.findUniqueOrThrow({ where: { id: run.id } });
      expect(after.startedAt.getTime()).toBe(T0 + 7_000); // "09:00" is what's shown, so it's untouched
      expect(after.endedAt).toEqual(at(20));
      expect(after.editedByParent).toBe(true);
    });

    it("changes the start", async () => {
      const student = await makeStudent(prisma);
      const instance = await makeInstance(student.id, null);
      const run = await runWithSeconds(student.id, instance.id);

      await editRunClockTimes(prisma, run.id, { start: "09:10" }, at(120));

      expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: run.id } })).startedAt).toEqual(at(10));
    });

    it("rejects a malformed time, an end before the start, and a time that would overlap", async () => {
      const student = await makeStudent(prisma);
      const a = await makeInstance(student.id, null);
      const b = await makeInstance(student.id, null);
      const run = await runWithSeconds(student.id, a.id);
      await closedRun(student.id, b.id, 60, 90);

      await expect(editRunClockTimes(prisma, run.id, { end: "9:20" }, at(200))).rejects.toThrow(/isn't a time/);
      await expect(editRunClockTimes(prisma, run.id, { end: "08:30" }, at(200))).rejects.toThrow(/end after it starts/);
      await expect(editRunClockTimes(prisma, run.id, { end: "10:15" }, at(200))).rejects.toThrow(/overlaps/);
    });
  });

  describe("stopping a timer someone forgot to stop", () => {
    it("gives a running run an end time and stops it there, marked as hand-edited", async () => {
      const student = await makeStudent(prisma);
      const instance = await makeInstance(student.id, null);
      const running = await startTimer(prisma, instance.id, at(0), TODAY);
      for (let m = 2; m <= 60; m += 2) await pingTimer(prisma, instance.id, at(m)); // left running for an hour

      await editRunClockTimes(prisma, running.id, { end: "09:35" }, at(65)); // at(0) is 9:00 AM PDT

      const after = await prisma.timeEntry.findUniqueOrThrow({ where: { id: running.id } });
      expect(after.endedAt).toEqual(at(35));
      expect(after.endReason).toBe("paused");
      expect(after.editedByParent).toBe(true);
      // The kid's screen finds out on its next heartbeat: nothing is running any more.
      expect(await pingTimer(prisma, instance.id, at(66))).toEqual({ running: false, awaySinceMs: null });
    });

    it("needs an end time, a real one, in the past, after the start", async () => {
      const student = await makeStudent(prisma);
      const instance = await makeInstance(student.id, null);
      const running = await startTimer(prisma, instance.id, at(10), TODAY);

      await expect(editRunClockTimes(prisma, running.id, {}, at(30))).rejects.toThrow(/end time/);
      await expect(editRunClockTimes(prisma, running.id, { end: "9:20" }, at(30))).rejects.toThrow(/isn't a time/);
      await expect(editRunClockTimes(prisma, running.id, { end: "09:05" }, at(30))).rejects.toThrow(/end after it starts/);
      await expect(editRunClockTimes(prisma, running.id, { end: "11:00" }, at(30))).rejects.toThrow(/hasn't|future/);
      expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: running.id } })).endedAt).toBeNull();
    });

    it("won't stop it on top of another of the student's runs, and names the one in the way", async () => {
      const student = await makeStudent(prisma);
      const a = await makeInstance(student.id, null, { title: "Math" });
      const b = await makeInstance(student.id, null, { title: "Latin cards" });
      const running = await startTimer(prisma, a.id, at(0), TODAY);
      // A later run on another task, 9:40-9:50.
      await prisma.timeEntry.create({
        data: { studentId: student.id, instanceId: b.id, title: "Latin cards", date: TODAY, startedAt: at(40), endedAt: at(50), lastPingAt: at(50), endReason: "paused" },
      });

      await expect(editRunClockTimes(prisma, running.id, { end: "09:45" }, at(60))).rejects.toThrow(/Latin cards.*9:40 AM – 9:50 AM/);
    });
  });

  describe("adding time a kid forgot to record", () => {
    it("adds an ordinary, hand-entered run on the day it happened, snapshotting the task", async () => {
      const student = await makeStudent(prisma);
      const subject = await makeSubject(prisma);
      const task = await makeInstance(student.id, subject.id, { title: "Long division" });

      const run = await addRun(prisma, task.id, { dateISO: "2026-09-08", start: "09:10", end: "09:40" }, at(120));

      expect(run).toMatchObject({ studentId: student.id, instanceId: task.id, title: "Long division", subjectId: subject.id, editedByParent: true, endReason: "paused" });
      expect(run.startedAt).toEqual(at(10));
      expect(run.endedAt).toEqual(at(40));
      expect(run.date).toEqual(parseISODate("2026-09-08"));
      // It counts toward the task's time like any other.
      expect((await getTimerState(prisma, task.id, at(130), TODAY)).closedMs).toBe(30 * 60_000);
    });

    it("lands on the day given, not the task's due date — a make-up session or a head start", async () => {
      const student = await makeStudent(prisma);
      const task = await makeInstance(student.id, null, { dueDate: parseISODate("2026-09-10") });

      const run = await addRun(prisma, task.id, { dateISO: "2026-09-06", start: "15:00", end: "15:20" }, at(60 * 24 * 5));

      expect(run.date).toEqual(parseISODate("2026-09-06"));
    });

    it("rejects a bad day, a malformed time, an end before the start, and time that hasn't happened yet", async () => {
      const student = await makeStudent(prisma);
      const task = await makeInstance(student.id, null);
      const now = at(60);

      await expect(addRun(prisma, task.id, { dateISO: "", start: "09:00", end: "09:30" }, now)).rejects.toThrow(/Pick a day/);
      await expect(addRun(prisma, task.id, { dateISO: "2026-09-08", start: "9:00", end: "09:30" }, now)).rejects.toThrow(/isn't a time/);
      await expect(addRun(prisma, task.id, { dateISO: "2026-09-08", start: "09:30", end: "09:30" }, now)).rejects.toThrow(/end after it starts/);
      await expect(addRun(prisma, task.id, { dateISO: "2026-09-08", start: "09:30", end: "09:10" }, now)).rejects.toThrow(/end after it starts/);
      await expect(addRun(prisma, task.id, { dateISO: "2026-09-08", start: "09:30", end: "11:00" }, now)).rejects.toThrow(/hasn't happened/);
      expect(await prisma.timeEntry.count()).toBe(0);
    });

    it("can't overlap another run of the same student — and says which", async () => {
      const student = await makeStudent(prisma);
      const math = await makeInstance(student.id, null, { title: "Math" });
      const latin = await makeInstance(student.id, null, { title: "Latin cards" });
      await addRun(prisma, math.id, { dateISO: "2026-09-08", start: "09:00", end: "09:30" }, at(120));

      await expect(addRun(prisma, latin.id, { dateISO: "2026-09-08", start: "09:20", end: "09:50" }, at(120))).rejects.toThrow(/Math.*9:00 AM – 9:30 AM/);
      // Butting right up against it is fine.
      await addRun(prisma, latin.id, { dateISO: "2026-09-08", start: "09:30", end: "09:50" }, at(120));
    });

    it("can't be added on top of a timer that's running right now", async () => {
      const student = await makeStudent(prisma);
      const math = await makeInstance(student.id, null, { title: "Math" });
      const latin = await makeInstance(student.id, null, { title: "Latin" });
      await startTimer(prisma, math.id, at(0), TODAY);
      await pingTimer(prisma, math.id, at(2));

      await expect(addRun(prisma, latin.id, { dateISO: "2026-09-08", start: "09:01", end: "09:03" }, at(4))).rejects.toThrow(/Math.*now/);
    });

    it("works through the tenant-scoped client the app uses", async () => {
      const family = await prisma.family.create({ data: { name: "Scoped", slug: `scoped-${randomUUID()}` } });
      const scoped = prisma.$extends(tenantScopeExtension(family.id)) as unknown as PrismaClient;
      const student = await scoped.student.create({ data: { name: "Miles", gradeLevel: "7th", accentColor: "#000" } });
      const task = await scoped.assignmentInstance.create({
        data: { title: "Math", studentId: student.id, createdBy: "parent", dueDate: TODAY, originalDueDate: TODAY },
      });

      const run = await addRun(scoped, task.id, { dateISO: "2026-09-08", start: "09:00", end: "09:25" }, at(120));

      expect(run.familyId).toBe(family.id);
    });
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
