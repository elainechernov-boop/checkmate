import { addDays, toISODate } from "./dates";

// §15: a head start on tomorrow. The student week is Monday-Saturday (§6), so
// on a Sunday there's no column for "today" and, until now, nothing to work
// on. With time tracking on, a Sunday opens up the coming Monday's tasks: the
// student can start the clock on them, and the time is recorded as Sunday's
// work (a run is always dated the day it actually happened). The tasks stay
// due Monday.

/** The day whose tasks can be worked on ahead of time: Monday, when today is
 * Sunday — otherwise nothing (a weekday has its own column to work from). */
export function workAheadDate(today: Date): Date | null {
  return today.getUTCDay() === 0 ? addDays(today, 1) : null;
}

/** Whether a task due on `dueDate` can be timed (and finished, and unchecked)
 * today: it's due today, or today is a Sunday and it's due the next day. */
export function canWorkOn(dueDate: Date | null, today: Date): boolean {
  if (!dueDate) return false;
  const dueISO = toISODate(dueDate);
  if (dueISO === toISODate(today)) return true;
  const ahead = workAheadDate(today);
  return ahead !== null && dueISO === toISODate(ahead);
}
