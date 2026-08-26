import type { PrismaClient } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import { addDays, toISODate } from "./dates";
import { isBlockedDay, loadSchoolDayMap } from "./schoolCalendar";

type StreakPrisma = Pick<PrismaClient, "assignmentInstance" | "schoolDay">;

const LOOKBACK_DAYS = 60;

/** The design doc's "N-day streak" header stat — consecutive school days,
 * walking backward from yesterday (today isn't finished yet), where every
 * instance due that day was resolved (done/excused). A non-school day
 * (already skipped by the roll-forward/materialization logic elsewhere)
 * neither breaks nor extends the streak; a school day with nothing due
 * also doesn't break it — only a school day with unresolved work does.
 * Bounded to a 60-day lookback so a very long-running streak can't turn
 * this into an unbounded scan. */
export async function computeStreak(prisma: StreakPrisma, studentId: string, today: Date): Promise<number> {
  const rangeStart = addDays(today, -LOOKBACK_DAYS);
  const [schoolDayMap, instances] = await Promise.all([
    loadSchoolDayMap(prisma, studentId, rangeStart, today),
    prisma.assignmentInstance.findMany({
      where: { studentId, dueDate: { gte: rangeStart, lt: today } },
      select: { dueDate: true, status: true },
    }),
  ]);

  const instancesByDay = new Map<string, InstanceStatus[]>();
  for (const instance of instances) {
    if (!instance.dueDate) continue;
    const key = toISODate(instance.dueDate);
    if (!instancesByDay.has(key)) instancesByDay.set(key, []);
    instancesByDay.get(key)!.push(instance.status);
  }

  let streak = 0;
  for (let cursor = addDays(today, -1); cursor >= rangeStart; cursor = addDays(cursor, -1)) {
    if (isBlockedDay(schoolDayMap, cursor)) continue;
    const statuses = instancesByDay.get(toISODate(cursor));
    if (!statuses || statuses.length === 0) continue;
    const allResolved = statuses.every((status) => status === InstanceStatus.done || status === InstanceStatus.excused);
    if (!allResolved) break;
    streak += 1;
  }

  return streak;
}
