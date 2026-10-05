import { describe, expect, it } from "vitest";
import { parseISODate, toISODate } from "./dates";
import { parseTimeRangeKey, resolveTimeRange } from "./timeRange";

const iso = (range: { from: Date; to: Date }) => [toISODate(range.from), toISODate(range.to)];

describe("time ranges (§15)", () => {
  it("this week runs Monday to Sunday, from any day of it", () => {
    for (const today of ["2026-09-28", "2026-10-01", "2026-10-03"]) {
      expect(iso(resolveTimeRange("this", parseISODate(today)))).toEqual(["2026-09-28", "2026-10-04"]);
    }
  });

  it("on a Sunday, 'this week' is the week that's ending, and includes that Sunday's head start", () => {
    expect(iso(resolveTimeRange("this", parseISODate("2026-10-04")))).toEqual(["2026-09-28", "2026-10-04"]);
  });

  it("last week is the one before, and the last 4 weeks end at this Sunday", () => {
    const today = parseISODate("2026-10-02");
    expect(iso(resolveTimeRange("last", today))).toEqual(["2026-09-21", "2026-09-27"]);
    expect(iso(resolveTimeRange("four", today))).toEqual(["2026-09-07", "2026-10-04"]);
  });

  it("falls back to this week for anything unrecognised", () => {
    expect(parseTimeRangeKey(undefined)).toBe("this");
    expect(parseTimeRangeKey("whenever")).toBe("this");
    expect(parseTimeRangeKey("four")).toBe("four");
    expect(parseTimeRangeKey("last")).toBe("last");
  });
});
