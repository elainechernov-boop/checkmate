"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addDays, mondayOf, parseISODate, toISODate } from "@/lib/dates";
import { EndCondition, Frequency } from "@/generated/prisma/enums";

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

  if (!title || studentIds.length === 0 || !subjectId || !dueDateRaw) {
    throw new Error("Title, at least one student, subject, and due date are required.");
  }

  const startDate = parseISODate(dueDateRaw);
  const frequency = REPEAT_TO_FREQUENCY[repeat];

  // Each series/instance belongs to exactly one student (§3), so selecting
  // multiple students fans out an independent copy per student — each kid
  // completes, rolls, and gets reviewed on their own, per §5/§6.
  await Promise.all(
    studentIds.map((studentId) =>
      prisma.assignmentSeries.create({
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
          recurrence: frequency
            ? {
                create: {
                  frequency,
                  daysOfWeek: daysOfWeek.length ? daysOfWeek.join(",") : null,
                  interval: repeat === "biweekly" ? 2 : 1,
                },
              }
            : undefined,
          // Materializing the full recurrence horizon is Phase 2's job (§3). For now,
          // create the first occurrence so the week grid has something to show.
          instances: {
            create: {
              title,
              details: details || null,
              studentId,
              subjectId,
              createdBy: "parent",
              dueDate: startDate,
              originalDueDate: startDate,
              requiresReview,
            },
          },
        },
      })
    )
  );

  redirect(`/parent?week=${toISODate(mondayOf(startDate))}`);
}
