const DAY_MS = 24 * 60 * 60 * 1000;

// Dates are treated as plain calendar dates (no time-of-day), stored and
// compared at UTC midnight so the app behaves consistently regardless of
// the server's local timezone.

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseISODate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function startOfUTCDay(date: Date): Date {
  return parseISODate(toISODate(date));
}

export const WEEKDAYS = [
  { code: "mon", label: "Monday" },
  { code: "tue", label: "Tuesday" },
  { code: "wed", label: "Wednesday" },
  { code: "thu", label: "Thursday" },
  { code: "fri", label: "Friday" },
  { code: "sat", label: "Saturday" },
  { code: "sun", label: "Sunday" },
] as const;

export type WeekdayCode = (typeof WEEKDAYS)[number]["code"];

export function mondayOf(date: Date): Date {
  const utcDay = date.getUTCDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
  return addDays(date, diffToMonday);
}

export function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

export function formatWeekLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}
