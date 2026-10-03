"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getScopedPrisma } from "@/lib/prisma";
import { PARENT_COOKIE, verifyParentSession } from "@/lib/session";
import { deleteRun, editRunClockTimes, TimeTrackingError } from "@/lib/timeTracking";

// §15's parent corrections: nudge a run's start or end, or delete a run. There
// is deliberately no "add time" — untimed work stays untimed.

/** Parent Mode's proxy already gates /parent, but a server action can be
 * posted to any route, and these rewrite what a kid's day is recorded as —
 * so the parent session is checked here too, not just at the door. */
async function requireParent(): Promise<void> {
  const cookieStore = await cookies();
  if (!verifyParentSession(cookieStore.get(PARENT_COOKIE)?.value)) {
    throw new Error("Parent Mode is locked.");
  }
}

function revalidateTimeViews() {
  revalidatePath("/parent");
  revalidatePath("/parent/time");
  revalidatePath("/student/[id]", "page");
}

export type RunEditResult = { ok: true } | { ok: false; error: string };

/** Start and end are `"HH:MM"` wall-clock values from the editor's time
 * inputs; a field left out keeps its stored value. */
export async function updateRunTimesAction(
  runId: string,
  edit: { start?: string | null; end?: string | null }
): Promise<RunEditResult> {
  await requireParent();
  const prisma = await getScopedPrisma();
  try {
    await editRunClockTimes(prisma, runId, edit);
  } catch (error) {
    // A rule the editor can explain ("That overlaps another run.") comes back
    // as text for the inline message; anything else is a real failure.
    if (error instanceof TimeTrackingError) return { ok: false, error: error.message };
    throw error;
  }
  revalidateTimeViews();
  return { ok: true };
}

export async function deleteRunAction(runId: string): Promise<void> {
  await requireParent();
  const prisma = await getScopedPrisma();
  await deleteRun(prisma, runId);
  revalidateTimeViews();
}
