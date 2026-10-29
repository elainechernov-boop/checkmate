import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

type StampPrisma = Pick<
  PrismaClient,
  | "assignmentInstance"
  | "timeEntry"
  | "project"
  | "daySeparator"
  | "subject"
  | "calendarEventAssignment"
  | "dismissedCalendarEvent"
  | "familyCalendarSettings"
>;

/**
 * A short fingerprint of everything that decides what a student's week view
 * shows, cheap enough to ask for every few seconds. A student's open tab
 * compares it with the one it was rendered with and re-reads the whole week
 * only when it differs, so a parent's edit reaches the kid's screen within
 * seconds while an idle tab costs a handful of tiny queries (a full week
 * render is far heavier, and over a hosted database every row it reads is
 * metered).
 *
 * Only aggregates and a few tiny tables, never the week itself. Anything an
 * edit can change shows up in one of them: an instance's updatedAt moves on
 * every edit, reorder, check-off and roll-forward, and its count moves on a
 * create or delete. A running timer's heartbeat only touches
 * TimeEntry.lastPingAt, which is deliberately left out, so a timer does not
 * make every other tab refresh every 30 seconds. What this cannot see (a past
 * time entry edited in place, the external calendar feed) is picked up by the
 * view's slower full refresh.
 */
export async function computeStudentStamp(prisma: StampPrisma, studentId: string): Promise<string> {
  const [instances, timeEntries, projects, separators, subjects, assignedEvents, dismissedEvents, calendarSettings] =
    await Promise.all([
      prisma.assignmentInstance.aggregate({
        where: { studentId },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      prisma.timeEntry.aggregate({
        where: { studentId },
        _count: { _all: true },
        _max: { startedAt: true, endedAt: true },
      }),
      prisma.project.aggregate({
        where: { studentId },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      // A separator has no updatedAt, and reordering only permutes sortOrder
      // (a count or a sum would not notice), so these few rows are read whole.
      prisma.daySeparator.findMany({ where: { studentId }, orderBy: { id: "asc" } }),
      prisma.subject.findMany({ orderBy: { id: "asc" } }),
      prisma.calendarEventAssignment.aggregate({
        where: { studentId },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.dismissedCalendarEvent.aggregate({ _count: { _all: true }, _max: { createdAt: true } }),
      prisma.familyCalendarSettings.findFirst({ select: { updatedAt: true } }),
    ]);

  const parts = [
    [instances._count._all, instances._max.updatedAt],
    [timeEntries._count._all, timeEntries._max.startedAt, timeEntries._max.endedAt],
    [projects._count._all, projects._max.updatedAt],
    separators,
    subjects,
    [assignedEvents._count._all, assignedEvents._max.createdAt],
    [dismissedEvents._count._all, dismissedEvents._max.createdAt],
    calendarSettings?.updatedAt ?? null,
  ];
  return createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}
