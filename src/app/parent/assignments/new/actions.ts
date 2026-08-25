"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getToday, mondayOf, parseISODate, toISODate } from "@/lib/dates";
import { EndCondition, Frequency } from "@/generated/prisma/enums";
import { materializeSeries } from "@/lib/materialize";

const REPEAT_TO_FREQUENCY: Record<string, Frequency> = {
  weekdays: Frequency.weekdays,
  weekly: Frequency.weekly,
  biweekly: Frequency.biweekly,
  monthly: Frequency.monthly,
};

export async function createAssignment(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const studentIds = formData.getAll("studentId").map(String);
  const subjectId = String(formData.get("subjectId") ?? "");
  const details = String(formData.get("details") ?? "").trim();
  const estimatedMinutesRaw = String(formData.get("estimatedMinutes") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const repeat = String(formData.get("repeat") ?? "none");
  const daysOfWeek = formData.getAll("daysOfWeek").map(String);
  const endCondition = String(formData.get("endCondition") ?? EndCondition.never);
  const endDateRaw = String(formData.get("endDate") ?? "");
  const endCountRaw = String(formData.get("endCount") ?? "");
  const requiresReview = formData.get("requiresReview") === "on";
  // §12: presence of a scheduledTime is what makes an assignment
  // time-sensitive — the form only renders/requires the field once the
  // toggle is on, so there's no separate boolean to read here.
  const scheduledTimeRaw = String(formData.get("scheduledTime") ?? "").trim();
  const isTimeSensitive = !!scheduledTimeRaw;
  const reminderMinutesBeforeRaw = String(formData.get("reminderMinutesBefore") ?? "");

  if (!title || studentIds.length === 0 || !subjectId || !dueDateRaw) {
    throw new Error("Title, at least one student, subject, and due date are required.");
  }

  const startDate = parseISODate(dueDateRaw);
  const frequency = REPEAT_TO_FREQUENCY[repeat];

  // Each series/instance belongs to exactly one student (§3), so selecting
  // multiple students fans out an independent copy per student — each kid
  // completes, rolls, and gets reviewed on their own, per §5/§6.
  const today = getToday();
  const materializeFrom = startDate < today ? startDate : today;

  await Promise.all(
    studentIds.map(async (studentId) => {
      const series = await prisma.assignmentSeries.create({
        data: {
          title,
          details: details || null,
          studentId,
          subjectId,
          createdBy: "parent",
          startDate,
          endCondition: endCondition as EndCondition,
          endDate: endCondition === EndCondition.onDate && endDateRaw ? parseISODate(endDateRaw) : null,
          endCount: endCondition === EndCondition.afterNCount && endCountRaw ? Number(endCountRaw) : null,
          estimatedMinutes: estimatedMinutesRaw ? Number(estimatedMinutesRaw) : null,
          requiresReview,
          isTimeSensitive,
          scheduledTime: isTimeSensitive ? scheduledTimeRaw : null,
          reminderMinutesBefore: isTimeSensitive && reminderMinutesBeforeRaw ? Number(reminderMinutesBeforeRaw) : null,
          recurrence: frequency
            ? {
                create: {
                  frequency,
                  daysOfWeek: daysOfWeek.length ? daysOfWeek.join(",") : null,
                  interval: repeat === "biweekly" ? 2 : 1,
                },
              }
            : undefined,
        },
      });
      // §3's materialization rule: generate the rolling 60-day horizon of
      // instances from the series definition rather than hand-creating one.
      await materializeSeries(prisma, series.id, materializeFrom);
    })
  );

  redirect(`/parent?week=${toISODate(mondayOf(startDate))}`);
}
