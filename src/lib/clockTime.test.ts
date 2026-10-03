import { describe, expect, it } from "vitest";
import { formatClockTime, formatDurationMs, formatElapsed, wallClockInstant, zonedDateISO } from "./clockTime";

describe("clockTime (§15's one timezone)", () => {
  it("reads a clock time in the app's timezone, not the machine's", () => {
    // 16:42 UTC is 9:42 AM in Los Angeles during daylight time.
    expect(formatClockTime(new Date("2026-09-08T16:42:00Z"))).toBe("9:42 AM");
    // ...and 8:42 AM in winter.
    expect(formatClockTime(new Date("2026-12-08T16:42:00Z"))).toBe("8:42 AM");
  });

  it("formats noon, midnight, and the afternoon", () => {
    expect(formatClockTime(new Date("2026-09-08T19:00:00Z"))).toBe("12:00 PM");
    expect(formatClockTime(new Date("2026-09-08T07:05:00Z"))).toBe("12:05 AM");
    expect(formatClockTime(new Date("2026-09-08T21:30:00Z"))).toBe("2:30 PM");
  });

  it("names the calendar day an instant falls on in the app's timezone", () => {
    // 02:00 UTC on the 9th is still the evening of the 8th in Los Angeles.
    expect(zonedDateISO(new Date("2026-09-09T02:00:00Z"))).toBe("2026-09-08");
    expect(zonedDateISO(new Date("2026-09-09T08:00:00Z"))).toBe("2026-09-09");
  });

  it("turns a wall-clock HH:MM into the right instant, in daylight and standard time", () => {
    expect(wallClockInstant("2026-09-08", "09:00").toISOString()).toBe("2026-09-08T16:00:00.000Z");
    expect(wallClockInstant("2026-12-08", "09:00").toISOString()).toBe("2026-12-08T17:00:00.000Z");
  });

  it("round-trips a wall-clock time through formatClockTime", () => {
    expect(formatClockTime(wallClockInstant("2026-09-08", "13:45"))).toBe("1:45 PM");
    expect(formatClockTime(wallClockInstant("2026-03-08", "09:00"))).toBe("9:00 AM"); // the spring-forward day
  });

  it("formats elapsed time as the big timer digits", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(7)).toBe("0:07");
    expect(formatElapsed(754)).toBe("12:34");
    expect(formatElapsed(3600 + 2 * 60 + 34)).toBe("1:02:34");
    expect(formatElapsed(-5)).toBe("0:00");
  });

  it("formats dashboard durations to the minute, never '0 min' for something real", () => {
    expect(formatDurationMs(0)).toBe("0 min");
    expect(formatDurationMs(20_000)).toBe("<1 min");
    expect(formatDurationMs(45 * 60_000)).toBe("45 min");
    expect(formatDurationMs((2 * 60 + 46) * 60_000)).toBe("2h 46m");
    expect(formatDurationMs(120 * 60_000)).toBe("2h");
  });
});
