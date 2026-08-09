import type { AssignmentInstance, PrismaClient } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";

type ReviewablePrisma = Pick<PrismaClient, "assignmentInstance">;

/**
 * §5 step 2-3: the parent's sign-off on a "Show me the work" item. Moves
 * pendingReview -> done and stamps reviewedAt — completedAt was already set
 * the moment the student first checked it into review, and stays put.
 */
export async function approveReview(prisma: ReviewablePrisma, instanceId: string): Promise<void> {
  const instance = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });
  if (instance.status !== InstanceStatus.pendingReview) {
    throw new Error("Only a pendingReview item can be approved.");
  }

  await prisma.assignmentInstance.update({
    where: { id: instanceId },
    data: { status: InstanceStatus.done, reviewedAt: new Date() },
  });
}

/**
 * §5 step 4: "not your best work" — sends the item back to open with an
 * optional note beneath the title, clearing both timestamps so a later
 * genuine completion starts clean.
 */
export async function returnReview(
  prisma: ReviewablePrisma,
  instanceId: string,
  note: string | null
): Promise<void> {
  const instance = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: instanceId } });
  if (instance.status !== InstanceStatus.pendingReview) {
    throw new Error("Only a pendingReview item can be returned.");
  }

  await prisma.assignmentInstance.update({
    where: { id: instanceId },
    data: {
      status: InstanceStatus.open,
      completedAt: null,
      reviewedAt: null,
      returnNote: note?.trim() || null,
    },
  });
}

/** §3: "the later of the two feeds the attendance log." reviewedAt, when
 * present, is always the later timestamp (approval happens after the
 * student's own check), so it always wins over completedAt. */
export function attendanceDateFor(instance: Pick<AssignmentInstance, "completedAt" | "reviewedAt">): Date | null {
  return instance.reviewedAt ?? instance.completedAt;
}
