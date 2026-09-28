import { InstanceStatus } from "@/generated/prisma/enums";

export interface DisplayInstance {
  id: string;
  title: string;
  status: InstanceStatus;
  rolledCount: number;
  requiresReview: boolean;
  originalDueDate: Date | null;
  createdAt: Date;
  sortOrder: number;
  subject: { id: string; name: string } | null;
  projectId: string | null;
  // §12
  isTimeSensitive: boolean;
  scheduledTime: string | null;
}

/**
 * §6's column ordering, top to bottom: open items in parent-set order (§14 —
 * locked from the student's side), rolled-forward debts and time-sensitive
 * items (§12) included, wherever the parent placed them → pendingReview
 * ("Show Mom") → completed (done/excused, muted). Rolled items land at the
 * top of their new day when they roll (rollForward.ts), but that's only a
 * starting position — once the parent moves one, her order wins here too.
 */
export function bucketDayInstances<T extends DisplayInstance>(instances: T[]) {
  const byParentOrder = (a: T, b: T) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime();

  const timeSensitive = instances
    .filter((i) => i.status === InstanceStatus.open && i.isTimeSensitive)
    .sort((a, b) => (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? ""));

  const open = instances
    .filter((i) => i.status === InstanceStatus.open && !i.isTimeSensitive)
    .sort(byParentOrder);

  // Neither bucket used to sort at all — they just inherited whatever order
  // the base query happened to return, which could silently drift from
  // Parent Mode's own display (ParentWeekBoard sorts every row, regardless
  // of status, by this same sortOrder). Sorting both here the same way
  // keeps a "Show Mom"/done row in the same relative order on both sides,
  // however either side last reordered it.
  const pendingReview = instances
    .filter((i) => i.status === InstanceStatus.pendingReview)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const completed = instances
    .filter((i) => i.status === InstanceStatus.done || i.status === InstanceStatus.excused)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return { timeSensitive, open, pendingReview, completed };
}

/** BUILD_SPEC.md Screen 4-G: "Crimson » or »» appears immediately after the
 * title" — a single day rolled gets one », two or more get »». */
export function formatRollMark(rolledCount: number): string | null {
  if (rolledCount <= 0) return null;
  return rolledCount === 1 ? "»" : "»»";
}
