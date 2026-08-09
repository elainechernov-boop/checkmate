import type { PrismaClient } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import { startOfUTCDay, toISODate } from "./dates";

type ReorderablePrisma = Pick<PrismaClient, "assignmentInstance" | "$transaction">;

/**
 * Same-day drag-reorder within a student's own "open" bucket, today only —
 * matching the existing today-only interactivity rule (§6). `orderedIds` is
 * the caller's desired new order; anything that isn't that student's own,
 * due-today, open item is silently dropped rather than trusted.
 */
export async function reorderOpenItems(
  prisma: ReorderablePrisma,
  studentId: string,
  orderedIds: string[],
  asOf: Date = startOfUTCDay(new Date())
): Promise<void> {
  if (orderedIds.length === 0) return;

  const today = toISODate(asOf);
  const instances = await prisma.assignmentInstance.findMany({
    where: { id: { in: orderedIds } },
  });

  const validIds = new Set(
    instances
      .filter(
        (instance) =>
          instance.studentId === studentId &&
          instance.status === InstanceStatus.open &&
          instance.dueDate &&
          toISODate(instance.dueDate) === today
      )
      .map((instance) => instance.id)
  );

  const idsToReorder = orderedIds.filter((id) => validIds.has(id));
  if (idsToReorder.length === 0) return;

  await prisma.$transaction(
    idsToReorder.map((id, index) =>
      prisma.assignmentInstance.update({ where: { id }, data: { sortOrder: index } })
    )
  );
}
