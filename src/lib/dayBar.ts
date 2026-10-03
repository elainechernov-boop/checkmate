import { InstanceStatus } from "@/generated/prisma/enums";

/** One task's contribution to a day's bar. `loggedTodayMs` is time logged on
 * the day itself (by TimeEntry.date); `loggedEarlierMs` is whatever was logged
 * on earlier days — a task that rolled in already carries some of its work. */
export interface DayBarTask {
  status: InstanceStatus;
  estimatedMinutes: number | null;
  loggedTodayMs: number;
  loggedEarlierMs: number;
}

/** While any estimated task is still open the bar is held just short of full,
 * so an over-running last task can't read as "all done." */
export const DAY_BAR_HELD_SHORT = 0.99;

/**
 * §15's day bar: the fraction (0-1) of the day's *time actually worked*, or
 * null when no task carries a real estimate (the §5.4 rule — never invent
 * minutes, so a day with no estimates shows no bar).
 *
 *   worked    = time logged that day on estimated tasks, plus — for a task
 *               finished with none logged that day — the part of its estimate
 *               not already logged on earlier days (work checked off away from
 *               the Mac still counts as work done)
 *   remaining = for each still-open estimated task, its estimate minus all
 *               time logged on it so far, floored at zero
 *   fill      = worked / (worked + remaining)
 *
 * "Finished" is anything not open (done, pendingReview, or excused), matching
 * the bar this replaces. The fill reaches 1 exactly when every estimated task
 * is finished: a task that runs over fills at its real pace instead of pinning
 * the bar at 100% while work remains, and finishing early lets the leftover
 * snap forward.
 */
export function dayBarFill(tasks: DayBarTask[]): number | null {
  const estimated = tasks.filter((task) => task.estimatedMinutes != null && task.estimatedMinutes > 0);
  if (estimated.length === 0) return null;

  let workedMs = 0;
  let remainingMs = 0;
  let anyOpen = false;

  for (const task of estimated) {
    const estimateMs = task.estimatedMinutes! * 60_000;
    if (task.status === InstanceStatus.open) {
      anyOpen = true;
      workedMs += task.loggedTodayMs;
      remainingMs += Math.max(0, estimateMs - (task.loggedEarlierMs + task.loggedTodayMs));
    } else {
      workedMs += task.loggedTodayMs > 0 ? task.loggedTodayMs : Math.max(0, estimateMs - task.loggedEarlierMs);
    }
  }

  if (!anyOpen) return 1;
  const totalMs = workedMs + remainingMs;
  if (totalMs <= 0) return 0;
  return Math.min(DAY_BAR_HELD_SHORT, workedMs / totalMs);
}
