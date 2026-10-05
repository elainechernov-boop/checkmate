import type { PrismaClient, TimeEntry } from "@/generated/prisma/client";
import { InstanceStatus, TimeEntryEndReason } from "@/generated/prisma/enums";
import { formatClockInput, formatClockTime, wallClockInstant, zonedDateISO } from "./clockTime";
import { getToday, parseISODate, toISODate } from "./dates";
import { splitLoggedTime } from "./dayBar";
import { AWAY_AFTER_MS, LAPSE_AFTER_MS, MIN_RUN_MS, runDurationMs } from "./timeSummary";
import { canWorkOn } from "./workAhead";

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
 * An open run with no ping for LAPSE_AFTER_MS — long enough that it's been
 * abandoned, not just a window sitting in the background — is closed at its
 * last ping with `lapsed`. Swept lazily — on any read or write of a student's
 * runs, the dashboard included — so there's no scheduler, and an abandoned run
 * is never counted up to "now."
 */
export async function sweepLapsedRuns(db: TimeDb, studentId: string, now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - LAPSE_AFTER_MS);
  const stale = await db.timeEntry.findMany({ where: { studentId, endedAt: null, lastPingAt: { lt: cutoff } } });
  for (const run of stale) {
    await closeRun(db, run, run.lastPingAt, TimeEntryEndReason.lapsed);
  }
}

function assertWorkable(dueDate: Date | null, today: Date): void {
  if (!canWorkOn(dueDate, today)) {
    throw new TimeTrackingError("Only today's items can be timed — or, on a Sunday, tomorrow's.");
  }
}

/**
 * Start (or resume — they're the same act) the clock on an item. Only
 * today's open items can be timed, the same rule as check/uncheck (§6) — plus,
 * on a Sunday, tomorrow's (workAhead.ts). The run is dated *today* either way:
 * a head start is recorded as the day it actually happened. At
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
    assertWorkable(instance.dueDate, today);
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
      // Starting another task says the kid has moved on — but not when. If the
      // old run has been silent a while, its last ping is the last time we know
      // he was on it; counting up to now would credit the gap to the wrong task.
      const silentMs = now.getTime() - run.lastPingAt.getTime();
      await closeRun(tx, run, silentMs > AWAY_AFTER_MS ? run.lastPingAt : now, TimeEntryEndReason.switched);
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

export interface PingResult {
  running: boolean;
  /** When the window was last heard from before this ping — set only when the
   * silence was long enough (AWAY_AFTER_MS) that the screen should ask the kid
   * whether to keep the time, and where "stop" would end the run. */
  awaySinceMs: number | null;
}

/**
 * The timer screen's heartbeat. Refreshes the open run's ping.
 *
 * A browser stops sending heartbeats from a background window, so a ping that
 * arrives after a long silence is *the window coming back*, not proof the kid
 * stopped — he may have been working on paper the whole time. Such a run is
 * kept running (the time counts) and the ping reports how long it was away so
 * the screen can ask "keep that time?" (see trimTimer for "no"). Only silence
 * past LAPSE_AFTER_MS is treated as abandonment: the run is closed at its last
 * ping and the screen is told it isn't running.
 */
export async function pingTimer(prisma: TimePrisma, instanceId: string, now: Date = new Date()): Promise<PingResult> {
  return prisma.$transaction(async (tx) => {
    const open = await tx.timeEntry.findFirst({ where: { instanceId, endedAt: null } });
    if (!open) return { running: false, awaySinceMs: null };
    const silentMs = now.getTime() - open.lastPingAt.getTime();
    if (silentMs > LAPSE_AFTER_MS) {
      await closeRun(tx, open, open.lastPingAt, TimeEntryEndReason.lapsed);
      return { running: false, awaySinceMs: null };
    }
    await tx.timeEntry.update({ where: { id: open.id }, data: { lastPingAt: now } });
    return { running: true, awaySinceMs: silentMs > AWAY_AFTER_MS ? open.lastPingAt.getTime() : null };
  });
}

/**
 * "Welcome back — keep that time?" answered *no*: end the running run where it
 * stood before the silence (`endAtMs`, the moment the window was last heard
 * from) instead of now. The end is kept inside the run's own life — never
 * before it began, never in the future — and a run trimmed to nothing is
 * discarded like any other accidental one.
 */
export async function trimTimer(
  prisma: TimePrisma,
  instanceId: string,
  endAtMs: number,
  now: Date = new Date()
): Promise<{ discarded: boolean }> {
  return prisma.$transaction(async (tx) => {
    const open = await tx.timeEntry.findFirst({ where: { instanceId, endedAt: null } });
    if (!open) return { discarded: false };
    const endAt = new Date(Math.min(Math.max(endAtMs, open.startedAt.getTime()), now.getTime()));
    return closeRun(tx, open, endAt, TimeEntryEndReason.paused);
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
    assertWorkable(instance.dueDate, today);
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
  /** When the open run was last heard from (null if none is open) — lets a
   * freshly reloaded screen tell it was away, and ask, before its own first
   * ping erases that. */
  lastPingAtMs: number | null;
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
  // "Today's" share, in the bar's sense (dayBar.ts's splitLoggedTime): relative
  // to the day this task is due — which is tomorrow, not today, for a Sunday
  // head start — so a head start counts toward the day it was for.
  const closedByDate: Record<string, number> = {};
  for (const run of closedRuns) {
    const key = toISODate(run.date);
    closedByDate[key] = (closedByDate[key] ?? 0) + runDurationMs(run, now);
  }
  const dueISO = toISODate(instance.dueDate ?? today);
  const { loggedTodayMs: closedTodayMs } = splitLoggedTime(
    closedByDate,
    dueISO,
    instance.originalDueDate ? toISODate(instance.originalDueDate) : null
  );

  return {
    lastPingAtMs: open ? open.lastPingAt.getTime() : null,
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

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The one-clock rule the timer itself keeps: a student can't be on two things
 * at once, so no run may overlap another of theirs (a run still going counts
 * as lasting until `now`). Says *which* run it collides with, so a parent
 * fixing a day can see what to move. */
async function assertNoOverlap(
  db: TimeDb,
  studentId: string,
  ignoreRunId: string | null,
  start: Date,
  end: Date,
  now: Date
): Promise<void> {
  const others = await db.timeEntry.findMany({
    where: { studentId, ...(ignoreRunId ? { id: { not: ignoreRunId } } : {}) },
  });
  const clash = others.find((other) => other.startedAt.getTime() < end.getTime() && (other.endedAt ?? now).getTime() > start.getTime());
  if (clash) {
    const span = `${formatClockTime(clash.startedAt)} – ${clash.endedAt ? formatClockTime(clash.endedAt) : "now"}`;
    throw new TimeTrackingError(`That overlaps "${clash.title}" (${span}).`);
  }
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

    await assertNoOverlap(tx, run.studentId, runId, startedAt, endedAt, now);

    await tx.timeEntry.update({ where: { id: runId }, data: { startedAt, endedAt, editedByParent: true } });
  });
}

/**
 * The parent's editor works in clock times ("09:42"), not instants: this turns
 * an edited start and/or end into real instants on the run's own calendar day
 * and hands them to updateRunTimes (which owns the validation). A field left
 * out — or left equal to what's already shown — keeps its exact stored value,
 * seconds and all, so nudging only the end never perturbs the start.
 *
 * A timer someone forgot to stop can be fixed here too: give a running run an
 * end time and it stops there (its screen finds out on its next heartbeat).
 */
export async function editRunClockTimes(
  prisma: TimePrisma,
  runId: string,
  edit: { start?: string | null; end?: string | null },
  now: Date = new Date()
): Promise<void> {
  const run = await prisma.timeEntry.findUniqueOrThrow({ where: { id: runId } });

  const dateISO = zonedDateISO(run.startedAt);
  const resolve = (value: string | null | undefined, current: Date): Date => {
    if (!value || value === formatClockInput(current)) return current;
    if (!CLOCK_TIME.test(value)) throw new TimeTrackingError("That isn't a time.");
    return wallClockInstant(dateISO, value);
  };

  if (run.endedAt) {
    await updateRunTimes(prisma, runId, resolve(edit.start, run.startedAt), resolve(edit.end, run.endedAt), now);
    return;
  }

  // Still running: stopping it needs an end time.
  if (!edit.end) throw new TimeTrackingError("Set an end time to stop it.");
  const startedAt = resolve(edit.start, run.startedAt);
  if (!CLOCK_TIME.test(edit.end)) throw new TimeTrackingError("That isn't a time.");
  const endedAt = wallClockInstant(dateISO, edit.end);
  await prisma.$transaction(async (tx) => {
    if (endedAt.getTime() <= startedAt.getTime()) throw new TimeTrackingError("A run has to end after it starts.");
    if (endedAt.getTime() > now.getTime()) throw new TimeTrackingError("A run can't end in the future.");
    await assertNoOverlap(tx, run.studentId, runId, startedAt, endedAt, now);
    // Closed only if it's still open — the kid's own pause may have beaten us to it.
    await tx.timeEntry.updateMany({
      where: { id: runId, endedAt: null },
      data: { startedAt, endedAt, endReason: TimeEntryEndReason.paused, editedByParent: true },
    });
  });
}

export interface AddedRun {
  /** The calendar day the work happened on, `yyyy-mm-dd`. */
  dateISO: string;
  /** Wall-clock `HH:MM`, in the app's timezone. */
  start: string;
  end: string;
}

/**
 * Parent correction (§15): add time a kid forgot to record — a timer never
 * started, or a session that got lost. It's an ordinary run on the day the
 * work happened, marked `editedByParent` so the dashboard says it was entered
 * by hand, and held to the same rules as a timed one: it has to be a real span
 * that's already happened, and it can't overlap another of the student's runs.
 * Attributed to the day given, not the task's due date, so a head start or a
 * make-up session lands on the day it was actually done.
 */
export async function addRun(
  prisma: TimePrisma,
  instanceId: string,
  input: AddedRun,
  now: Date = new Date()
): Promise<TimeEntry> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateISO)) throw new TimeTrackingError("Pick a day.");
  if (!CLOCK_TIME.test(input.start) || !CLOCK_TIME.test(input.end)) throw new TimeTrackingError("That isn't a time.");
  const startedAt = wallClockInstant(input.dateISO, input.start);
  const endedAt = wallClockInstant(input.dateISO, input.end);
  if (endedAt.getTime() <= startedAt.getTime()) throw new TimeTrackingError("A run has to end after it starts.");
  if (endedAt.getTime() > now.getTime()) throw new TimeTrackingError("That time hasn't happened yet.");

  return prisma.$transaction(async (tx) => {
    const instance = await tx.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });
    await sweepLapsedRuns(tx, instance.studentId, now);
    await assertNoOverlap(tx, instance.studentId, null, startedAt, endedAt, now);
    return tx.timeEntry.create({
      data: {
        studentId: instance.studentId,
        instanceId,
        title: instance.title,
        subjectId: instance.subjectId,
        date: parseISODate(input.dateISO),
        startedAt,
        endedAt,
        lastPingAt: endedAt,
        endReason: TimeEntryEndReason.paused,
        editedByParent: true,
      },
    });
  });
}

export async function deleteRun(prisma: TimeDb, runId: string): Promise<void> {
  await prisma.timeEntry.delete({ where: { id: runId } });
}
