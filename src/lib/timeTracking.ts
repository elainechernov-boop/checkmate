import type { PrismaClient, TimeEntry } from "@/generated/prisma/client";
import { InstanceStatus, TimeEntryEndReason } from "@/generated/prisma/enums";
import { formatClockInput, wallClockInstant, zonedDateISO } from "./clockTime";
import { getToday, toISODate } from "./dates";
import { LAPSE_AFTER_MS, MIN_RUN_MS, runDurationMs } from "./timeSummary";

// §15's recording rules, all of them server-enforced. Every function takes
// the server's `now` as a parameter (defaulting to the real clock) so a test
// can walk a run through its whole life without sleeping.

type TimePrisma = Pick<PrismaClient, "timeEntry" | "assignmentInstance" | "$transaction">;
type TimeDb = Pick<PrismaClient, "timeEntry" | "assignmentInstance">;

export class TimeTrackingError extends Error {}

/** Closes a run at `endedAt`. A run shorter than MIN_RUN_MS is deleted
 * instead — an accidental tap, and the way a student checks off work done
 * away from the Mac (§15: "runs under 10 seconds are discarded"). */
async function closeRun(db: TimeDb, run: TimeEntry, endedAt: Date, reason: TimeEntryEndReason): Promise<{ discarded: boolean }> {
  const end = endedAt.getTime() < run.startedAt.getTime() ? run.startedAt : endedAt;
  // deleteMany/updateMany rather than delete/update: two requests can sweep
  // the same lapsed run at once (the student page and the dashboard), and the
  // loser should find it already handled, not throw. Closing only ever touches
  // a run that's still open.
  if (end.getTime() - run.startedAt.getTime() < MIN_RUN_MS) {
    await db.timeEntry.deleteMany({ where: { id: run.id, endedAt: null } });
    return { discarded: true };
  }
  await db.timeEntry.updateMany({ where: { id: run.id, endedAt: null }, data: { endedAt: end, endReason: reason } });
  return { discarded: false };
}

/**
 * An open run with no ping for LAPSE_AFTER_MS is closed at its last ping with
 * `lapsed`. Swept lazily — on any read or write of a student's runs, the
 * dashboard included — so there's no scheduler, and a lapsed run is never
 * counted up to "now."
 */
export async function sweepLapsedRuns(db: TimeDb, studentId: string, now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - LAPSE_AFTER_MS);
  const stale = await db.timeEntry.findMany({ where: { studentId, endedAt: null, lastPingAt: { lt: cutoff } } });
  for (const run of stale) {
    await closeRun(db, run, run.lastPingAt, TimeEntryEndReason.lapsed);
  }
}

function assertToday(dueDate: Date | null, today: Date): void {
  if (!dueDate || toISODate(dueDate) !== toISODate(today)) {
    throw new TimeTrackingError("Only today's items can be timed.");
  }
}

/**
 * Start (or resume — they're the same act) the clock on an item. Only
 * today's open items can be timed, the same rule as check/uncheck (§6). At
 * most one run is ever open per student: starting a different task closes the
 * running one first (`switched`), in the same transaction. Starting the task
 * that's already running is a no-op that just refreshes its ping, so a double
 * tap or a reload can't fork the clock.
 */
export async function startTimer(
  prisma: TimePrisma,
  instanceId: string,
  now: Date = new Date(),
  today: Date = getToday()
): Promise<TimeEntry> {
  return prisma.$transaction(async (tx) => {
    const instance = await tx.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });
    assertToday(instance.dueDate, today);
    if (instance.status !== InstanceStatus.open) {
      throw new TimeTrackingError("Only an open item can be timed.");
    }

    await sweepLapsedRuns(tx, instance.studentId, now);

    const openRuns = await tx.timeEntry.findMany({ where: { studentId: instance.studentId, endedAt: null } });
    const sameTask = openRuns.find((run) => run.instanceId === instanceId);
    if (sameTask) {
      return tx.timeEntry.update({ where: { id: sameTask.id }, data: { lastPingAt: now } });
    }

    for (const run of openRuns) {
      await closeRun(tx, run, now, TimeEntryEndReason.switched);
    }

    return tx.timeEntry.create({
      data: {
        studentId: instance.studentId,
        instanceId,
        title: instance.title,
        subjectId: instance.subjectId,
        date: today,
        startedAt: now,
        lastPingAt: now,
      },
    });
  });
}

/** Pause closes the current run; Resume (startTimer) opens a new one. */
export async function pauseTimer(
  prisma: TimePrisma,
  instanceId: string,
  now: Date = new Date()
): Promise<{ discarded: boolean }> {
  return prisma.$transaction(async (tx) => {
    const instance = await tx.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });
    await sweepLapsedRuns(tx, instance.studentId, now);
    const open = await tx.timeEntry.findFirst({ where: { instanceId, endedAt: null } });
    if (!open) return { discarded: false };
    return closeRun(tx, open, now, TimeEntryEndReason.paused);
  });
}

/**
 * The timer screen's heartbeat. Refreshes the open run's ping; if the run has
 * already gone quiet past LAPSE_AFTER_MS (a suspended tab waking up), it is
 * closed at its last ping instead and the screen is told it isn't running —
 * a late ping never resurrects time nobody was watching.
 */
export async function pingTimer(
  prisma: TimePrisma,
  instanceId: string,
  now: Date = new Date()
): Promise<{ running: boolean }> {
  return prisma.$transaction(async (tx) => {
    const open = await tx.timeEntry.findFirst({ where: { instanceId, endedAt: null } });
    if (!open) return { running: false };
    if (now.getTime() - open.lastPingAt.getTime() > LAPSE_AFTER_MS) {
      await closeRun(tx, open, open.lastPingAt, TimeEntryEndReason.lapsed);
      return { running: false };
    }
    await tx.timeEntry.update({ where: { id: open.id }, data: { lastPingAt: now } });
    return { running: true };
  });
}

/**
 * Finish: closes the run (`finished`) and applies §6's completion transition
 * in the same transaction — pendingReview for "Show me" work (the clock stops
 * here, not at parent approval), otherwise done — with completedAt on the
 * very same timestamp the run ended. A Finish pressed within seconds of
 * starting records no time at all (the sub-10-second discard), which is how
 * work done away from the Mac gets checked off as *untimed*.
 */
export async function finishTimer(
  prisma: TimePrisma,
  instanceId: string,
  now: Date = new Date(),
  today: Date = getToday()
): Promise<{ status: InstanceStatus; discardedRun: boolean }> {
  return prisma.$transaction(async (tx) => {
    const instance = await tx.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });
    assertToday(instance.dueDate, today);
    // Finishing something already finished (a double tap) is a no-op.
    if (instance.status !== InstanceStatus.open) {
      return { status: instance.status, discardedRun: false };
    }

    await sweepLapsedRuns(tx, instance.studentId, now);

    let discardedRun = false;
    const open = await tx.timeEntry.findFirst({ where: { instanceId, endedAt: null } });
    if (open) {
      discardedRun = (await closeRun(tx, open, now, TimeEntryEndReason.finished)).discarded;
    }

    const status = instance.requiresReview ? InstanceStatus.pendingReview : InstanceStatus.done;
    await tx.assignmentInstance.update({
      where: { id: instanceId },
      data: { status, completedAt: now, returnNote: null },
    });
    return { status, discardedRun };
  });
}

/** What the timer screen needs to draw itself and keep counting: the task's
 * closed total, plus the open run's start (if any). The client adds
 * `(its own clock + serverOffset) - openStartedAt` for the live part, so its
 * clock can't skew the record. */
export interface TimerState {
  closedMs: number;
  /** The part of `closedMs` logged on today's date — the rest is earlier
   * days' work on a task that rolled in. Lets the timer screen's top-edge day
   * bar tell "worked today" from "worked before." */
  closedTodayMs: number;
  openStartedAtMs: number | null;
  /** When the task was first started *today* — the screen's "Started 9:42 AM,"
   * which shouldn't quote a rolled task's start from yesterday. */
  firstStartedAtMs: number | null;
  serverNowMs: number;
}

export async function getTimerState(
  prisma: TimeDb,
  instanceId: string,
  now: Date = new Date(),
  today: Date = getToday()
): Promise<TimerState> {
  const instance = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });
  await sweepLapsedRuns(prisma, instance.studentId, now);

  const runs = await prisma.timeEntry.findMany({ where: { instanceId }, orderBy: { startedAt: "asc" } });
  const open = runs.find((run) => !run.endedAt) ?? null;
  const closedRuns = runs.filter((run) => run.endedAt);
  const closedMs = closedRuns.reduce((sum, run) => sum + runDurationMs(run, now), 0);
  const todayISO = toISODate(today);
  const closedTodayMs = closedRuns
    .filter((run) => toISODate(run.date) === todayISO)
    .reduce((sum, run) => sum + runDurationMs(run, now), 0);

  return {
    closedMs,
    closedTodayMs,
    openStartedAtMs: open ? open.startedAt.getTime() : null,
    firstStartedAtMs: runs.find((run) => toISODate(run.date) === todayISO)?.startedAt.getTime() ?? null,
    serverNowMs: now.getTime(),
  };
}

/** The student's still-running timer, if any — so a reload or crash lands
 * straight back on it (§15). */
export async function findOpenRun(prisma: TimeDb, studentId: string, now: Date = new Date()): Promise<TimeEntry | null> {
  await sweepLapsedRuns(prisma, studentId, now);
  return prisma.timeEntry.findFirst({ where: { studentId, endedAt: null } });
}

/** Time logged per task per calendar day, in ms — `{ [instanceId]: { [yyyy-mm-dd]: ms } }`.
 * Feeds the student's day bar (and the timer screen's live copy of it).
 * Counts an open run up to `now`. */
export type TimeLogByInstance = Record<string, Record<string, number>>;

export async function timeLoggedByInstance(
  prisma: TimeDb,
  studentId: string,
  instanceIds: string[],
  now: Date = new Date()
): Promise<TimeLogByInstance> {
  if (instanceIds.length === 0) return {};
  await sweepLapsedRuns(prisma, studentId, now);
  const runs = await prisma.timeEntry.findMany({ where: { studentId, instanceId: { in: instanceIds } } });

  const log: TimeLogByInstance = {};
  for (const run of runs) {
    if (!run.instanceId) continue;
    const byDate = (log[run.instanceId] ??= {});
    const key = toISODate(run.date);
    byDate[key] = (byDate[key] ?? 0) + runDurationMs(run, now);
  }
  return log;
}

/** Every run for a student across a date range (inclusive), oldest first —
 * the dashboard's raw material. Sweeps first, so nothing lapsed is counted
 * up to "now." */
export async function loadRunsInRange(
  prisma: TimeDb,
  studentId: string,
  from: Date,
  to: Date,
  now: Date = new Date()
): Promise<TimeEntry[]> {
  await sweepLapsedRuns(prisma, studentId, now);
  return prisma.timeEntry.findMany({
    where: { studentId, date: { gte: from, lte: to } },
    orderBy: { startedAt: "asc" },
  });
}

/**
 * Parent correction (§15): move a closed run's start/end. The new span must
 * be a real one (end after start, not in the future) and must not overlap
 * any of the student's other runs — the same one-clock invariant the timer
 * itself keeps. The run is marked `editedByParent` so the dashboard can say
 * so. There is deliberately no "add time."
 */
export async function updateRunTimes(
  prisma: TimePrisma,
  runId: string,
  startedAt: Date,
  endedAt: Date,
  now: Date = new Date()
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const run = await tx.timeEntry.findUniqueOrThrow({ where: { id: runId } });
    if (!run.endedAt) throw new TimeTrackingError("A running timer can't be edited.");
    if (endedAt.getTime() <= startedAt.getTime()) throw new TimeTrackingError("A run has to end after it starts.");
    if (endedAt.getTime() > now.getTime()) throw new TimeTrackingError("A run can't end in the future.");

    const others = await tx.timeEntry.findMany({ where: { studentId: run.studentId, id: { not: runId } } });
    const overlaps = others.some((other) => {
      const otherEnd = (other.endedAt ?? now).getTime();
      return other.startedAt.getTime() < endedAt.getTime() && otherEnd > startedAt.getTime();
    });
    if (overlaps) throw new TimeTrackingError("That overlaps another run.");

    await tx.timeEntry.update({ where: { id: runId }, data: { startedAt, endedAt, editedByParent: true } });
  });
}

/**
 * The parent's editor works in clock times ("09:42"), not instants: this turns
 * an edited start and/or end into real instants on the run's own calendar day
 * and hands them to updateRunTimes (which owns the validation). A field left
 * out — or left equal to what's already shown — keeps its exact stored value,
 * seconds and all, so nudging only the end never perturbs the start.
 */
export async function editRunClockTimes(
  prisma: TimePrisma,
  runId: string,
  edit: { start?: string | null; end?: string | null },
  now: Date = new Date()
): Promise<void> {
  const run = await prisma.timeEntry.findUniqueOrThrow({ where: { id: runId } });
  if (!run.endedAt) throw new TimeTrackingError("A running timer can't be edited.");

  const dateISO = zonedDateISO(run.startedAt);
  const resolve = (value: string | null | undefined, current: Date): Date => {
    if (!value || value === formatClockInput(current)) return current;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new TimeTrackingError("That isn't a time.");
    return wallClockInstant(dateISO, value);
  };

  await updateRunTimes(prisma, runId, resolve(edit.start, run.startedAt), resolve(edit.end, run.endedAt), now);
}

export async function deleteRun(prisma: TimeDb, runId: string): Promise<void> {
  await prisma.timeEntry.delete({ where: { id: runId } });
}
