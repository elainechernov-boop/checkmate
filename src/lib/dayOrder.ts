import type { PrismaClient } from "@/generated/prisma/client";
import { addDays, toISODate } from "./dates";

// §14: a day's order is the parent's call, and the parent board and the
// student's view must show the *same* one. Both read the same `sortOrder`
// numbers, so they only disagree when two rows share a number (a tie) and each
// side breaks it differently. Ties are real: a task moved between days used to
// keep its old number, project tasks default to 0, and so on. This module is
// the one tie-break every ordered list of a day uses, plus a repair that
// removes existing ties so the numbers themselves are unambiguous.

export interface OrderableRow {
  id: string;
  sortOrder: number;
  /** Instances have one; a day divider doesn't. */
  createdAt?: Date | null;
  kind?: "instance" | "separator";
}

/**
 * Position first. On a tie: an assignment before a divider, then the one
 * created first, then by id so the result never depends on the order a query
 * happened to return rows in (Postgres returns them in whatever physical
 * order it likes without an ORDER BY).
 */
export function compareDayRows(a: OrderableRow, b: OrderableRow): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const kindA = a.kind === "separator" ? 1 : 0;
  const kindB = b.kind === "separator" ? 1 : 0;
  if (kindA !== kindB) return kindA - kindB;
  const createdA = a.createdAt?.getTime() ?? 0;
  const createdB = b.createdAt?.getTime() ?? 0;
  if (createdA !== createdB) return createdA - createdB;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function orderDayRows<T extends OrderableRow>(rows: T[]): T[] {
  return [...rows].sort(compareDayRows);
}

export interface RepairableRow extends OrderableRow {
  kind: "instance" | "separator";
  /** One student's one day — a day's rows share one numbering space. */
  dayKey: string;
}

/**
 * The renumbering that removes ties, and nothing else. Only a day that has two
 * rows sharing a number is touched: its rows are put in compareDayRows order
 * (exactly what the board already shows for it) and numbered 0..n-1. A day
 * that's already unambiguous — even with gaps in its numbers — is left alone,
 * so this doesn't churn data that isn't broken.
 */
export function planTieRepairs(rows: RepairableRow[]): Array<{ id: string; kind: "instance" | "separator"; sortOrder: number }> {
  const byDay = new Map<string, RepairableRow[]>();
  for (const row of rows) byDay.set(row.dayKey, [...(byDay.get(row.dayKey) ?? []), row]);

  const updates: Array<{ id: string; kind: "instance" | "separator"; sortOrder: number }> = [];
  for (const dayRows of byDay.values()) {
    const numbers = new Set(dayRows.map((row) => row.sortOrder));
    if (numbers.size === dayRows.length) continue; // no ties
    orderDayRows(dayRows).forEach((row, index) => {
      if (row.sortOrder !== index) updates.push({ id: row.id, kind: row.kind, sortOrder: index });
    });
  }
  return updates;
}

type RepairPrisma = Pick<PrismaClient, "assignmentInstance" | "daySeparator">;

/** Removes tied positions from every day in [from, to]. Returns how many rows
 * were renumbered (0 when nothing was tied — the steady state). */
export async function healTiedDayOrder(prisma: RepairPrisma, from: Date, to: Date): Promise<number> {
  const [instances, separators] = await Promise.all([
    prisma.assignmentInstance.findMany({
      where: { dueDate: { gte: from, lte: to } },
      select: { id: true, studentId: true, dueDate: true, sortOrder: true, createdAt: true },
    }),
    prisma.daySeparator.findMany({
      where: { date: { gte: from, lte: to } },
      select: { id: true, studentId: true, date: true, sortOrder: true },
    }),
  ]);

  const rows: RepairableRow[] = [
    ...instances
      .filter((instance) => instance.dueDate)
      .map((instance) => ({
        id: instance.id,
        kind: "instance" as const,
        sortOrder: instance.sortOrder,
        createdAt: instance.createdAt,
        dayKey: `${instance.studentId}:${toISODate(instance.dueDate!)}`,
      })),
    ...separators.map((separator) => ({
      id: separator.id,
      kind: "separator" as const,
      sortOrder: separator.sortOrder,
      dayKey: `${separator.studentId}:${toISODate(separator.date)}`,
    })),
  ];

  const updates = planTieRepairs(rows);
  await Promise.all(
    updates.map((update) =>
      update.kind === "instance"
        ? prisma.assignmentInstance.update({ where: { id: update.id }, data: { sortOrder: update.sortOrder } })
        : prisma.daySeparator.update({ where: { id: update.id }, data: { sortOrder: update.sortOrder } })
    )
  );
  return updates.length;
}

/** How far ahead the repair looks: far enough to cover every day a parent
 * plans, short enough to stay a cheap query on every page load. */
export const TIE_REPAIR_DAYS_BACK = 1;
export const TIE_REPAIR_DAYS_AHEAD = 28;

export function tieRepairWindow(asOf: Date): { from: Date; to: Date } {
  return { from: addDays(asOf, -TIE_REPAIR_DAYS_BACK), to: addDays(asOf, TIE_REPAIR_DAYS_AHEAD) };
}
