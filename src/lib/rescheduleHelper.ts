import type { PrismaClient } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import { rescheduleInstance } from "./assignmentEdits";
import { addDays, mondayOf, toISODate } from "./dates";
import { isBlockedDay, loadSchoolDayMap } from "./schoolCalendar";

export type RescheduleStrategy =
  | { mode: "nextSchoolDay" }
  | { mode: "chosenDate"; date: Date }
  | { mode: "distribute" };

type ReschedulablePrisma = Pick<PrismaClient, "assignmentInstance" | "schoolDay">;

/**
 * §5 "triggers the Reschedule Helper for anything already scheduled that
 * day." Series-generated occurrences are already handled by re-running
 * materializeSeries when the day's type changes (a daily/weekdays series
 * simply lands on the next valid day per §3; a weekly-on-specific-day
 * series is omitted outright) — what's left over here is exactly the
 * standalone and individually-overridden instances nothing else will move.
 */
export async function findReschedulableInstances(prisma: ReschedulablePrisma, studentId: string, date: Date) {
  return prisma.assignmentInstance.findMany({
    where: { studentId, dueDate: date, status: InstanceStatus.open },
    include: { student: { select: { id: true, name: true } } },
  });
}

async function nextSchoolDayAfter(
  prisma: ReschedulablePrisma,
  studentId: string,
  date: Date,
  maxLookaheadDays = 60
): Promise<Date> {
  const horizonEnd = addDays(date, maxLookaheadDays);
  const map = await loadSchoolDayMap(prisma, studentId, addDays(date, 1), horizonEnd);
  let cursor = addDays(date, 1);
  while (isBlockedDay(map, cursor)) {
    if (cursor >= horizonEnd) {
      throw new Error("No school day found in the lookahead window.");
    }
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

export async function applyRescheduleHelper(
  prisma: ReschedulablePrisma,
  studentId: string,
  date: Date,
  strategy: RescheduleStrategy
): Promise<void> {
  const instances = await findReschedulableInstances(prisma, studentId, date);
  if (instances.length === 0) return;

  if (strategy.mode === "chosenDate") {
    for (const instance of instances) {
      await rescheduleInstance(prisma, instance.id, strategy.date);
    }
    return;
  }

  if (strategy.mode === "nextSchoolDay") {
    const target = await nextSchoolDayAfter(prisma, studentId, date);
    for (const instance of instances) {
      await rescheduleInstance(prisma, instance.id, target);
    }
    return;
  }

  // "distribute across the week": round-robin across that week's other
  // unblocked days; if the whole week is out (e.g. a multi-day closure),
  // fall back to piling everyone onto the next school day instead.
  const monday = mondayOf(date);
  const weekDays = Array.from({ length: 6 }, (_, i) => addDays(monday, i));
  const map = await loadSchoolDayMap(prisma, studentId, monday, addDays(monday, 5));
  const dateISO = toISODate(date);
  const candidates = weekDays.filter((day) => toISODate(day) !== dateISO && !isBlockedDay(map, day));
  const targets = candidates.length > 0 ? candidates : [await nextSchoolDayAfter(prisma, studentId, date)];

  for (let index = 0; index < instances.length; index++) {
    const target = targets[index % targets.length];
    await rescheduleInstance(prisma, instances[index].id, target);
  }
}
