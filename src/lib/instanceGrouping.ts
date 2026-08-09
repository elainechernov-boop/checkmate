import { InstanceStatus } from "@/generated/prisma/enums";

export interface DisplayInstance {
  id: string;
  title: string;
  status: InstanceStatus;
  rolledCount: number;
  requiresReview: boolean;
  originalDueDate: Date | null;
  createdAt: Date;
  subject: { id: string; name: string } | null;
  projectId: string | null;
}

/**
 * §6's column ordering, top to bottom: rolled items (oldest first) → open
 * items → pendingReview ("Show Mom") → completed (done/excused, muted).
 */
export function bucketDayInstances<T extends DisplayInstance>(instances: T[]) {
  const rolled = instances
    .filter((i) => i.status === InstanceStatus.open && i.rolledCount > 0)
    .sort((a, b) => (a.originalDueDate?.getTime() ?? 0) - (b.originalDueDate?.getTime() ?? 0));

  const open = instances.filter((i) => i.status === InstanceStatus.open && i.rolledCount === 0);
  const pendingReview = instances.filter((i) => i.status === InstanceStatus.pendingReview);
  const completed = instances.filter(
    (i) => i.status === InstanceStatus.done || i.status === InstanceStatus.excused
  );

  return { rolled, open, pendingReview, completed };
}

/** §5: "·· for two days, ×4 beyond three". */
export function formatRollMark(rolledCount: number): string | null {
  if (rolledCount <= 0) return null;
  if (rolledCount <= 3) return "·".repeat(rolledCount);
  return `×${rolledCount}`;
}
