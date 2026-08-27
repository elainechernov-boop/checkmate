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

// HOMEROOM_UX_MIGRATION.md §5.4: "Do not invent 30 minutes for an
// unestimated item. Exclude null estimates from minute totals." This
// fallback exists only for reminders.ts's own live-state window
// computation (an untimed time-sensitive item still needs *some* duration
// to know when "live" ends) — it must never feed a workload total or
// progress bar, which is why it's isolated here rather than folded into
// minutesFor below.
export const DEFAULT_ESTIMATED_MINUTES = 30;

export interface MinutesCandidate {
  estimatedMinutes: number | null;
  series?: { estimatedMinutes: number | null } | null;
  status: InstanceStatus;
}

// Real estimate only — an instance with none contributes 0, not a guessed
// default, to every workload total below (see hstReport.ts, which already
// followed this same real-estimates-only rule for the same reason).
function minutesFor(instance: MinutesCandidate): number {
  return instance.estimatedMinutes ?? instance.series?.estimatedMinutes ?? 0;
}

/** Whether any instance in the list carries a real (non-null) estimate —
 * callers use this to decide whether a minutes total/progress bar means
 * anything for this set, vs. a day of entirely unestimated work where the
 * total would misleadingly read as "0 min". */
export function hasAnyEstimate(instances: MinutesCandidate[]): boolean {
  return instances.some((instance) => (instance.estimatedMinutes ?? instance.series?.estimatedMinutes ?? null) != null);
}

/** The day/board's full estimated-minutes total — real estimates only. */
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
