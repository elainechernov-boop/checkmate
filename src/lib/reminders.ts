// §12: time-sensitive assignments — the reminder window, time formatting,
// and the client-side "already reminded today" guard (localStorage, same
// pattern as completionSound.ts's mute flag and StudentWeekView's
// celebratedKey).
import { InstanceStatus } from "@/generated/prisma/enums";

export interface ReminderCandidate {
  id: string;
  status: InstanceStatus;
  isTimeSensitive: boolean;
  scheduledTime: string | null;
  reminderMinutesBefore: number | null;
}

// The window stays open until this long after the scheduled time, so a
// student who opens the app a little late for online Latin still gets
// nudged instead of silently missing the reminder entirely.
const GRACE_MINUTES_AFTER = 15;

function parseTimeOn(time: string, referenceDay: Date): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const result = new Date(referenceDay);
  result.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return result;
}

/** Whether `now` falls inside `instance`'s reminder window. `now` also
 * supplies the calendar day scheduledTime is interpreted on — callers only
 * ever check today's own instances, so this is always "now"'s local date. */
export function isReminderDue(instance: ReminderCandidate, now: Date): boolean {
  if (!instance.isTimeSensitive || !instance.scheduledTime || instance.reminderMinutesBefore == null) return false;
  if (instance.status !== InstanceStatus.open) return false;

  const scheduled = parseTimeOn(instance.scheduledTime, now);
  if (!scheduled) return false;

  const remindAt = new Date(scheduled.getTime() - instance.reminderMinutesBefore * 60_000);
  const expiresAt = new Date(scheduled.getTime() + GRACE_MINUTES_AFTER * 60_000);
  return now >= remindAt && now <= expiresAt;
}

/** "15:00" -> "3:00 PM". Falls back to the raw string if it's malformed. */
export function formatScheduledTime(time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour24 = Number(match[1]);
  const minute = match[2];
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${period}`;
}

const REMINDED_KEY_PREFIX = "checkmate:reminded:";

function remindedKey(studentId: string, instanceId: string, dayISO: string): string {
  return `${REMINDED_KEY_PREFIX}${studentId}:${instanceId}:${dayISO}`;
}

export function hasBeenReminded(studentId: string, instanceId: string, dayISO: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(remindedKey(studentId, instanceId, dayISO)) === "1";
}

export function markReminded(studentId: string, instanceId: string, dayISO: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(remindedKey(studentId, instanceId, dayISO), "1");
}
