import type { PrismaClient } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import { splitBySeparators } from "./daySeparators";
import { getToday, startOfUTCDay, toISODate } from "./dates";

type ReorderablePrisma = Pick<PrismaClient, "assignmentInstance" | "$transaction">;
type SeparatorAwarePrisma = ReorderablePrisma & Pick<PrismaClient, "daySeparator">;

/**
 * Same-day drag-reorder within a student's own "open" bucket, today only —
 * matching the existing today-only interactivity rule (§6). `orderedIds` is
 * the caller's desired new order; anything that isn't that student's own,
 * due-today, open item is silently dropped rather than trusted.
 *
 * Parent-placed separators (§6 "Morning/Afternoon/Evening") partition the
 * day into segments a student can reorder freely *within* but never
 * across: each segment keeps the exact set of numeric sortOrder slots its
 * instances already occupy, and `orderedIds` only decides how those slots
 * get handed back out inside each segment — an instance can never end up
 * with a slot from a different segment, so it can never cross a
 * separator no matter what order gets submitted.
 */
export async function reorderOpenItems(
  prisma: SeparatorAwarePrisma,
  studentId: string,
  orderedIds: string[],
  asOf: Date = getToday()
): Promise<void> {
  const today = startOfUTCDay(asOf);

  const [instances, separators] = await Promise.all([
    prisma.assignmentInstance.findMany({
      where: { studentId, status: InstanceStatus.open, dueDate: today },
    }),
    prisma.daySeparator.findMany({ where: { studentId, date: today } }),
  ]);
  if (instances.length === 0) return;

  const { segments, separatorsInOrder } = splitBySeparators(instances, separators);

  const requestedIndex = new Map(orderedIds.map((id, index) => [id, index]));
  const reorderedSegments = segments.map((segment) => {
    const withPosition = segment.map((instance) => ({
      instance,
      // An id the caller omitted (shouldn't normally happen — the client
      // always submits the full open list) keeps its existing relative
      // spot instead of jumping to the front.
      position: requestedIndex.get(instance.id) ?? Infinity,
    }));
    withPosition.sort((a, b) => a.position - b.position || a.instance.sortOrder - b.instance.sortOrder);
    return withPosition.map((entry) => entry.instance);
  });

  const updates: { id: string; kind: "instance" | "separator" }[] = [];
  reorderedSegments.forEach((segment, index) => {
    for (const instance of segment) updates.push({ id: instance.id, kind: "instance" });
    if (separatorsInOrder[index]) updates.push({ id: separatorsInOrder[index].id, kind: "separator" });
  });

  await prisma.$transaction(
    updates.map(({ id, kind }, index) =>
      kind === "instance"
        ? prisma.assignmentInstance.update({ where: { id }, data: { sortOrder: index } })
        : prisma.daySeparator.update({ where: { id }, data: { sortOrder: index } })
    )
  );
}

/**
 * Parent Mode's own drag-reorder within a single day's cell — unlike
 * reorderOpenItems above, this isn't limited to "open" or "today" (a
 * parent may want to order any day's card, any status, for her own
 * planning view), and it's not segment-constrained either: a parent can
 * freely move a separator itself, or move an instance across one — only a
 * student is bounded by them. `orderedIds` is a mix of AssignmentInstance
 * and DaySeparator ids, trusted only for rows that actually belong to this
 * student and this exact date.
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

  const validInstanceIds = new Set(
    instances
      .filter((instance) => instance.studentId === studentId && instance.dueDate && toISODate(instance.dueDate) === dateISO)
      .map((instance) => instance.id)
  );
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
}
