import { addDays, mondayOf } from "./dates";

// §15's Time dashboard ranges: This week (default), Last week, Last 4 weeks.
// Each is a run of whole Monday-to-Sunday weeks as inclusive UTC-midnight
// dates. The school week is Monday-Saturday (§6), but a Sunday head start on
// Monday's tasks is recorded as Sunday's work — a range that stopped at
// Saturday would hide it. A day with nothing tracked simply doesn't appear.

export type TimeRangeKey = "this" | "last" | "four";

export const TIME_RANGES: Array<{ key: TimeRangeKey; label: string }> = [
  { key: "this", label: "This week" },
  { key: "last", label: "Last week" },
  { key: "four", label: "Last 4 weeks" },
];

export function parseTimeRangeKey(value: string | undefined): TimeRangeKey {
  return value === "last" || value === "four" ? value : "this";
}

export function resolveTimeRange(key: TimeRangeKey, today: Date): { from: Date; to: Date } {
  // mondayOf, not defaultWeekStart: on a Sunday "this week" should be the week
  // that's ending — Sunday's own head start included — not the upcoming one
  // that has no data yet.
  const monday = mondayOf(today);
  switch (key) {
    case "last":
      return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case "four":
      return { from: addDays(monday, -21), to: addDays(monday, 6) };
    default:
      return { from: monday, to: addDays(monday, 6) };
  }
}
