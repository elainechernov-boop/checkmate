import type { PrismaClient } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import { compareDayRows } from "./dayOrder";
import { addDays, getToday, startOfUTCDay } from "./dates";
import { isBlockedDay, loadSchoolDayMap } from "./schoolCalendar";

type RollablePrisma = Pick<PrismaClient, "assignmentInstance" | "daySeparator" | "schoolDay" | "$transaction">;

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
 *
 * Rolled items land at the top of their new day, oldest first ("debts
 * before new work"), with that day's existing rows shifted down beneath
 * them. That's only a starting position: it's written as ordinary
 * sortOrder, so a parent dragging one somewhere else (§14) sticks.
 */
export async function rollOverdueInstances(
  prisma: RollablePrisma,
  studentId: string,
  asOf: Date = getToday()
): Promise<{ rolledCount: number }> {
  const target = await nextSchoolDayOnOrAfter(prisma, studentId, startOfUTCDay(asOf));

  const overdue = await prisma.assignmentInstance.findMany({
    where: { studentId, status: InstanceStatus.open, dueDate: { lt: target } },
  });
  if (overdue.length === 0) return { rolledCount: 0 };

  const [existingInstances, separators] = await Promise.all([
    prisma.assignmentInstance.findMany({
      where: { studentId, dueDate: target },
      select: { id: true, sortOrder: true, createdAt: true },
    }),
    prisma.daySeparator.findMany({ where: { studentId, date: target }, select: { id: true, sortOrder: true } }),
  ]);
  const existingRows = [
    ...existingInstances.map((i) => ({ ...i, kind: "instance" as const })),
    ...separators.map((s) => ({ ...s, kind: "separator" as const })),
  ].sort(compareDayRows);
  // Oldest debt first; among tasks from the same day, the order they were
  // already in (same tie-break as everywhere — dayOrder.ts).
  const rolledInOrder = [...overdue].sort(
    (a, b) =>
      (a.originalDueDate?.getTime() ?? 0) - (b.originalDueDate?.getTime() ?? 0) ||
      compareDayRows({ ...a, kind: "instance" }, { ...b, kind: "instance" })
  );

  await prisma.$transaction([
    ...rolledInOrder.map((instance, index) =>
      prisma.assignmentInstance.update({
        where: { id: instance.id },
        data: { dueDate: target, rolledCount: instance.rolledCount + 1, sortOrder: index },
      })
    ),
    ...existingRows.map((row, index) =>
      row.kind === "instance"
        ? prisma.assignmentInstance.update({ where: { id: row.id }, data: { sortOrder: rolledInOrder.length + index } })
        : prisma.daySeparator.update({ where: { id: row.id }, data: { sortOrder: rolledInOrder.length + index } })
    ),
  ]);

  return { rolledCount: overdue.length };
}

export async function rollOverdueInstancesForAllStudents(
  prisma: RollablePrisma & { student: PrismaClient["student"] },
  asOf: Date = getToday()
): Promise<void> {
  const students = await prisma.student.findMany({ select: { id: true } });
  for (const student of students) {
    await rollOverdueInstances(prisma, student.id, asOf);
  }
}
