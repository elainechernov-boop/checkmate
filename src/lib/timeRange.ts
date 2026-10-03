import { addDays, mondayOf } from "./dates";

// §15's Time dashboard ranges: This week (default), Last week, Last 4 weeks.
// Each is a run of Monday-to-Saturday school weeks (§6's six columns), as
// inclusive UTC-midnight dates.

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
  // mondayOf, not defaultWeekStart: on a Sunday "this week" should be the
  // school week that just finished, not the upcoming one that has no data yet.
  const monday = mondayOf(today);
  switch (key) {
    case "last":
      return { from: addDays(monday, -7), to: addDays(monday, -2) };
    case "four":
      return { from: addDays(monday, -21), to: addDays(monday, 5) };
    default:
      return { from: monday, to: addDays(monday, 5) };
  }
}
