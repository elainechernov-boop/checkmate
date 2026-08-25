import type { PrismaClient } from "@/generated/prisma/client";
import { EndCondition, InstanceStatus, type Frequency } from "@/generated/prisma/enums";
import { addDays, getToday, startOfUTCDay } from "./dates";
import { materializeSeries } from "./materialize";

// Deleting never touches a resolved instance (done/excused) even when the
// scope is "this and following" or "all in series" — a completed
// assignment is a real historical record (relevant to attendance later,
// §8), and a bulk delete shouldn't be able to erase it by accident the way
// a single explicit delete on that exact row still can.
const DELETABLE_STATUSES = [InstanceStatus.open, InstanceStatus.pendingReview];

export interface InstanceEditableFields {
  title?: string;
  details?: string | null;
  subjectId?: string | null;
  dueDate?: Date;
  requiresReview?: boolean;
  estimatedMinutes?: number | null;
  // §12
  isTimeSensitive?: boolean;
  scheduledTime?: string | null;
  reminderMinutesBefore?: number | null;
}

export interface SeriesEditableFields {
  title?: string;
  details?: string | null;
  subjectId?: string | null;
  requiresReview?: boolean;
  estimatedMinutes?: number | null;
  // §12
  isTimeSensitive?: boolean;
  scheduledTime?: string | null;
  reminderMinutesBefore?: number | null;
  recurrence?: {
    frequency?: Frequency;
    daysOfWeek?: string | null;
    interval?: number;
  };
}

export interface PromoteToSeriesFields {
  title: string;
  details: string | null;
  subjectId: string | null;
  requiresReview: boolean;
  estimatedMinutes: number | null;
  // §12
  isTimeSensitive: boolean;
  scheduledTime: string | null;
  reminderMinutesBefore: number | null;
  recurrence: {
    frequency: Frequency;
    daysOfWeek: string | null;
    interval: number;
  };
  endCondition: EndCondition;
  endDate: Date | null;
  endCount: number | null;
}

type EditablePrisma = Pick<PrismaClient, "assignmentInstance" | "assignmentSeries" | "recurrenceRule" | "schoolDay" | "$transaction">;

/** §4 "This assignment only" — edits one occurrence and detaches it from its
 * series so future regeneration never touches it again. */
export async function editInstanceOnly(
  prisma: Pick<PrismaClient, "assignmentInstance">,
  instanceId: string,
  changes: InstanceEditableFields
): Promise<void> {
  const { dueDate, ...rest } = changes;
  await prisma.assignmentInstance.update({
    where: { id: instanceId },
    data: {
      ...rest,
      ...(dueDate ? { dueDate, originalDueDate: dueDate } : {}),
      isOverride: true,
    },
  });
}

/** §4 "This and following" — splits the series at this occurrence: the old
 * series ends the day before, a new series (carrying the edit) picks up
 * from here on, inheriting whatever's left of the original end condition. */
export async function editSeriesThisAndFollowing(
  prisma: EditablePrisma,
  instanceId: string,
  changes: SeriesEditableFields
): Promise<{ newSeriesId: string } | { detachedOnly: true }> {
  return prisma.$transaction(async (tx) => {
    const instance = await tx.assignmentInstance.findUniqueOrThrow({
      where: { id: instanceId },
      include: { series: { include: { recurrence: true } } },
    });

    if (!instance.seriesId || !instance.series || !instance.dueDate) {
      // No series to split — fall back to a one-off edit.
      await editInstanceOnly(tx, instanceId, changes);
      return { detachedOnly: true } as const;
    }

    const series = instance.series;
    const splitDate = startOfUTCDay(instance.dueDate);

    const priorCount = await tx.assignmentInstance.count({
      where: { seriesId: series.id, dueDate: { lt: splitDate } },
    });

    // Cap the old series so it stops generating on/after the split date.
    await tx.assignmentSeries.update({
      where: { id: series.id },
      data: { endCondition: EndCondition.onDate, endDate: addDays(splitDate, -1) },
    });

    // The occurrence being edited is superseded by the new series below.
    await tx.assignmentInstance.delete({ where: { id: instance.id } });

    const { endCondition, endDate } = series;
    let endCount = series.endCount;
    if (series.endCondition === EndCondition.afterNCount && series.endCount != null) {
      endCount = Math.max(series.endCount - priorCount, 0);
    }

    const newSeries = await tx.assignmentSeries.create({
      data: {
        title: changes.title ?? series.title,
        details: changes.details !== undefined ? changes.details : series.details,
        studentId: series.studentId,
        subjectId: changes.subjectId !== undefined ? changes.subjectId : series.subjectId,
        projectId: series.projectId,
        createdBy: series.createdBy,
        startDate: splitDate,
        endCondition,
        endDate,
        endCount,
        estimatedMinutes: changes.estimatedMinutes !== undefined ? changes.estimatedMinutes : series.estimatedMinutes,
        requiresReview: changes.requiresReview !== undefined ? changes.requiresReview : series.requiresReview,
        isTimeSensitive:
          changes.isTimeSensitive !== undefined ? changes.isTimeSensitive : series.isTimeSensitive,
        scheduledTime: changes.scheduledTime !== undefined ? changes.scheduledTime : series.scheduledTime,
        reminderMinutesBefore:
          changes.reminderMinutesBefore !== undefined
            ? changes.reminderMinutesBefore
            : series.reminderMinutesBefore,
        recurrence: series.recurrence
          ? {
              create: {
                frequency: changes.recurrence?.frequency ?? series.recurrence.frequency,
                daysOfWeek:
                  changes.recurrence?.daysOfWeek !== undefined
                    ? changes.recurrence.daysOfWeek
                    : series.recurrence.daysOfWeek,
                interval: changes.recurrence?.interval ?? series.recurrence.interval,
              },
            }
          : undefined,
      },
    });

    await materializeSeries(tx, series.id, splitDate);
    await materializeSeries(tx, newSeries.id, splitDate);

    return { newSeriesId: newSeries.id };
  });
}

/** §4 "All in series" — edits the series itself and regenerates every
 * future, non-protected instance to match. */
export async function editAllInSeries(
  prisma: EditablePrisma,
  seriesId: string,
  changes: SeriesEditableFields,
  asOf?: Date
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { recurrence, ...seriesChanges } = changes;
    await tx.assignmentSeries.update({
      where: { id: seriesId },
      data: seriesChanges,
    });
    if (recurrence) {
      await tx.recurrenceRule.update({
        where: { seriesId },
        data: recurrence,
      });
    }
    await materializeSeries(tx, seriesId, asOf);
  });
}

/**
 * Adding repetition to a previously one-off instance (§4's "add repetition,
 * etc." when editing a quick-added item). Since a standalone instance has
 * no series to extend, this creates a fresh one rooted at the instance's
 * due date, materializes it, and removes the now-superseded standalone row.
 */
export async function promoteInstanceToSeries(
  prisma: EditablePrisma,
  instanceId: string,
  fields: PromoteToSeriesFields
): Promise<{ seriesId: string }> {
  return prisma.$transaction(async (tx) => {
    const instance = await tx.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });
    if (instance.seriesId) {
      throw new Error("This assignment already belongs to a series.");
    }

    const startDate = instance.dueDate ? startOfUTCDay(instance.dueDate) : getToday();

    const series = await tx.assignmentSeries.create({
      data: {
        title: fields.title,
        details: fields.details,
        studentId: instance.studentId,
        subjectId: fields.subjectId,
        createdBy: instance.createdBy,
        startDate,
        endCondition: fields.endCondition,
        endDate: fields.endDate,
        endCount: fields.endCount,
        estimatedMinutes: fields.estimatedMinutes,
        requiresReview: fields.requiresReview,
        isTimeSensitive: fields.isTimeSensitive,
        scheduledTime: fields.scheduledTime,
        reminderMinutesBefore: fields.reminderMinutesBefore,
        recurrence: { create: fields.recurrence },
      },
    });

    await tx.assignmentInstance.delete({ where: { id: instanceId } });
    await materializeSeries(tx, series.id, startDate);

    return { seriesId: series.id };
  });
}

/**
 * Drag-to-reschedule (§5). A dragged card always moves just that one
 * occurrence — never the rest of a repeating series — matching "move an
 * assignment from Friday to Saturday even if it's set to every school day,
 * without messing up the rest of the repeated assignments."
 */
export async function rescheduleInstance(
  prisma: Pick<PrismaClient, "assignmentInstance">,
  instanceId: string,
  newDueDate: Date
): Promise<void> {
  const instance = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });

  if (instance.seriesId) {
    await editInstanceOnly(prisma, instanceId, { dueDate: newDueDate });
  } else {
    await prisma.assignmentInstance.update({
      where: { id: instanceId },
      data: { dueDate: newDueDate, originalDueDate: newDueDate },
    });
  }
}

/**
 * "This assignment only" — removes just the one row the parent picked,
 * whatever its status. An explicit single-item delete is fully trusted.
 *
 * When the row belongs to a series, materializeSeries would otherwise
 * recreate it the next time it runs (a hard delete leaves that date looking
 * exactly like one that was simply never generated yet) — recording it as a
 * RemovedOccurrence tells materializeSeries to permanently skip that date
 * instead, the way it needs the parent's actual intent to be preserved.
 */
export async function deleteInstanceOnly(
  prisma: Pick<PrismaClient, "assignmentInstance" | "removedOccurrence">,
  instanceId: string
): Promise<void> {
  const instance = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });
  await prisma.assignmentInstance.delete({ where: { id: instanceId } });
  if (instance.seriesId && instance.originalDueDate) {
    await prisma.removedOccurrence.upsert({
      where: { seriesId_date: { seriesId: instance.seriesId, date: instance.originalDueDate } },
      create: { seriesId: instance.seriesId, date: instance.originalDueDate },
      update: {},
    });
  }
}

/** "This and following" — caps the series so it stops generating on/after
 * this occurrence, and removes every not-yet-resolved instance from here
 * on (done/excused instances stay, as historical record). */
export async function deleteSeriesThisAndFollowing(
  prisma: EditablePrisma,
  instanceId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const instance = await tx.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });
    if (!instance.seriesId || !instance.dueDate) {
      await deleteInstanceOnly(tx, instanceId);
      return;
    }

    const series = await tx.assignmentSeries.findUniqueOrThrow({ where: { id: instance.seriesId } });
    const splitDate = startOfUTCDay(instance.dueDate);

    if (splitDate <= startOfUTCDay(series.startDate)) {
      // Deleting from the very first occurrence onward — nothing of the
      // series survives it, so remove the series outright rather than
      // leaving a permanently-capped, empty husk behind.
      await tx.assignmentInstance.deleteMany({
        where: { seriesId: series.id, status: { in: DELETABLE_STATUSES } },
      });
      const remaining = await tx.assignmentInstance.count({ where: { seriesId: series.id } });
      if (remaining === 0) {
        await tx.assignmentSeries.delete({ where: { id: series.id } });
      } else {
        await tx.assignmentSeries.update({
          where: { id: series.id },
          data: { endCondition: EndCondition.onDate, endDate: addDays(startOfUTCDay(series.startDate), -1) },
        });
      }
      return;
    }

    await tx.assignmentSeries.update({
      where: { id: series.id },
      data: { endCondition: EndCondition.onDate, endDate: addDays(splitDate, -1) },
    });
    await tx.assignmentInstance.deleteMany({
      where: { seriesId: series.id, dueDate: { gte: splitDate }, status: { in: DELETABLE_STATUSES } },
    });
  });
}

/** "All in series" — removes every not-yet-resolved instance in the
 * series and, if nothing resolved is left behind, the series itself; a
 * series with completed history stays around (capped so it can never
 * generate again) so that history remains visible. */
export async function deleteAllInSeries(
  prisma: EditablePrisma,
  seriesId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const series = await tx.assignmentSeries.findUniqueOrThrow({ where: { id: seriesId } });
    await tx.assignmentInstance.deleteMany({ where: { seriesId, status: { in: DELETABLE_STATUSES } } });
    const remaining = await tx.assignmentInstance.count({ where: { seriesId } });
    if (remaining === 0) {
      await tx.assignmentSeries.delete({ where: { id: seriesId } });
    } else {
      await tx.assignmentSeries.update({
        where: { id: seriesId },
        data: { endCondition: EndCondition.onDate, endDate: addDays(startOfUTCDay(series.startDate), -1) },
      });
    }
  });
}

/** Click-a-date quick-add (§4): title only, everything else refined later
 * via the full edit modal. */
export async function quickCreateInstance(
  prisma: Pick<PrismaClient, "assignmentInstance">,
  studentId: string,
  dueDate: Date,
  title: string
): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed || !studentId) return;

  await prisma.assignmentInstance.create({
    data: {
      title: trimmed,
      studentId,
      createdBy: "parent",
      dueDate,
      originalDueDate: dueDate,
      status: "open",
    },
  });
}
