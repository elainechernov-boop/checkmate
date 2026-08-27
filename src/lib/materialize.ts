import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { EndCondition, Frequency, InstanceStatus } from "@/generated/prisma/enums";
import { addDays, getToday, startOfUTCDay, toISODate, WEEKDAYS, type WeekdayCode } from "./dates";
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
      const isSunday = cursor.getUTCDay() === 0;
      // The week view only ever renders Mon-Sat (§6) — a Sunday occurrence
      // would be a real instance with nowhere to display or check it off,
      // so Sunday is never a candidate day for either frequency. `weekdays`
      // additionally excludes Saturday; `daily` (used by §7's "Every day" /
      // "Every other day" project plans) still includes it.
      const isCalendarWeekday = !isSunday && cursor.getUTCDay() !== 6;
      const isCandidateDay = frequency === Frequency.daily ? !isSunday : isCalendarWeekday;

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

type MaterializablePrisma = Pick<
  PrismaClient,
  "assignmentSeries" | "assignmentInstance" | "schoolDay" | "removedOccurrence" | "daySeparator"
>;

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
  asOf: Date = getToday()
): Promise<void> {
  const series = await prisma.assignmentSeries.findUnique({
    where: { id: seriesId },
    include: { recurrence: true },
  });
  if (!series) return;

  const horizonEnd = addDays(asOf, MATERIALIZATION_HORIZON_DAYS);
  const schoolDayMap: SchoolDayMap = await loadSchoolDayMap(prisma, series.studentId, series.startDate, horizonEnd);
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

  // Dates explicitly deleted via "this assignment only" (assignmentEdits.ts's
  // deleteInstanceOnly) — permanently excluded, the same way a capped
  // series endDate already stops "this and following" deletes from
  // regenerating, so a parent's single-occurrence delete actually sticks.
  const removed = await prisma.removedOccurrence.findMany({
    where: { seriesId, date: { gte: asOf, lte: horizonEnd } },
    select: { date: true },
  });
  const removedKeys = new Set(removed.map((r) => toISODate(r.date)));

  const allOccurrences = computeOccurrenceDates(occurrenceInput, isBlocked, horizonEnd);
  const futureOccurrences = allOccurrences
    .filter((date) => date >= asOf)
    .filter((date) => !removedKeys.has(toISODate(date)));
  const futureKeys = new Set(futureOccurrences.map(toISODate));

  // Matched by originalDueDate, not the current dueDate — §5's roll-forward
  // advances dueDate (and bumps rolledCount) but deliberately leaves
  // originalDueDate alone precisely so it keeps identifying which series
  // occurrence an instance belongs to. Keying off dueDate here would treat
  // every already-rolled instance as sitting on a date its series never
  // generated: "stale," to be deleted and silently recreated fresh at its
  // original date, erasing the roll (this was a real bug — materializeSeries
  // was never re-run after creation until extendAllMaterializationHorizons
  // started doing so on every page load).
  const existingFutureInstances = await prisma.assignmentInstance.findMany({
    where: { seriesId, originalDueDate: { gte: asOf } },
  });
  const existingByDate = new Map(
    existingFutureInstances.map((instance) => [toISODate(instance.originalDueDate!), instance])
  );

  // A freshly-materialized occurrence lands at the bottom of its day's
  // existing rows (matching quickCreateInstance's own fix), not at
  // sortOrder 0 — scanned once across the whole horizon, for every one of
  // this student's instances/separators (not just this series'), and kept
  // up to date in-memory as new rows below get their sortOrder assigned.
  const [horizonInstances, horizonSeparators] = await Promise.all([
    prisma.assignmentInstance.findMany({
      where: { studentId: series.studentId, dueDate: { gte: asOf, lte: horizonEnd } },
      select: { dueDate: true, sortOrder: true },
    }),
    prisma.daySeparator.findMany({
      where: { studentId: series.studentId, date: { gte: asOf, lte: horizonEnd } },
      select: { date: true, sortOrder: true },
    }),
  ]);
  const maxSortOrderByDate = new Map<string, number>();
  for (const instance of horizonInstances) {
    if (!instance.dueDate) continue;
    const key = toISODate(instance.dueDate);
    maxSortOrderByDate.set(key, Math.max(maxSortOrderByDate.get(key) ?? -1, instance.sortOrder));
  }
  for (const separator of horizonSeparators) {
    const key = toISODate(separator.date);
    maxSortOrderByDate.set(key, Math.max(maxSortOrderByDate.get(key) ?? -1, separator.sortOrder));
  }

  const staleIds = existingFutureInstances
    .filter(
      (instance) =>
        !instance.isOverride &&
        instance.status !== InstanceStatus.done &&
        !futureKeys.has(toISODate(instance.originalDueDate!))
    )
    .map((instance) => instance.id);

  // Every create/update/delete below is collected here and fired
  // concurrently at the end (Promise.all), rather than awaited one at a
  // time in the loop — this used to be up to MATERIALIZATION_HORIZON_DAYS
  // (60) sequential round trips per series, harmless on local SQLite but
  // real, compounding network latency against a hosted Postgres, on
  // *every* page load (extendAllMaterializationHorizons runs this for
  // every series on every visit to /parent and /student/[id]). Not
  // `$transaction([...])`: materializeSeries is sometimes called with an
  // already-open interactive transaction client (assignmentEdits.ts's
  // `tx`), and nesting a batch transaction inside one deadlocks. None of
  // these operations touch the same row as another (stale deletes, updates,
  // and creates all target disjoint ids by construction), so they don't
  // need atomicity with each other — only with whatever transaction the
  // caller already has them wrapped in, which running them through the
  // same `prisma`/`tx` client already preserves. An existing, unchanged
  // instance is also now skipped entirely — the old code re-wrote it
  // unconditionally on every call even when nothing about it had actually
  // drifted from the series, which was pure wasted writes on the steady-state
  // (nothing to materialize) case that's true on most page loads.
  const operations: Prisma.PrismaPromise<unknown>[] = [];

  if (staleIds.length > 0) {
    operations.push(prisma.assignmentInstance.deleteMany({ where: { id: { in: staleIds } } }));
  }

  for (const date of futureOccurrences) {
    const existing = existingByDate.get(toISODate(date));
    if (existing) {
      if (existing.isOverride || existing.status === InstanceStatus.done) continue;
      const driftedFromSeries =
        existing.title !== series.title ||
        existing.details !== series.details ||
        existing.subjectId !== series.subjectId ||
        existing.requiresReview !== series.requiresReview ||
        existing.isTimeSensitive !== series.isTimeSensitive ||
        existing.scheduledTime !== series.scheduledTime ||
        existing.reminderMinutesBefore !== series.reminderMinutesBefore ||
        existing.estimatedMinutes !== series.estimatedMinutes;
      if (!driftedFromSeries) continue;
      operations.push(
        prisma.assignmentInstance.update({
          where: { id: existing.id },
          data: {
            title: series.title,
            details: series.details,
            subjectId: series.subjectId,
            requiresReview: series.requiresReview,
            isTimeSensitive: series.isTimeSensitive,
            scheduledTime: series.scheduledTime,
            reminderMinutesBefore: series.reminderMinutesBefore,
            estimatedMinutes: series.estimatedMinutes,
          },
        })
      );
    } else {
      const dateKey = toISODate(date);
      const nextSortOrder = (maxSortOrderByDate.get(dateKey) ?? -1) + 1;
      maxSortOrderByDate.set(dateKey, nextSortOrder);
      operations.push(
        prisma.assignmentInstance.create({
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
            isTimeSensitive: series.isTimeSensitive,
            scheduledTime: series.scheduledTime,
            reminderMinutesBefore: series.reminderMinutesBefore,
            estimatedMinutes: series.estimatedMinutes,
            sortOrder: nextSortOrder,
          },
        })
      );
    }
  }

  if (operations.length > 0) {
    await Promise.all(operations);
  }
}

/**
 * Keeps every series' rolling 60-day window actually rolling. materializeSeries
 * on its own only re-runs when a series is created or edited — a
 * long-running series (a school-year-long Latin class, say) would silently
 * stop producing new instances once real time outran the last horizon it
 * was materialized against, with no edit ever happening to refresh it. This
 * is called on every page load (same pattern as rollOverdueInstances, and
 * just as harmless to re-run when there's nothing new to do) so the horizon
 * keeps advancing purely from the family opening the app day to day.
 */
export async function extendAllMaterializationHorizons(
  prisma: MaterializablePrisma,
  asOf: Date = getToday()
): Promise<void> {
  const seriesList = await prisma.assignmentSeries.findMany({ select: { id: true } });
  for (const series of seriesList) {
    await materializeSeries(prisma, series.id, asOf);
  }
}
