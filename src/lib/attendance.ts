import type { PrismaClient } from "@/generated/prisma/client";
import { CreatedBy, InstanceStatus, SchoolDayType } from "@/generated/prisma/enums";
import { addDays, startOfUTCDay, toISODate } from "./dates";

// §8: "Days marked sick/offDay are excluded from the school-day count."
// Holiday is excluded for the same reason (it's not a school day either); a
// field trip still counts (Blue Ridge counts it as an attended day — it's
// why SchoolDay carries an activityNote), it just has no regular assignments
// materialized on it (§3).
const UNCOUNTABLE_TYPES: readonly SchoolDayType[] = [SchoolDayType.offDay, SchoolDayType.sick, SchoolDayType.holiday];

export function isCountableSchoolDayType(type: SchoolDayType): boolean {
  return !UNCOUNTABLE_TYPES.includes(type);
}

export interface AttendanceDay {
  date: Date;
  type: SchoolDayType;
  countable: boolean;
  // A per-render hint (not persisted) that the student did parent-assigned
  // work this day — never itself the "present" record.
  autoSuggested: boolean;
  // The parent's confirmed "present" record (SchoolDay.attendanceClaimed) —
  // there's no separate present/claimed pair in the schema (§3): a
  // confirmed day IS a claimed day.
  claimed: boolean;
}

/**
 * §8 attendance: one row per calendar day in [start, end] — the school
 * calendar's stored exceptions layered over the implicit default of an
 * ordinary school day (same convention as schoolCalendar.ts's isBlockedDay).
 */
export async function loadAttendanceRange(
  prisma: Pick<PrismaClient, "schoolDay" | "assignmentInstance">,
  studentId: string,
  start: Date,
  end: Date
): Promise<AttendanceDay[]> {
  const rangeStart = startOfUTCDay(start);
  const rangeEnd = startOfUTCDay(end);

  const [schoolDays, completedInstances] = await Promise.all([
    prisma.schoolDay.findMany({ where: { studentId, date: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.assignmentInstance.findMany({
      where: {
        studentId,
        createdBy: CreatedBy.parent,
        status: InstanceStatus.done,
        dueDate: { gte: rangeStart, lte: rangeEnd },
      },
      select: { dueDate: true },
    }),
  ]);

  const schoolDayByDate = new Map(schoolDays.map((row) => [toISODate(row.date), row]));
  const completedDates = new Set(completedInstances.map((i) => toISODate(i.dueDate!)));

  const days: AttendanceDay[] = [];
  for (let cursor = rangeStart; cursor <= rangeEnd; cursor = addDays(cursor, 1)) {
    const iso = toISODate(cursor);
    const row = schoolDayByDate.get(iso);
    const type = row?.type ?? SchoolDayType.schoolDay;
    // Sunday is never a school day in this app regardless of stored type
    // (§6: the week view has no Sunday column at all) — matches
    // materialize.ts's same exclusion for §7 project plans.
    const isSunday = cursor.getUTCDay() === 0;
    days.push({
      date: cursor,
      type,
      countable: !isSunday && isCountableSchoolDayType(type),
      autoSuggested: completedDates.has(iso),
      claimed: row?.attendanceClaimed ?? false,
    });
  }
  return days;
}

/** One day's "confirm present" click (§8) — the month grid's one-click toggle. */
export async function setAttendanceClaimed(
  prisma: Pick<PrismaClient, "schoolDay">,
  studentId: string,
  date: Date,
  claimed: boolean
): Promise<void> {
  const day = startOfUTCDay(date);
  await prisma.schoolDay.upsert({
    where: { date_studentId: { date: day, studentId } },
    update: { attendanceClaimed: claimed },
    create: { date: day, studentId, attendanceClaimed: claimed },
  });
}

/** The LP-level "claimed" checkbox (§8) — bulk-sets every day in the
 * period at once, for one student; touching offDay/holiday/sick days too
 * is harmless, since `summarizeAttendance` never counts them regardless of
 * this flag. */
export async function setLearningPeriodAttendanceClaimed(
  prisma: Pick<PrismaClient, "schoolDay" | "$transaction">,
  studentId: string,
  start: Date,
  end: Date,
  claimed: boolean
): Promise<void> {
  const rangeStart = startOfUTCDay(start);
  const rangeEnd = startOfUTCDay(end);
  const dates: Date[] = [];
  for (let cursor = rangeStart; cursor <= rangeEnd; cursor = addDays(cursor, 1)) dates.push(cursor);

  await prisma.$transaction(
    dates.map((date) =>
      prisma.schoolDay.upsert({
        where: { date_studentId: { date, studentId } },
        update: { attendanceClaimed: claimed },
        create: { date, studentId, attendanceClaimed: claimed },
      })
    )
  );
}

export function summarizeAttendance(days: AttendanceDay[]) {
  const countableDays = days.filter((d) => d.countable);
  const presentDays = countableDays.filter((d) => d.claimed);
  return {
    schoolDayCount: countableDays.length,
    presentCount: presentDays.length,
    allClaimed: countableDays.length > 0 && countableDays.every((d) => d.claimed),
  };
}
