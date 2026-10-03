import { APP_TIME_ZONE } from "./dates";
import { formatTotalMinutes } from "./estimatedMinutes";

// §15 clock-time helpers. Everything here reads or writes wall-clock time in
// the app's one timezone (dates.ts's APP_TIME_ZONE) — the server runs in UTC
// and a browser may not be in the family's zone, so a run's "9:42 AM" must be
// decided here rather than by whichever machine happens to render it. Parts
// are pulled out with Intl and formatted by hand, for the same reason
// dates.ts hand-rolls its labels: Intl's *formatted* strings can differ
// between Node's ICU and a browser's, which is a real hydration mismatch for
// any client component that renders one.

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function zonedParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** The calendar day (YYYY-MM-DD) an instant falls on in the app's timezone. */
export function zonedDateISO(date: Date): string {
  const { year, month, day } = zonedParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Offset of the app timezone from UTC at an instant: the wall-clock reading
// taken as if it were UTC, minus the instant itself (negative west of UTC).
function zoneOffsetMs(ms: number): number {
  const p = zonedParts(new Date(ms));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** The instant a plain `"HH:MM"` wall-clock time on `dateISO` means in the
 * app's timezone — how a family's `schoolDayStartTime` becomes comparable to
 * a run's real `startedAt`. Settled twice so a time near a DST change lands
 * on the right side of it. */
export function wallClockInstant(dateISO: string, hhmm: string): Date {
  const [year, month, day] = dateISO.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const first = naive - zoneOffsetMs(naive);
  return new Date(naive - zoneOffsetMs(first));
}

/** "9:42 AM" — the time of day an instant falls on in the app's timezone. */
export function formatClockTime(date: Date): string {
  const { hour, minute } = zonedParts(date);
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** "09:42" — the same instant as an `<input type="time">` value, in the app's
 * timezone. The parent's run editor round-trips through this and
 * wallClockInstant. */
export function formatClockInput(date: Date): string {
  const { hour, minute } = zonedParts(date);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** The timer screen's big digits: "12:34", becoming "1:02:34" past an hour. */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** A span for the dashboard — "45 min", "2h 46m" — rounded to the minute;
 * anything real but under a minute reads "<1 min" rather than "0 min". */
export function formatDurationMs(ms: number): string {
  if (ms <= 0) return "0 min";
  const minutes = Math.round(ms / 60_000);
  return minutes === 0 ? "<1 min" : formatTotalMinutes(minutes);
}
