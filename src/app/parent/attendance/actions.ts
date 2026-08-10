"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseISODate } from "@/lib/dates";
import { setAttendanceClaimed, setLearningPeriodAttendanceClaimed } from "@/lib/attendance";

/** The month grid's one-click toggle (§8) — `claimed` carries the day's
 * *current* state so the button flips it, rather than trusting a client
 * guess of what "checked" should mean. */
export async function toggleAttendanceDay(formData: FormData) {
  const studentId = String(formData.get("studentId") ?? "");
  const dateISO = String(formData.get("dateISO") ?? "");
  const currentlyClaimed = String(formData.get("claimed") ?? "") === "true";
  if (!studentId || !dateISO) return;
  await setAttendanceClaimed(prisma, studentId, parseISODate(dateISO), !currentlyClaimed);
  revalidatePath("/parent/attendance");
  revalidatePath("/parent");
}

/** The LP-level "claimed" checkbox (§8) — bulk-flips every day in the period. */
export async function toggleLearningPeriodClaimed(formData: FormData) {
  const studentId = String(formData.get("studentId") ?? "");
  const learningPeriodId = String(formData.get("learningPeriodId") ?? "");
  const currentlyAllClaimed = String(formData.get("claimed") ?? "") === "true";
  if (!studentId || !learningPeriodId) return;

  const lp = await prisma.learningPeriod.findUniqueOrThrow({ where: { id: learningPeriodId } });
  await setLearningPeriodAttendanceClaimed(prisma, studentId, lp.startDate, lp.endDate, !currentlyAllClaimed);
  revalidatePath("/parent/attendance");
  revalidatePath("/parent");
}
