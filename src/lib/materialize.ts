import type { PrismaClient } from "@/generated/prisma/client";
import { EndCondition, Frequency, InstanceStatus } from "@/generated/prisma/enums";
import { addDays, startOfUTCDay, toISODate, WEEKDAYS, type WeekdayCode } from "./dates";
import { isBlockedDay, loadSchoolDayMap, type SchoolDayMap } from "./schoolCalendar";

export const MATERIALIZATION_HORIZON_DAYS = 60;

const WEEKDAY_ORDER: Record<WeekdayCode, number> = Object.fromEntries(
  WEEKDAYS.map((day, index) => [day.code, index])
) as Record<WeekdayCode, number>;

export interface RecurrenceInput {
  frequency: Frequency;
  // Weekday codes (e.g. ["tue", "thu"]) for weekly/biweekly; ignored otherwise.
  daysOfWeek: WeekdayCode[] | null;
  // every N weeks/months (weekly/biweekly/monthly); ignored for daily/weekdays.
  interval: number;
}

export interface SeriesOccurrenceInput {
  startDate: Date;
  // null = one-off, a single occurrence on startDate.
  recurrence: RecurrenceInput | null;
  endCondition: EndCondition;
  endDate: Date | null;
  endCount: number | null;
}

export function parseDaysOfWeek(csv: string | null): WeekdayCode[] {
  if (!csv) return [];
  return csv.split(",").map((code) => code.trim()) as WeekdayCode[];
}

/**
 * Computes every occurrence date for a series, from its startDate through
 * horizonEnd (inclusive), applying §3's skip/omit rules:
 *  - daily/weekdays: a blocked candidate shifts forward to the next valid day.
 *  - weekly/biweekly/monthly: a blocked candidate is omitted outright (never
 *    shifted) — a field-trip Tuesday just means no Latin that week.
 * End conditions (never/onDate/afterNCount) are applied to the resulting
 * (post skip/omit) sequence, since those are what actually happen.
 *
 * `daily`'s interval also powers §7's "Every other day" student-project
 * recurrence (interval 2) — weekdays has no such control in either UI, so it
 * always steps by 1 regardless of `interval`.
 */
export function computeOccurrenceDates(
  series: SeriesOccurrenceInput,
  isBlocked: (date: Date) => boolean,
  horizonEnd: Date
): Date[] {
  const startDate = startOfUTCDay(series.startDate);
  const endDate = series.endCondition === EndCondition.onDate && series.endDate
    ? startOfUTCDay(series.endDate)
    : null;
  const limit =
    series.endCondition === EndCondition.afterNCount && series.endCount != null
      ? series.endCount
      : Infinity;

  const results: Date[] = [];

  function withinLimits(date: Date): "stop" | "ok" {
    if (date > horizonEnd) return "stop";
    if (endDate && date > endDate) return "stop";
    if (results.length >= limit) return "stop";
    return "ok";
  }

  if (!series.recurrence) {
    if (withinLimits(startDate) === "ok" && !isBlocked(startDate)) {
      results.push(startDate);
    }
    return results;
  }

  const { frequency, interval } = series.recurrence;
  const safeInterval = Math.max(1, interval || 1);

  if (frequency === Frequency.daily || frequency === Frequency.weekdays) {
    let cursor = startDate;
    while (withinLimits(cursor) === "ok") {
      const isCalendarWeekday = cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6;
      const isCandidateDay = frequency === Frequency.daily || isCalendarWeekday;

      if (isCandidateDay && !isBlocked(cursor)) {
        results.push(cursor);
        cursor = addDays(cursor, frequency === Frequency.daily ? safeInterval : 1);
        continue;
      }
      // Not a candidate day, or blocked: skip forward to the next day and
      // try again (§3's "skips to the next valid day").
      cursor = addDays(cursor, 1);
    }
    return results;
  }

  if (frequency === Frequency.weekly || frequency === Frequency.biweekly) {
    const days = (series.recurrence.daysOfWeek ?? []).slice().sort((a, b) => WEEKDAY_ORDER[a] - WEEKDAY_ORDER[b]);
    if (days.length === 0) return results;

    const weekIntervalDays = safeInterval * 7;
    let weekStart = addDays(startDate, -((startDate.getUTCDay() + 6) % 7)); // Monday of startDate's week

    // Candidate dates only ever increase (days-in-week sorted, weekStart
    // stepping forward), so the first "stop" we hit means every later
    // candidate would stop too — safe to bail out entirely right there.
    outer: while (weekStart <= horizonEnd) {
      for (const code of days) {
        const candidate = addDays(weekStart, WEEKDAY_ORDER[code]);
        if (candidate < startDate) continue; // series hasn't started yet this week
        if (withinLimits(candidate) === "stop") break outer;
        if (!isBlocked(candidate)) results.push(candidate);
      }
      weekStart = addDays(weekStart, weekIntervalDays);
    }
    return results;
  }

  if (frequency === Frequency.monthly) {
    let monthOffset = 0;
    let candidate = startDate;
    while (withinLimits(candidate) === "ok") {
      if (!isBlocked(candidate)) results.push(candidate);
      monthOffset += safeInterval;
      candidate = addMonthsClamped(startDate, monthOffset);
    }
    return results;
  }

  return results;
}

// Adds N months to `start`'s day-of-month, clamping to the last day of the
// target month (so a 31st-of-the-month series degrades gracefully in Feb).
function addMonthsClamped(start: Date, monthsToAdd: number): Date {
  const targetMonthIndex = start.getUTCMonth() + monthsToAdd;
  const targetYear = start.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(start.getUTCDate(), lastDayOfTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonth, day));
}

type MaterializablePrisma = Pick<PrismaClient, "assignmentSeries" | "assignmentInstance" | "schoolDay">;

/**
 * Syncs an AssignmentSeries' future instances against its current
 * definition (§3): creates missing occurrences, updates ones whose fields
 * drifted from the series, and deletes ones that are no longer valid
 * candidates — but never touches a completed or individually-edited
 * (isOverride) instance, and never touches anything before `asOf`.
 */
export async function materializeSeries(
  prisma: MaterializablePrisma,
  seriesId: string,
  asOf: Date = startOfUTCDay(new Date())
): Promise<void> {
  const series = await prisma.assignmentSeries.findUnique({
    where: { id: seriesId },
    include: { recurrence: true },
  });
  if (!series) return;

  const horizonEnd = addDays(asOf, MATERIALIZATION_HORIZON_DAYS);
  const schoolDayMap: SchoolDayMap = await loadSchoolDayMap(prisma, series.startDate, horizonEnd);
  const isBlocked = (date: Date) => isBlockedDay(schoolDayMap, date);

  const occurrenceInput: SeriesOccurrenceInput = {
    startDate: series.startDate,
    recurrence: series.recurrence
      ? {
          frequency: series.recurrence.frequency,
          daysOfWeek: parseDaysOfWeek(series.recurrence.daysOfWeek),
          interval: series.recurrence.interval,
        }
      : null,
    endCondition: series.endCondition,
    endDate: series.endDate,
    endCount: series.endCount,
  };

  const allOccurrences = computeOccurrenceDates(occurrenceInput, isBlocked, horizonEnd);
  const futureOccurrences = allOccurrences.filter((date) => date >= asOf);
  const futureKeys = new Set(futureOccurrences.map(toISODate));

  const existingFutureInstances = await prisma.assignmentInstance.findMany({
    where: { seriesId, dueDate: { gte: asOf } },
  });
  const existingByDate = new Map(existingFutureInstances.map((instance) => [toISODate(instance.dueDate!), instance]));

  const staleIds = existingFutureInstances
    .filter(
      (instance) =>
        !instance.isOverride &&
        instance.status !== InstanceStatus.done &&
        !futureKeys.has(toISODate(instance.dueDate!))
    )
    .map((instance) => instance.id);
  if (staleIds.length > 0) {
    await prisma.assignmentInstance.deleteMany({ where: { id: { in: staleIds } } });
  }

  for (const date of futureOccurrences) {
    const existing = existingByDate.get(toISODate(date));
    if (existing) {
      if (existing.isOverride || existing.status === InstanceStatus.done) continue;
      await prisma.assignmentInstance.update({
        where: { id: existing.id },
        data: {
          title: series.title,
          details: series.details,
          subjectId: series.subjectId,
          requiresReview: series.requiresReview,
        },
      });
    } else {
      await prisma.assignmentInstance.create({
        data: {
          seriesId: series.id,
          title: series.title,
          details: series.details,
          studentId: series.studentId,
          subjectId: series.subjectId,
          projectId: series.projectId,
          createdBy: series.createdBy,
          dueDate: date,
          originalDueDate: date,
          requiresReview: series.requiresReview,
        },
      });
    }
  }
}
