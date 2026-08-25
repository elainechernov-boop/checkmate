import type { PrismaClient } from "@/generated/prisma/client";
import { startOfUTCDay } from "./dates";

type DaySeparatorPrisma = Pick<PrismaClient, "daySeparator" | "assignmentInstance">;

/** Parent-only (§6) — free text ("Morning," "Before breakfast," anything she
 * types — see ParentWeekBoard's SeparatorCreateRow). Appended after
 * everything already on that day; the parent repositions it afterward the
 * same way she reorders any other row (see reorderInstances.ts's
 * reorderDayRows), or the caller can hand it straight to reorderDayRows
 * itself to land it at a precise spot in one round trip (addDaySeparatorAction). */
export async function addDaySeparator(
  prisma: DaySeparatorPrisma,
  studentId: string,
  date: Date,
  label: string
) {
  const day = startOfUTCDay(date);
  const [maxInstance, maxSeparator] = await Promise.all([
    prisma.assignmentInstance.aggregate({
      where: { studentId, dueDate: day },
      _max: { sortOrder: true },
    }),
    prisma.daySeparator.aggregate({
      where: { studentId, date: day },
      _max: { sortOrder: true },
    }),
  ]);
  const nextSortOrder = Math.max(maxInstance._max.sortOrder ?? -1, maxSeparator._max.sortOrder ?? -1) + 1;

  return prisma.daySeparator.create({
    data: { studentId, date: day, label, sortOrder: nextSortOrder },
  });
}

export async function deleteDaySeparator(prisma: Pick<PrismaClient, "daySeparator">, separatorId: string): Promise<void> {
  await prisma.daySeparator.delete({ where: { id: separatorId } });
}

/**
 * Splits a day's open instances into the segments its separators bound —
 * pure and side-effect-free so both the server (reorderInstances.ts,
 * enforcing the boundary) and the client (DayColumn.tsx, rendering it and
 * blocking a cross-segment drag before it ever reaches the server) compute
 * the exact same grouping from the exact same sortOrder values.
 */
export function splitBySeparators<TInstance extends { id: string; sortOrder: number }, TSeparator extends { id: string; sortOrder: number }>(
  instances: TInstance[],
  separators: TSeparator[]
): { segments: TInstance[][]; separatorsInOrder: TSeparator[] } {
  const rows: ({ kind: "instance"; row: TInstance } | { kind: "separator"; row: TSeparator })[] = [
    ...instances.map((row) => ({ kind: "instance" as const, row })),
    ...separators.map((row) => ({ kind: "separator" as const, row })),
  ].sort((a, b) => a.row.sortOrder - b.row.sortOrder);

  const segments: TInstance[][] = [[]];
  const separatorsInOrder: TSeparator[] = [];
  for (const entry of rows) {
    if (entry.kind === "separator") {
      separatorsInOrder.push(entry.row);
      segments.push([]);
    } else {
      segments[segments.length - 1].push(entry.row);
    }
  }
  return { segments, separatorsInOrder };
}
