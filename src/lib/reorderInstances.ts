import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import { compareDayRows } from "./dayOrder";
import { toISODate } from "./dates";

type ReorderablePrisma = Pick<PrismaClient, "assignmentInstance" | "$transaction">;
type SeparatorAwarePrisma = ReorderablePrisma & Pick<PrismaClient, "daySeparator" | "assignmentSeries">;

/**
 * §14: reordering one occurrence of a repeating series re-applies the same
 * row index to every other future, still-attached occurrence of that
 * series — skipping anything already completed or individually detached
 * ("this assignment only," isOverride), the same carve-outs
 * materializeSeries itself respects — and remembers the index on the series
 * itself so an instance materialized later inherits it too, instead of
 * always landing at the bottom of its day (materialize.ts).
 */
async function propagateSeriesOrder(
  prisma: SeparatorAwarePrisma,
  seriesId: string,
  targetIndex: number,
  fromDate: Date
): Promise<void> {
  await prisma.assignmentSeries.update({ where: { id: seriesId }, data: { sortOrder: targetIndex } });

  const futureInstances = await prisma.assignmentInstance.findMany({
    where: {
      seriesId,
      isOverride: false,
      status: { not: InstanceStatus.done },
      dueDate: { gt: fromDate },
    },
  });
  if (futureInstances.length === 0) return;

  const updates: Prisma.PrismaPromise<unknown>[] = [];
  for (const target of futureInstances) {
    if (!target.dueDate) continue;
    const [otherInstances, separators] = await Promise.all([
      prisma.assignmentInstance.findMany({
        where: { studentId: target.studentId, dueDate: target.dueDate, id: { not: target.id } },
      }),
      prisma.daySeparator.findMany({ where: { studentId: target.studentId, date: target.dueDate } }),
    ]);
    const otherRows = [
      ...otherInstances.map((i) => ({ id: i.id, kind: "instance" as const, sortOrder: i.sortOrder, createdAt: i.createdAt })),
      ...separators.map((s) => ({ id: s.id, kind: "separator" as const, sortOrder: s.sortOrder, createdAt: null })),
    ].sort(compareDayRows);

    const insertAt = Math.min(targetIndex, otherRows.length);
    otherRows.splice(insertAt, 0, { id: target.id, kind: "instance", sortOrder: insertAt, createdAt: target.createdAt });

    otherRows.forEach((row, index) => {
      updates.push(
        row.kind === "instance"
          ? prisma.assignmentInstance.update({ where: { id: row.id }, data: { sortOrder: index } })
          : prisma.daySeparator.update({ where: { id: row.id }, data: { sortOrder: index } })
      );
    });
  }

  if (updates.length > 0) await prisma.$transaction(updates);
}

/**
 * Parent Mode's own drag-reorder within a single day's cell — the only way
 * order ever changes now (§14: students can look but not touch). It isn't
 * limited to "open" or "today" (a parent may want to order any day's card,
 * any status, for her own planning view), and it's not segment-constrained
 * either: a parent can freely move a separator itself, or move an instance
 * across one. `orderedIds` is a mix of AssignmentInstance and DaySeparator
 * ids, trusted only for rows that actually belong to this student and this
 * exact date.
 *
 * Any reordered row that belongs to a series (and hasn't been individually
 * detached from it) also propagates its new index forward to that series'
 * other future occurrences — see propagateSeriesOrder above.
 */
export async function reorderDayRows(
  prisma: SeparatorAwarePrisma,
  studentId: string,
  dateISO: string,
  orderedIds: string[]
): Promise<void> {
  if (orderedIds.length === 0) return;

  const [instances, separators] = await Promise.all([
    prisma.assignmentInstance.findMany({ where: { id: { in: orderedIds } } }),
    prisma.daySeparator.findMany({ where: { id: { in: orderedIds } } }),
  ]);

  const validInstances = instances.filter(
    (instance) => instance.studentId === studentId && instance.dueDate && toISODate(instance.dueDate) === dateISO
  );
  const validInstanceIds = new Set(validInstances.map((instance) => instance.id));
  const validSeparatorIds = new Set(
    separators
      .filter((separator) => separator.studentId === studentId && toISODate(separator.date) === dateISO)
      .map((separator) => separator.id)
  );

  const idsToReorder = orderedIds.filter((id) => validInstanceIds.has(id) || validSeparatorIds.has(id));
  if (idsToReorder.length === 0) return;

  await prisma.$transaction(
    idsToReorder.map((id, index) =>
      validInstanceIds.has(id)
        ? prisma.assignmentInstance.update({ where: { id }, data: { sortOrder: index } })
        : prisma.daySeparator.update({ where: { id }, data: { sortOrder: index } })
    )
  );

  const seriesInstances = validInstances.filter((instance) => instance.seriesId && !instance.isOverride);
  for (const instance of seriesInstances) {
    const newIndex = idsToReorder.indexOf(instance.id);
    await propagateSeriesOrder(prisma, instance.seriesId!, newIndex, instance.dueDate!);
  }
}
