import type { PrismaClient } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import { addDays, startOfUTCDay } from "./dates";
import { isBlockedDay, loadSchoolDayMap } from "./schoolCalendar";

type RollablePrisma = Pick<PrismaClient, "assignmentInstance" | "schoolDay" | "$transaction">;

const ROLL_LOOKAHEAD_DAYS = 14;

// A blocked `asOf` (weekend, holiday, field trip) used to make the whole
// roll a no-op — overdue items just sat waiting at their old dueDate until
// someone happened to load the app again on a valid school day. That left
// them stranded on whatever day they *did* land on if it fell outside the
// visible week (a Sunday reopen after a break rolls onto Sunday, which has
// no column at all — see §6). Instead, walk forward from `asOf` to the next
// actual school day and land everything there directly, so "I opened the
// app on a day off" behaves exactly like "I opened it on the next school
// day" — always somewhere the student can actually see it.
async function nextSchoolDayOnOrAfter(prisma: RollablePrisma, studentId: string, date: Date): Promise<Date> {
  const horizonEnd = addDays(date, ROLL_LOOKAHEAD_DAYS);
  const schoolDayMap = await loadSchoolDayMap(prisma, studentId, date, horizonEnd);
  let cursor = date;
  while (isBlockedDay(schoolDayMap, cursor)) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

/**
 * §5's "unfinished work rolls forward automatically." Every still-`open`
 * instance due before the next valid school day on or after `asOf` moves
 * onto that day and its rolledCount ticks up by one — landing on the next
 * *school* day rather than literally "today" is what makes a Sunday (or a
 * marked-off day) reopen show Monday's catch-up instead of stranding items
 * on a day with no column. `pendingReview` items are excluded by
 * construction (only `open` is touched) — they hold their day until
 * approved or returned.
 */
export async function rollOverdueInstances(
  prisma: RollablePrisma,
  studentId: string,
  asOf: Date = startOfUTCDay(new Date())
): Promise<{ rolledCount: number }> {
  const target = await nextSchoolDayOnOrAfter(prisma, studentId, startOfUTCDay(asOf));

  const overdue = await prisma.assignmentInstance.findMany({
    where: { studentId, status: InstanceStatus.open, dueDate: { lt: target } },
  });
  if (overdue.length === 0) return { rolledCount: 0 };

  await prisma.$transaction(
    overdue.map((instance) =>
      prisma.assignmentInstance.update({
        where: { id: instance.id },
        data: { dueDate: target, rolledCount: instance.rolledCount + 1 },
      })
    )
  );

  return { rolledCount: overdue.length };
}

export async function rollOverdueInstancesForAllStudents(
  prisma: RollablePrisma & { student: PrismaClient["student"] },
  asOf: Date = startOfUTCDay(new Date())
): Promise<void> {
  const students = await prisma.student.findMany({ select: { id: true } });
  for (const student of students) {
    await rollOverdueInstances(prisma, student.id, asOf);
  }
}
