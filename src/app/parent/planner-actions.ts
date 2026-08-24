"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseISODate, toISODate } from "@/lib/dates";
import { EndCondition, Frequency, SchoolDayType } from "@/generated/prisma/enums";
import {
  deleteAllInSeries,
  deleteInstanceOnly,
  deleteSeriesThisAndFollowing,
  editAllInSeries,
  editInstanceOnly,
  editSeriesThisAndFollowing,
  promoteInstanceToSeries,
  quickCreateInstance,
  rescheduleInstance as rescheduleInstanceLib,
} from "@/lib/assignmentEdits";
import { materializeSeries } from "@/lib/materialize";
import { reorderInstancesForDay } from "@/lib/reorderInstances";
import { applyRescheduleHelper, findReschedulableInstances } from "@/lib/rescheduleHelper";
import { approveReview, returnReview } from "@/lib/reviewActions";
import { setSchoolDayType } from "@/lib/schoolCalendar";
import { describeDayType, recordUndo } from "@/lib/undoLog";

const REPEAT_TO_FREQUENCY: Record<string, Frequency> = {
  weekdays: Frequency.weekdays,
  weekly: Frequency.weekly,
  biweekly: Frequency.biweekly,
  monthly: Frequency.monthly,
};

export async function quickCreateAssignment(studentId: string, dueDateISO: string, title: string) {
  await quickCreateInstance(prisma, studentId, parseISODate(dueDateISO), title);
  revalidatePath("/parent");
}

export async function rescheduleInstance(instanceId: string, newDueDateISO: string) {
  await rescheduleInstanceLib(prisma, instanceId, parseISODate(newDueDateISO));
  revalidatePath("/parent");
}

/** Parent Mode's own within-day drag-reorder, for her own visual planning
 * (not tied to "today" or "open" the way the student's own reorder is). */
export async function reorderDayInstances(studentId: string, dateISO: string, orderedIds: string[]) {
  await reorderInstancesForDay(prisma, studentId, dateISO, orderedIds);
  revalidatePath("/parent");
}

/** §5 step 2: approving a "Show Mom" item from Parent Mode. The full
 * completion sequence then plays on the student's own screen at their next
 * refresh (see StudentWeekView's external-approval detection). */
export async function approveReviewAction(instanceId: string) {
  await approveReview(prisma, instanceId);
  revalidatePath("/parent");
}

/** §5 step 4: "not your best work" — sends the item back to open. */
export async function returnReviewAction(instanceId: string, note: string) {
  await returnReview(prisma, instanceId, note);
  revalidatePath("/parent");
}

/**
 * §5 "field trips and off days" — for one student (the family-wide
 * academic calendar is calendar/actions.ts's applyDayTypeRange, which just
 * calls this once per student). Changing a day's type re-materializes that
 * student's own series so series-generated (recurring) occurrences on it
 * correctly disappear — they'll get another chance whenever the series
 * next generates, no rescheduling needed. Whatever's left over (standalone
 * or individually-edited instances, which nothing else will move) goes
 * straight to the next school day, same as an overdue item's own roll —
 * no prompt, since "move it to the next school day" is the only sensible
 * outcome for a one-off that just lost its day.
 */
export async function setDayType(studentId: string, dateISO: string, type: SchoolDayType) {
  const date = parseISODate(dateISO);
  const existing = await prisma.schoolDay.findUnique({ where: { date_studentId: { date, studentId } } });
  const previousType = existing?.type ?? null;

  await setSchoolDayType(prisma, studentId, date, type);

  const seriesList = await prisma.assignmentSeries.findMany({ where: { studentId }, select: { id: true } });
  for (const series of seriesList) {
    await materializeSeries(prisma, series.id);
  }

  const movedInstances: { instanceId: string; previousDueDate: string; previousOriginalDueDate: string | null }[] = [];
  if (type !== SchoolDayType.schoolDay) {
    const reschedulable = await findReschedulableInstances(prisma, studentId, date);
    for (const instance of reschedulable) {
      movedInstances.push({
        instanceId: instance.id,
        previousDueDate: dateISO,
        previousOriginalDueDate: instance.originalDueDate ? toISODate(instance.originalDueDate) : null,
      });
    }
    await applyRescheduleHelper(prisma, studentId, date, { mode: "nextSchoolDay" });
  }

  await recordUndo(prisma, "dayTypeChange", `Marked ${dateISO} ${describeDayType(type)}`, {
    schoolDays: [{ studentId, dateISO, previousType }],
    movedInstances,
  });

  revalidatePath("/parent");
}

/**
 * The full edit modal's save handler. `scope` only matters when the
 * instance already belongs to a series; a standalone instance is edited
 * directly, or — if the parent adds a repeat pattern — promoted to a new
 * series entirely (§4: "add repetition, etc.").
 */
export async function updateAssignment(formData: FormData) {
  const instanceId = String(formData.get("instanceId") ?? "");
  const scope = String(formData.get("scope") ?? "only");
  const title = String(formData.get("title") ?? "").trim();
  const subjectId = String(formData.get("subjectId") ?? "") || null;
  const details = String(formData.get("details") ?? "").trim() || null;
  const estimatedMinutesRaw = String(formData.get("estimatedMinutes") ?? "").trim();
  const estimatedMinutes = estimatedMinutesRaw ? Number(estimatedMinutesRaw) : null;
  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const requiresReview = formData.get("requiresReview") === "on";
  // §12: same "presence of scheduledTime means time-sensitive" rule as
  // the New Assignment form (see assignments/new/actions.ts).
  const scheduledTimeRaw = String(formData.get("scheduledTime") ?? "").trim();
  const isTimeSensitive = !!scheduledTimeRaw;
  const reminderMinutesBeforeRaw = String(formData.get("reminderMinutesBefore") ?? "");
  const reminderMinutesBefore = isTimeSensitive && reminderMinutesBeforeRaw ? Number(reminderMinutesBeforeRaw) : null;
  const repeat = String(formData.get("repeat") ?? "none");
  const daysOfWeek = formData.getAll("daysOfWeek").map(String);
  const endCondition = String(formData.get("endCondition") ?? EndCondition.never) as EndCondition;
  const endDateRaw = String(formData.get("endDate") ?? "");
  const endCountRaw = String(formData.get("endCount") ?? "");

  if (!instanceId || !title) {
    throw new Error("Title is required.");
  }

  const instance = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });
  const frequency = REPEAT_TO_FREQUENCY[repeat];
  const recurrence = frequency
    ? {
        frequency,
        daysOfWeek: daysOfWeek.length ? daysOfWeek.join(",") : null,
        interval: repeat === "biweekly" ? 2 : 1,
      }
    : undefined;

  if (!instance.seriesId) {
    if (recurrence) {
      await promoteInstanceToSeries(prisma, instanceId, {
        title,
        details,
        subjectId,
        requiresReview,
        estimatedMinutes,
        isTimeSensitive,
        scheduledTime: isTimeSensitive ? scheduledTimeRaw : null,
        reminderMinutesBefore,
        recurrence,
        endCondition,
        endDate: endCondition === EndCondition.onDate && endDateRaw ? parseISODate(endDateRaw) : null,
        endCount: endCondition === EndCondition.afterNCount && endCountRaw ? Number(endCountRaw) : null,
      });
    } else {
      await editInstanceOnly(prisma, instanceId, {
        title,
        subjectId,
        details,
        dueDate: dueDateRaw ? parseISODate(dueDateRaw) : undefined,
        requiresReview,
        estimatedMinutes,
        isTimeSensitive,
        scheduledTime: isTimeSensitive ? scheduledTimeRaw : null,
        reminderMinutesBefore,
      });
    }
  } else if (scope === "following") {
    await editSeriesThisAndFollowing(prisma, instanceId, {
      title,
      subjectId,
      details,
      estimatedMinutes,
      requiresReview,
      isTimeSensitive,
      scheduledTime: isTimeSensitive ? scheduledTimeRaw : null,
      reminderMinutesBefore,
      recurrence,
    });
  } else if (scope === "all") {
    await editAllInSeries(prisma, instance.seriesId, {
      title,
      subjectId,
      details,
      estimatedMinutes,
      requiresReview,
      isTimeSensitive,
      scheduledTime: isTimeSensitive ? scheduledTimeRaw : null,
      reminderMinutesBefore,
      recurrence,
    });
  } else {
    await editInstanceOnly(prisma, instanceId, {
      title,
      subjectId,
      details,
      dueDate: dueDateRaw ? parseISODate(dueDateRaw) : undefined,
      requiresReview,
      estimatedMinutes,
      isTimeSensitive,
      scheduledTime: isTimeSensitive ? scheduledTimeRaw : null,
      reminderMinutesBefore,
    });
  }

  revalidatePath("/parent");
}

/**
 * Delete, following the same scope pattern as edits (§4). Standalone
 * instances ignore scope entirely — there's no series to widen the delete
 * to. Completed work is never swept up by a "following"/"all" delete; see
 * assignmentEdits.ts's DELETABLE_STATUSES.
 *
 * Only the single-instance path (scope "only", or any standalone delete
 * regardless of scope) is logged for undo — that's the one the hover-X
 * quick delete always uses, and the one snapshot is simple: one row, plus
 * at most one RemovedOccurrence. "Following"/"all" can cascade across a
 * whole series (capping it, sometimes deleting it outright) and aren't
 * undoable yet.
 */
export async function deleteAssignment(instanceId: string, scope: "only" | "following" | "all") {
  const instance = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });

  if (!instance.seriesId || scope === "only") {
    const hadRemovedOccurrenceAlready =
      instance.seriesId && instance.originalDueDate
        ? await prisma.removedOccurrence.findUnique({
            where: { seriesId_date: { seriesId: instance.seriesId, date: instance.originalDueDate } },
          })
        : null;

    await deleteInstanceOnly(prisma, instanceId);

    await recordUndo(prisma, "deleteInstance", `Deleted "${instance.title}"`, {
      instance,
      removedOccurrence:
        instance.seriesId && instance.originalDueDate && !hadRemovedOccurrenceAlready
          ? { seriesId: instance.seriesId, date: instance.originalDueDate.toISOString() }
          : null,
    });
  } else if (scope === "following") {
    await deleteSeriesThisAndFollowing(prisma, instanceId);
  } else {
    await deleteAllInSeries(prisma, instance.seriesId);
  }

  revalidatePath("/parent");
}
