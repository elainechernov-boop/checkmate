"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SchoolDayType } from "@/generated/prisma/enums";
import { addDays, parseISODate, toISODate } from "@/lib/dates";
import {
  assignCalendarEvent,
  clearFamilyCalendarSettings,
  dismissCalendarEvent,
  setFamilyCalendarSettings,
  unassignCalendarEvent,
} from "@/lib/familyCalendar";
import { materializeSeries } from "@/lib/materialize";
import { applyRescheduleHelper, findReschedulableInstances } from "@/lib/rescheduleHelper";
import { setSchoolDayType } from "@/lib/schoolCalendar";
import { describeDayType, recordUndo } from "@/lib/undoLog";

/** Re-materializing every series after a calendar change matches
 * planner-actions.ts's setDayType — a newly-blocked day needs to disappear
 * from series-generated occurrences (§3), and a newly-opened one needs to
 * pick them back up. */
async function rematerializeAllSeries() {
  const seriesList = await prisma.assignmentSeries.findMany({ select: { id: true } });
  for (const series of seriesList) await materializeSeries(prisma, series.id);
}

/** §8 "import/enter Blue Ridge's academic calendar once" — a single day is
 * just a range where start equals end, so this is the one tool for both.
 * SchoolDay is per-student (§5's ad-hoc field trips/sick days need to be
 * settable for just one kid — see ParentWeekBoard.tsx's own day-type
 * toggle), so the family-wide academic calendar this page sets up is
 * simply the same date+type written for every student at once. */
export async function applyDayTypeRange(formData: FormData) {
  const startISO = String(formData.get("startDate") ?? "");
  const endISO = String(formData.get("endDate") ?? "");
  const type = String(formData.get("type") ?? SchoolDayType.schoolDay) as SchoolDayType;
  if (!startISO || !endISO) return;

  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  if (end < start) return;

  const students = await prisma.student.findMany({ select: { id: true } });

  // Snapshot every (student, date) pair's prior type before any of them
  // change — the loop below mutates as it goes, so this has to happen
  // first for the undo entry to reflect what was actually there before.
  const schoolDaySnapshots: { studentId: string; dateISO: string; previousType: SchoolDayType | null }[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const dateISO = toISODate(cursor);
    for (const student of students) {
      const existing = await prisma.schoolDay.findUnique({
        where: { date_studentId: { date: cursor, studentId: student.id } },
      });
      schoolDaySnapshots.push({ studentId: student.id, dateISO, previousType: existing?.type ?? null });
    }
  }

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    for (const student of students) {
      await setSchoolDayType(prisma, student.id, cursor, type);
    }
  }
  await rematerializeAllSeries();

  // Same catch-up as the single-day toggle (planner-actions.ts's
  // setDayType): recurring occurrences across the range are already gone
  // via rematerialization above; whatever standalone work is left on each
  // now-blocked day moves straight to the next school day, one date at a
  // time so a multi-day closure (a week-long trip, say) doesn't just pile
  // everything onto the first school day after the range starts.
  const movedInstances: { instanceId: string; previousDueDate: string; previousOriginalDueDate: string | null }[] = [];
  if (type !== SchoolDayType.schoolDay) {
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
      const dateISO = toISODate(cursor);
      for (const student of students) {
        const reschedulable = await findReschedulableInstances(prisma, student.id, cursor);
        for (const instance of reschedulable) {
          movedInstances.push({
            instanceId: instance.id,
            previousDueDate: dateISO,
            previousOriginalDueDate: instance.originalDueDate ? toISODate(instance.originalDueDate) : null,
          });
        }
        await applyRescheduleHelper(prisma, student.id, cursor, { mode: "nextSchoolDay" });
      }
    }
  }

  await recordUndo(
    prisma,
    "dayTypeChange",
    `Marked ${startISO}${endISO !== startISO ? ` – ${endISO}` : ""} ${describeDayType(type)} for everyone`,
    { schoolDays: schoolDaySnapshots, movedInstances }
  );

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

/** The family's Google Calendar, imported read-only via its "Secret
 * address in iCal format" — pasted in once here, then overlaid on every
 * day cell in Parent Mode (see familyCalendar.ts). */
export async function saveFamilyCalendarSettings(formData: FormData) {
  const icsUrl = String(formData.get("icsUrl") ?? "").trim();
  const timeZone = String(formData.get("timeZone") ?? "").trim();
  if (!icsUrl || !timeZone) return;

  await setFamilyCalendarSettings(prisma, icsUrl, timeZone);
  revalidatePath("/parent/calendar");
  revalidatePath("/parent");
}

export async function removeFamilyCalendarSettings() {
  await clearFamilyCalendarSettings(prisma);
  revalidatePath("/parent/calendar");
  revalidatePath("/parent");
}

/** The redesign's drag-or-tap-to-assign (README "Family calendar drag-and-
 * drop") — an event stays a calendar event, just linked to a student and
 * hidden from the shared agenda; see CalendarStrip/StudentBoard in
 * ParentWeekBoard.tsx. Replaces the old one-way "convert to a real to-do"
 * action entirely (a parent's own explicit call: the point is to show the
 * kid something else is going on, not to create checkable schoolwork). */
export async function assignCalendarEventAction(eventKey: string, studentId: string) {
  if (!eventKey || !studentId) return;
  await assignCalendarEvent(prisma, eventKey, studentId);
  revalidatePath("/parent");
}

/** The hover-✕ on an assigned event, under a student's own board — sends it
 * back to the shared agenda rather than deleting anything (the feed itself
 * is read-only). */
export async function unassignCalendarEventAction(eventKey: string, studentId: string) {
  if (!eventKey || !studentId) return;
  await unassignCalendarEvent(prisma, eventKey, studentId);
  revalidatePath("/parent");
}

/** ParentWeekBoard's CalendarEventRow hover-X — "delete" for a read-only
 * imported event can only mean "stop showing me this occurrence" (see
 * dismissCalendarEvent). `eventKey` is the event's own FamilyCalendarEvent.id. */
export async function dismissCalendarEventAction(eventKey: string) {
  if (!eventKey) return;
  await dismissCalendarEvent(prisma, eventKey);
  revalidatePath("/parent");
}
