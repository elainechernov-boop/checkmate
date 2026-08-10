"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SchoolDayType } from "@/generated/prisma/enums";
import { addDays, parseISODate } from "@/lib/dates";
import { materializeSeries } from "@/lib/materialize";
import { setSchoolDayType } from "@/lib/schoolCalendar";

/** Re-materializing every series after a calendar change matches
 * planner-actions.ts's setDayType — a newly-blocked day needs to disappear
 * from series-generated occurrences (§3), and a newly-opened one needs to
 * pick them back up. */
async function rematerializeAllSeries() {
  const seriesList = await prisma.assignmentSeries.findMany({ select: { id: true } });
  for (const series of seriesList) await materializeSeries(prisma, series.id);
}

/** §8 "import/enter Blue Ridge's academic calendar once" — a single day is
 * just a range where start equals end, so this is the one tool for both. */
export async function applyDayTypeRange(formData: FormData) {
  const startISO = String(formData.get("startDate") ?? "");
  const endISO = String(formData.get("endDate") ?? "");
  const type = String(formData.get("type") ?? SchoolDayType.schoolDay) as SchoolDayType;
  if (!startISO || !endISO) return;

  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  if (end < start) return;

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    await setSchoolDayType(prisma, cursor, type);
  }
  await rematerializeAllSeries();
  revalidatePath("/parent/calendar");
  revalidatePath("/parent");
}

export async function createLearningPeriod(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const startDateRaw = String(formData.get("startDate") ?? "");
  const endDateRaw = String(formData.get("endDate") ?? "");
  const hstMeetingDateRaw = String(formData.get("hstMeetingDate") ?? "");

  if (!name || !startDateRaw || !endDateRaw) {
    throw new Error("Name, start date, and end date are required.");
  }

  await prisma.learningPeriod.create({
    data: {
      name,
      startDate: parseISODate(startDateRaw),
      endDate: parseISODate(endDateRaw),
      hstMeetingDate: hstMeetingDateRaw ? parseISODate(hstMeetingDateRaw) : null,
    },
  });
  revalidatePath("/parent/calendar");
  revalidatePath("/parent");
}

export async function updateLearningPeriod(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const startDateRaw = String(formData.get("startDate") ?? "");
  const endDateRaw = String(formData.get("endDate") ?? "");
  const hstMeetingDateRaw = String(formData.get("hstMeetingDate") ?? "");

  if (!id || !name || !startDateRaw || !endDateRaw) {
    throw new Error("Name, start date, and end date are required.");
  }

  await prisma.learningPeriod.update({
    where: { id },
    data: {
      name,
      startDate: parseISODate(startDateRaw),
      endDate: parseISODate(endDateRaw),
      hstMeetingDate: hstMeetingDateRaw ? parseISODate(hstMeetingDateRaw) : null,
    },
  });
  revalidatePath("/parent/calendar");
  revalidatePath("/parent");
}

export async function deleteLearningPeriod(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.learningPeriod.delete({ where: { id } });
  revalidatePath("/parent/calendar");
  revalidatePath("/parent");
}
