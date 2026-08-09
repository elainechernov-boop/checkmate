"use server";

import { revalidatePath } from "next/cache";
import { InstanceStatus } from "@/generated/prisma/enums";
import { startOfUTCDay, toISODate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { reorderOpenItems as reorderOpenItemsLib } from "@/lib/reorderInstances";

/**
 * The student's only two verbs (§2): check and uncheck. §6's undo rule and
 * §5's "hold their day" rule both boil down to "only today is interactive" —
 * enforced here server-side regardless of what the client believes.
 */
export async function toggleInstance(instanceId: string): Promise<{ status: InstanceStatus }> {
  const instance = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });

  const today = toISODate(startOfUTCDay(new Date()));
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
    },
  });

  revalidatePath(`/student/${instance.studentId}`);
  return { status: updated.status };
}

export async function reorderOpenItems(studentId: string, orderedIds: string[]): Promise<void> {
  await reorderOpenItemsLib(prisma, studentId, orderedIds);
  revalidatePath(`/student/${studentId}`);
}
