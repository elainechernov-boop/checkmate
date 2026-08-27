import type { AssignmentInstance, PrismaClient } from "@/generated/prisma/client";
import { InstanceStatus, SchoolDayType } from "@/generated/prisma/enums";
import { parseISODate } from "./dates";
import { materializeSeries } from "./materialize";
import { setSchoolDayType } from "./schoolCalendar";

type UndoPrisma = Pick<
  PrismaClient,
  "undoLogEntry" | "assignmentInstance" | "assignmentSeries" | "removedOccurrence" | "schoolDay" | "daySeparator"
>;

const MAX_LOG_ENTRIES = 20;

export class UndoError extends Error {}

export type ActionType = "deleteInstance" | "dayTypeChange";

interface DeleteInstancePayload {
  instance: AssignmentInstance;
  removedOccurrence: { seriesId: string; date: string } | null;
}

interface DayTypeChangePayload {
  schoolDays: { studentId: string; dateISO: string; previousType: SchoolDayType | null }[];
  movedInstances: { instanceId: string; previousDueDate: string; previousOriginalDueDate: string | null }[];
}

const TYPE_LABEL: Record<SchoolDayType, string> = {
  schoolDay: "as a school day",
  offDay: "off",
  fieldTrip: "as a field trip",
  sick: "as a sick day",
  holiday: "as a holiday",
};

export function describeDayType(type: SchoolDayType): string {
  return TYPE_LABEL[type];
}

/**
 * Appends one entry and prunes anything past the last MAX_LOG_ENTRIES —
 * "undo my last 10-20 steps" (§ Parent Mode) means a step that's aged out
 * simply can't be undone anymore, not an unbounded history table.
 */
export async function recordUndo(
  prisma: UndoPrisma,
  actionType: ActionType,
  summary: string,
  payload: DeleteInstancePayload | DayTypeChangePayload
): Promise<void> {
  await prisma.undoLogEntry.create({
    data: { actionType, summary, payload: JSON.stringify(payload) },
  });
  const stale = await prisma.undoLogEntry.findMany({
    orderBy: { createdAt: "desc" },
    skip: MAX_LOG_ENTRIES,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.undoLogEntry.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }
}

export interface UndoLogRow {
  id: string;
  summary: string;
  createdAt: Date;
  undone: boolean;
}

export async function listRecentUndoLog(
  prisma: Pick<PrismaClient, "undoLogEntry">,
  limit = MAX_LOG_ENTRIES
): Promise<UndoLogRow[]> {
  const rows = await prisma.undoLogEntry.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  return rows.map((row) => ({ id: row.id, summary: row.summary, createdAt: row.createdAt, undone: !!row.undoneAt }));
}

// JSON round-trips every Date field to a string — these are exactly the
// ones AssignmentInstance carries, so they need reviving before the row
// goes back in through a plain `create`.
function reviveInstance(raw: AssignmentInstance): AssignmentInstance {
  return {
    ...raw,
    dueDate: raw.dueDate ? new Date(raw.dueDate) : null,
    originalDueDate: raw.originalDueDate ? new Date(raw.originalDueDate) : null,
    completedAt: raw.completedAt ? new Date(raw.completedAt) : null,
    reviewedAt: raw.reviewedAt ? new Date(raw.reviewedAt) : null,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}

async function undoDeleteInstance(prisma: UndoPrisma, payload: DeleteInstancePayload): Promise<void> {
  await prisma.assignmentInstance.create({ data: reviveInstance(payload.instance) });
  if (payload.removedOccurrence) {
    await prisma.removedOccurrence.deleteMany({
      where: { seriesId: payload.removedOccurrence.seriesId, date: new Date(payload.removedOccurrence.date) },
    });
  }
}

async function undoDayTypeChange(prisma: UndoPrisma, payload: DayTypeChangePayload): Promise<void> {
  const affectedStudentIds = new Set<string>();
  for (const change of payload.schoolDays) {
    affectedStudentIds.add(change.studentId);
    if (change.previousType) {
      await setSchoolDayType(prisma, change.studentId, parseISODate(change.dateISO), change.previousType);
    } else {
      await prisma.schoolDay.deleteMany({ where: { studentId: change.studentId, date: parseISODate(change.dateISO) } });
    }
  }

  // Recurring occurrences resync on their own once the calendar's back to
  // how it was (the day-off/day-on fix this session already relies on the
  // same self-healing behavior) — no need to restore deleted instances by
  // hand, just let materialization run again against the restored calendar.
  for (const studentId of affectedStudentIds) {
    const seriesList = await prisma.assignmentSeries.findMany({ where: { studentId }, select: { id: true } });
    for (const series of seriesList) await materializeSeries(prisma, series.id);
  }

  // Standalone items that got auto-moved to the next school day as a side
  // effect don't come back on their own — move each one back explicitly,
  // skipping anything that's been touched again since (no longer open).
  for (const moved of payload.movedInstances) {
    const instance = await prisma.assignmentInstance.findUnique({ where: { id: moved.instanceId } });
    if (!instance || instance.status !== InstanceStatus.open) continue;
    await prisma.assignmentInstance.update({
      where: { id: moved.instanceId },
      data: {
        dueDate: parseISODate(moved.previousDueDate),
        originalDueDate: moved.previousOriginalDueDate ? parseISODate(moved.previousOriginalDueDate) : null,
      },
    });
  }
}

export async function undoEntry(prisma: UndoPrisma, entryId: string): Promise<void> {
  const entry = await prisma.undoLogEntry.findUniqueOrThrow({ where: { id: entryId } });
  if (entry.undoneAt) throw new UndoError("This was already undone.");

  const payload = JSON.parse(entry.payload);

  if (entry.actionType === "deleteInstance") {
    await undoDeleteInstance(prisma, payload as DeleteInstancePayload);
  } else if (entry.actionType === "dayTypeChange") {
    await undoDayTypeChange(prisma, payload as DayTypeChangePayload);
  } else {
    throw new UndoError(`Unknown action type: ${entry.actionType}`);
  }

  await prisma.undoLogEntry.update({ where: { id: entryId }, data: { undoneAt: new Date() } });
}
