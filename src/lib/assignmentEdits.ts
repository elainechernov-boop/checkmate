import type { PrismaClient } from "@/generated/prisma/client";
import { EndCondition, type Frequency } from "@/generated/prisma/enums";
import { addDays, startOfUTCDay } from "./dates";
import { materializeSeries } from "./materialize";

export interface InstanceEditableFields {
  title?: string;
  details?: string | null;
  subjectId?: string | null;
  dueDate?: Date;
  requiresReview?: boolean;
}

export interface SeriesEditableFields {
  title?: string;
  details?: string | null;
  subjectId?: string | null;
  requiresReview?: boolean;
  estimatedMinutes?: number | null;
  recurrence?: {
    frequency?: Frequency;
    daysOfWeek?: string | null;
    interval?: number;
  };
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
