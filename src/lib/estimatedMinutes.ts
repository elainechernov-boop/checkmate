import { InstanceStatus } from "@/generated/prisma/enums";

/** A day's estimated-minutes total, formatted for display (e.g. "1h 30m",
 * "45 min") — shared between Parent Mode's day cells and the student
 * view's own day columns, where showing it lets a long-looking list of
 * small items read as the modest total workload it actually is (§6/§9). */
export function formatTotalMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

// A task with no real estimate still costs *something* — without a
// fallback, a day full of untimed tasks reads as zero minutes of work,
// which makes both the "N min total" footer and the minutes-progress bar
// meaningless (a bar that's always 0/0 or undefined). Display-only, never
// written to the database — and deliberately excluded from Reports'
// per-subject hour totals (hstReport.ts keeps summing only real estimates,
// since those numbers can end up in a work-sample PDF export).
export const DEFAULT_ESTIMATED_MINUTES = 30;

export interface MinutesCandidate {
  estimatedMinutes: number | null;
  series?: { estimatedMinutes: number | null } | null;
  status: InstanceStatus;
}

function minutesFor(instance: MinutesCandidate): number {
  return instance.estimatedMinutes ?? instance.series?.estimatedMinutes ?? DEFAULT_ESTIMATED_MINUTES;
}

/** The day/board's full estimated-minutes total, with the 30-min fallback
 * applied to any task with no real estimate. */
export function sumEstimatedMinutes(instances: MinutesCandidate[]): number {
  return instances.reduce((sum, instance) => sum + minutesFor(instance), 0);
}

/** Minutes-done / minutes-total for a day's progress bar — "done" is
 * anything no longer `open` (done, pendingReview, and excused all count:
 * pendingReview means the work has been shown, not that it's still
 * outstanding — matching the day column's own bucket ordering). */
export function minutesProgress(instances: MinutesCandidate[]): { done: number; total: number } {
  const total = sumEstimatedMinutes(instances);
  const done = sumEstimatedMinutes(instances.filter((instance) => instance.status !== InstanceStatus.open));
  return { done, total };
}
