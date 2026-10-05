"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { InstanceStatus } from "@/generated/prisma/enums";
import { getToday, toISODate } from "@/lib/dates";
import { prisma as baseClient, getCurrentFamily, getScopedPrisma } from "@/lib/prisma";
import { recomputeProjectStatus } from "@/lib/projects";
import { approveReview } from "@/lib/reviewActions";
import {
  FAMILY_COOKIE,
  getFamilyIdFromSession,
  hashSecret,
  secretMatchesHash,
  secretsMatch,
} from "@/lib/session";
import { nextAccentColor } from "@/lib/theme";
import {
  finishTimer,
  getTimerState,
  pauseTimer,
  pingTimer,
  startTimer,
  trimTimer,
  type PingResult,
  type TimerState,
} from "@/lib/timeTracking";
import { canWorkOn } from "@/lib/workAhead";

/**
 * The student's only two verbs (§2): check and uncheck. §6's undo rule and
 * §5's "hold their day" rule both boil down to "only today is interactive" —
 * enforced here server-side regardless of what the client believes.
 */
export async function toggleInstance(instanceId: string): Promise<{ status: InstanceStatus }> {
  const prisma = await getScopedPrisma();
  const instance = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });

  const today = toISODate(getToday());
  const dueToday = instance.dueDate && toISODate(instance.dueDate) === today;
  if (!dueToday) {
    // §15: on a Sunday, with time tracking on, tomorrow's (Monday's) tasks are
    // open for a head start — so a task finished that way can be unchecked too.
    const headStart = canWorkOn(instance.dueDate, getToday()) && (await getCurrentFamily()).timeTrackingEnabled;
    if (!headStart) {
      throw new Error("Only today's items can be checked or unchecked.");
    }
  }

  let nextStatus: InstanceStatus;
  if (instance.status === InstanceStatus.open) {
    nextStatus = instance.requiresReview ? InstanceStatus.pendingReview : InstanceStatus.done;
  } else if (instance.status === InstanceStatus.pendingReview || instance.status === InstanceStatus.done) {
    nextStatus = InstanceStatus.open;
  } else {
    // excused instances aren't toggleable by the student.
    return { status: instance.status };
  }

  const updated = await prisma.assignmentInstance.update({
    where: { id: instanceId },
    data: {
      status: nextStatus,
      completedAt: nextStatus === InstanceStatus.open ? null : new Date(),
      // A returned item's note (§5 step 4) is only meant to live until the
      // student acts on it again — checking it off a second time starts clean.
      ...(nextStatus !== InstanceStatus.open ? { returnNote: null } : {}),
    },
  });

  if (updated.projectId) await recomputeProjectStatus(prisma, updated.projectId);

  revalidatePath(`/student/${instance.studentId}`);
  return { status: updated.status };
}

/**
 * §5 step 2's "directly on the kids' machine via a passcode popover on the
 * pending item (one tap, passcode, done)." The kids' machine never has
 * Parent Mode's cookie set, so this checks the passcode itself rather than
 * relying on session state — same hashed-at-rest passcode (scoped to
 * whichever family this session belongs to) the Parent Mode unlock screen
 * checks; see parent/unlock/actions.ts for the identical legacy-env-var
 * bootstrap this shares.
 */
export async function approveReviewViaPasscode(instanceId: string, passcode: string): Promise<void> {
  const cookieStore = await cookies();
  const familyId = getFamilyIdFromSession(cookieStore.get(FAMILY_COOKIE)?.value);
  if (!familyId) {
    throw new Error("No family session.");
  }

  const family = await baseClient.family.findUniqueOrThrow({ where: { id: familyId } });

  let matched = false;
  if (family.parentPasscodeHash) {
    matched = secretMatchesHash(passcode, family.parentPasscodeHash);
  } else {
    const legacy = process.env.PARENT_PASSCODE;
    if (legacy && secretsMatch(passcode, legacy)) {
      await baseClient.family.update({
        where: { id: familyId },
        data: { parentPasscodeHash: hashSecret(passcode) },
      });
      matched = true;
    }
  }

  if (!matched) {
    throw new Error("Incorrect passcode.");
  }

  const prisma = await getScopedPrisma();
  const instance = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });
  await approveReview(prisma, instanceId);
  revalidatePath(`/student/${instance.studentId}`);
}

/**
 * README "New feature: student-editable accent color" — tapping a
 * student's own name advances it to the next color in the fixed rotation.
 * `Student.accentColor` already existed (parent/seed-writable only, per
 * §students/actions.ts); this is the first student-facing write path for it.
 */
export async function cycleAccentColorAction(studentId: string): Promise<{ accentColor: string }> {
  const prisma = await getScopedPrisma();
  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
  const accentColor = nextAccentColor(student.accentColor);
  await prisma.student.update({ where: { id: studentId }, data: { accentColor } });
  revalidatePath(`/student/${studentId}`);
  revalidatePath("/parent");
  return { accentColor };
}

// ---- §15: the per-task timer ----
//
// Every action below is a thin wrapper over lib/timeTracking.ts, which owns
// the rules (one open run per student, the sub-10-second discard, lapse
// sweeping). Timestamps are the server's — see §15 "Recording rules."

async function requireTimeTracking(): Promise<void> {
  const family = await getCurrentFamily();
  if (!family.timeTrackingEnabled) {
    throw new Error("Time tracking is turned off for this family.");
  }
}

/** Start (or resume) the clock on a task and return its timer state. Only
 * today's open items can be timed — enforced in startTimer itself. */
export async function startTimerAction(instanceId: string): Promise<TimerState> {
  await requireTimeTracking();
  const prisma = await getScopedPrisma();
  await startTimer(prisma, instanceId);
  const state = await getTimerState(prisma, instanceId);
  revalidatePath("/student/[id]", "page");
  return state;
}

/** Pause closes the current run; the returned state reflects it. */
export async function pauseTimerAction(instanceId: string): Promise<TimerState> {
  await requireTimeTracking();
  const prisma = await getScopedPrisma();
  await pauseTimer(prisma, instanceId);
  const state = await getTimerState(prisma, instanceId);
  revalidatePath("/student/[id]", "page");
  return state;
}

/** The open timer screen's 30-second heartbeat. No revalidation — nothing
 * on the page changes. */
export async function pingTimerAction(instanceId: string): Promise<PingResult> {
  await requireTimeTracking();
  const prisma = await getScopedPrisma();
  return pingTimer(prisma, instanceId);
}

/** "Welcome back — keep that time?" answered no: end the run where it stood
 * before the window went quiet. */
export async function trimTimerAction(instanceId: string, endAtMs: number): Promise<TimerState> {
  await requireTimeTracking();
  if (!Number.isFinite(endAtMs)) throw new Error("A time is required.");
  const prisma = await getScopedPrisma();
  await trimTimer(prisma, instanceId, endAtMs);
  const state = await getTimerState(prisma, instanceId);
  revalidatePath("/student/[id]", "page");
  return state;
}

export async function getTimerStateAction(instanceId: string): Promise<TimerState> {
  await requireTimeTracking();
  const prisma = await getScopedPrisma();
  return getTimerState(prisma, instanceId);
}

/**
 * Finish: stops the clock and completes the item in one transaction, exactly
 * the transition a title tap used to make (pendingReview for "Show me" work,
 * otherwise done). The client plays §6's completion moment on the week view
 * once the timer screen has dismissed.
 */
export async function finishTimerAction(instanceId: string): Promise<{ status: InstanceStatus }> {
  await requireTimeTracking();
  const prisma = await getScopedPrisma();
  const instance = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });
  const { status } = await finishTimer(prisma, instanceId);
  if (instance.projectId) await recomputeProjectStatus(prisma, instance.projectId);
  // Deliberately no revalidatePath here. The clock stops and the item is
  // completed server-side the instant Finish is pressed, but the week view is
  // still drawing the strike (~280ms). A revalidation would hand the client
  // "everything's done" before the student's own animation ends, and the day
  // column would treat the day's completion as something that happened to them
  // — a quiet "Finish the day" prompt instead of the full-screen celebration.
  // The client refreshes itself once the sequence has played.
  return { status };
}
