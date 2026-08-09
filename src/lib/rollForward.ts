import type { PrismaClient } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import { startOfUTCDay } from "./dates";
import { isBlockedDay, loadSchoolDayMap } from "./schoolCalendar";

type RollablePrisma = Pick<PrismaClient, "assignmentInstance" | "schoolDay" | "$transaction">;

/**
 * §5's "unfinished work rolls forward automatically." Every still-`open`
 * instance due before `asOf` moves onto `asOf` and its rolledCount ticks up
 * by one — but only when `asOf` is itself a valid school day; a blocked
 * `asOf` (weekend, field trip, etc.) means nothing rolls onto it at all, so
 * overdue items simply keep waiting at their current dueDate ("skips
 * non-school days"). `pendingReview` items are excluded by construction
 * (only `open` is touched) — they hold their day until approved or returned.
 */
export async function rollOverdueInstances(
  prisma: RollablePrisma,
  studentId: string,
  asOf: Date = startOfUTCDay(new Date())
): Promise<{ rolledCount: number }> {
  const today = startOfUTCDay(asOf);
  const schoolDayMap = await loadSchoolDayMap(prisma, today, today);
  if (isBlockedDay(schoolDayMap, today)) return { rolledCount: 0 };

  const overdue = await prisma.assignmentInstance.findMany({
    where: { studentId, status: InstanceStatus.open, dueDate: { lt: today } },
  });
  if (overdue.length === 0) return { rolledCount: 0 };

  await prisma.$transaction(
    overdue.map((instance) =>
      prisma.assignmentInstance.update({
        where: { id: instance.id },
        data: { dueDate: today, rolledCount: instance.rolledCount + 1 },
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
