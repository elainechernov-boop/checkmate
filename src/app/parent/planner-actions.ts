"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseISODate } from "@/lib/dates";
import { EndCondition, Frequency } from "@/generated/prisma/enums";
import {
  editAllInSeries,
  editInstanceOnly,
  editSeriesThisAndFollowing,
  promoteInstanceToSeries,
  quickCreateInstance,
  rescheduleInstance as rescheduleInstanceLib,
} from "@/lib/assignmentEdits";

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
      });
    }
  } else if (scope === "following") {
    await editSeriesThisAndFollowing(prisma, instanceId, {
      title,
      subjectId,
      details,
      estimatedMinutes,
      requiresReview,
      recurrence,
    });
  } else if (scope === "all") {
    await editAllInSeries(prisma, instance.seriesId, {
      title,
      subjectId,
      details,
      estimatedMinutes,
      requiresReview,
      recurrence,
    });
  } else {
    await editInstanceOnly(prisma, instanceId, {
      title,
      subjectId,
      details,
      dueDate: dueDateRaw ? parseISODate(dueDateRaw) : undefined,
      requiresReview,
    });
  }

  revalidatePath("/parent");
}
