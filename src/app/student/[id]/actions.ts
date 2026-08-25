"use server";

import { revalidatePath } from "next/cache";
import { InstanceStatus } from "@/generated/prisma/enums";
import { getToday, toISODate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { recomputeProjectStatus } from "@/lib/projects";
import { reorderOpenItems as reorderOpenItemsLib } from "@/lib/reorderInstances";
import { approveReview } from "@/lib/reviewActions";
import { secretsMatch } from "@/lib/session";
import { nextAccentColor } from "@/lib/theme";

/**
 * The student's only two verbs (§2): check and uncheck. §6's undo rule and
 * §5's "hold their day" rule both boil down to "only today is interactive" —
 * enforced here server-side regardless of what the client believes.
 */
export async function toggleInstance(instanceId: string): Promise<{ status: InstanceStatus }> {
  const instance = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });

  const today = toISODate(getToday());
  const dueToday = instance.dueDate && toISODate(instance.dueDate) === today;
  if (!dueToday) {
    throw new Error("Only today's items can be checked or unchecked.");
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

export async function reorderOpenItems(studentId: string, orderedIds: string[]): Promise<void> {
  await reorderOpenItemsLib(prisma, studentId, orderedIds);
  revalidatePath(`/student/${studentId}`);
}

/**
 * §5 step 2's "directly on the kids' machine via a passcode popover on the
 * pending item (one tap, passcode, done)." The kids' machine never has
 * Parent Mode's cookie set, so this checks the passcode itself rather than
 * relying on session state — same constant-time comparison the Parent Mode
 * unlock screen uses.
 */
export async function approveReviewViaPasscode(instanceId: string, passcode: string): Promise<void> {
  const expected = process.env.PARENT_PASSCODE;
  if (!expected) {
    throw new Error("PARENT_PASSCODE environment variable is not set.");
  }
  if (!secretsMatch(passcode, expected)) {
    throw new Error("Incorrect passcode.");
  }

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
  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
  const accentColor = nextAccentColor(student.accentColor);
  await prisma.student.update({ where: { id: studentId }, data: { accentColor } });
  revalidatePath(`/student/${studentId}`);
  revalidatePath("/parent");
  return { accentColor };
}
