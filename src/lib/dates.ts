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

// "Today," but overridable outside production so the Mon-Sat student view
// (and the server-side same-day check on check/uncheck) can be exercised on
// any day of the week without waiting for the calendar or touching the
// Mac's system clock. Gated to non-production and read only from an env
// var (never a query param), so it can't be used to spoof "today" from a
// URL, and it's a no-op in the deployed app regardless of env contents.
export function getToday(): Date {
  const override = process.env.NODE_ENV !== "production" ? process.env.DEBUG_TODAY : undefined;
  return override ? parseISODate(override) : startOfUTCDay(new Date());
}

// True when getToday() is pinned by DEBUG_TODAY. A real "today" advances
// daily, so the day-complete celebration's once-per-day localStorage guard
// (§6 step 6) naturally resets on its own; a frozen debug date never
// advances, so that guard would permanently block re-testing the moment
// after the first success. Callers use this to bypass the guard rather
// than change its (correct) production behavior.
export function isDebugToday(): boolean {
  return process.env.NODE_ENV !== "production" && !!process.env.DEBUG_TODAY;
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

// The default (no explicit ?week=) landing week. `mondayOf` treats Sunday as
// the tail end of the week that just finished, which is correct for "what
// week is this date in" but wrong for "what should I show by default" — on
// a Sunday (a day with no column in the six-day Mon-Sat view) it would land
// on a week that's entirely in the past. Default to the upcoming week instead.
export function defaultWeekStart(today: Date): Date {
  return today.getUTCDay() === 0 ? mondayOf(addDays(today, 1)) : mondayOf(today);
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Hand-rolled instead of Intl.DateTimeFormat: `toLocaleDateString` can format
// the same options differently between Node's ICU and a browser's (observed
// for weekday+day with no month — "17 Mon" server-side vs "Mon 17"
// client-side), which is a real hydration mismatch for any client component
// that renders one of these. Deterministic formatting can't disagree with itself.

export function formatDayLabel(date: Date): string {
  return `${WEEKDAY_SHORT[date.getUTCDay()]} ${date.getUTCDate()}`;
}

export function formatWeekLabel(date: Date): string {
  return `${MONTH_LONG[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

export function formatComingUpDate(date: Date): string {
  return `${WEEKDAY_SHORT[date.getUTCDay()]}, ${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
